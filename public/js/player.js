/**
 * IPTV Player V2 - Universal Video Player Controller
 * Rock-solid playback engine with:
 *  - HLS.js for .m3u8 adaptive HTTP Live Streaming
 *  - mpegts.js for real-time MPEG-TS (.ts) demuxing via MediaSource Extensions (MSE)
 *  - Native HTML5 Video with Range header streaming for VOD (MP4/MKV)
 *  - Automatic failover: if HLS fails, automatically switches to MPEG-TS
 *  - Interactive format switcher: toggle between HLS and TS on the fly
 *  - Intelligent CORS proxy integration with server-side playlist rewriting
 *  - Stall detection, auto-recovery, and detailed diagnostic error states
 */

import { XtreamAPI } from './api.js';

export class VideoPlayer {
  constructor() {
    this.modal = document.getElementById('player-modal-overlay');
    this.video = document.getElementById('main-video-player');
    this.titleEl = document.getElementById('player-stream-title');
    this.typeBadge = document.getElementById('player-type-badge');
    this.formatBadge = document.getElementById('player-format-badge');
    this.loadingSpinner = document.getElementById('player-loading');
    this.loadingMsg = null;
    this.errorBanner = document.getElementById('player-error');
    this.closeBtn = document.getElementById('player-close-btn');

    this.hls = null;
    this.mpegtsPlayer = null;
    this.currentStream = null;

    // Stall / timeout detection
    this.stallTimer = null;
    this.loadStartTime = 0;
    this.loadingInterval = null;
    this.retryCount = 0;
    this.maxRetries = 2;

    this.initEvents();
  }

  initEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    // Interactive format badge: click to switch between HLS and TS
    if (this.formatBadge) {
      this.formatBadge.addEventListener('click', () => {
        this.toggleStreamFormat();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.isOpen()) {
        if (e.key === 'Escape') {
          this.close();
        } else if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
          e.preventDefault();
          this.togglePlay();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          this.toggleStreamFormat();
        }
      }
    });

    if (this.video) {
      this.video.addEventListener('waiting', () => {
        this.showLoading('Bufferizzazione in corso...');
      });

      this.video.addEventListener('playing', () => {
        this.hideLoading();
        this.clearStallTimer();
        if (this.errorBanner) this.errorBanner.style.display = 'none';
        this.retryCount = 0; // Reset retry counter on successful playback
      });

      this.video.addEventListener('stalled', () => {
        console.warn('Video stalled event triggered');
        this.showLoading('Stream in stallo, recupero buffer...');
        this.startStallTimer();
      });

      this.video.addEventListener('error', () => {
        const mediaErr = this.video.error;
        const code = mediaErr ? mediaErr.code : 'unknown';
        const msg = mediaErr?.message || '';
        console.warn('HTML5 Video error:', code, msg);

        // If native video failed on a live stream, try fallback format
        if (this.currentStream && this.currentStream.type === 'live') {
          this.handlePlaybackError(`Errore di riproduzione (codice ${code}).`);
        } else {
          this.showError(`Errore video (${code}): ${msg || 'Formato o codec non supportato dal browser.'}`);
        }
      });
    }
  }

  isOpen() {
    return this.modal && this.modal.classList.contains('active');
  }

  /**
   * Wrap a remote stream URL through our local CORS proxy.
   * Ensures browser never blocks cross-origin media requests.
   */
  proxyWrapUrl(url) {
    if (!url) return url;
    if (url.startsWith('/api/')) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    const loc = window.location;
    const origin = `${loc.protocol}//${loc.host}`;
    if (url.startsWith(origin)) return url;

    // Public test streams with CORS don't strictly need proxy
    if (url.includes('mux.dev') || url.includes('commondatastorage.googleapis.com')) {
      return url;
    }

    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }

  /**
   * Main entry point for playing any stream or episode
   */
  play(streamUrl, title, type = 'live', item = null, account = null) {
    // Determine initial format
    let initialFormat = 'm3u8';
    if (type === 'live') {
      if (streamUrl.includes('.ts')) {
        initialFormat = 'ts';
      } else {
        initialFormat = 'm3u8';
      }
    } else {
      initialFormat = 'vod';
    }

    this.currentStream = {
      streamUrl,
      title,
      type,
      item,
      account,
      currentFormat: initialFormat
    };

    this.retryCount = 0;
    this._startPlayback();
  }

  _startPlayback() {
    if (!this.currentStream) return;
    const { title, type, currentFormat } = this.currentStream;

    if (this.titleEl) this.titleEl.textContent = title || 'Riproduzione Stream';

    if (this.typeBadge) {
      this.typeBadge.textContent = type.toUpperCase();
      this.typeBadge.className = `badge badge-${type === 'movie' ? 'vod' : type}`;
    }

    this.updateFormatBadge(currentFormat);

    this.loadStartTime = Date.now();
    this.showLoading(`Connessione (${currentFormat.toUpperCase()})...`);
    if (this.errorBanner) this.errorBanner.style.display = 'none';
    if (this.modal) this.modal.classList.add('active');

    // Clean up any existing media pipelines
    this._destroyPlayers();
    this.clearStallTimer();

    // Route playback by format
    if (type === 'live') {
      if (currentFormat === 'm3u8') {
        this._playHls();
      } else {
        this._playMpegts();
      }
    } else {
      // VOD / Series episode: use native video with Range-enabled proxy
      const proxiedUrl = this.proxyWrapUrl(this.currentStream.streamUrl);
      this._playNative(proxiedUrl);
    }

    this.startStallTimer();
  }

  updateFormatBadge(format) {
    if (!this.formatBadge) return;
    const isLive = this.currentStream && this.currentStream.type === 'live';
    if (!isLive) {
      this.formatBadge.style.display = 'none';
      return;
    }

    this.formatBadge.style.display = 'inline-block';
    this.formatBadge.textContent = format.toUpperCase();
    this.formatBadge.title = `Formato attivo: ${format.toUpperCase()}. Clicca per passare a ${format === 'm3u8' ? 'TS' : 'HLS'}`;
  }

  /**
   * Switch stream format manually (HLS <-> TS)
   */
  toggleStreamFormat() {
    if (!this.currentStream || this.currentStream.type !== 'live') return;

    const nextFormat = this.currentStream.currentFormat === 'm3u8' ? 'ts' : 'm3u8';
    console.log(`Manual format switch to: ${nextFormat}`);

    this.currentStream.currentFormat = nextFormat;

    // Reconstruct stream URL for target format if account and item metadata are present
    if (this.currentStream.account && this.currentStream.item) {
      this.currentStream.streamUrl = XtreamAPI.buildStreamUrl(
        this.currentStream.account,
        this.currentStream.item,
        'live',
        nextFormat
      );
    } else {
      // Fallback string replacement
      if (nextFormat === 'ts') {
        this.currentStream.streamUrl = this.currentStream.streamUrl.replace('.m3u8', '.ts');
      } else {
        this.currentStream.streamUrl = this.currentStream.streamUrl.replace('.ts', '.m3u8');
      }
    }

    this.retryCount = 0;
    this._startPlayback();
  }

  /**
   * Play live stream via HLS.js with server-side rewritten manifests
   */
  _playHls() {
    const rawUrl = this.currentStream.streamUrl;
    const proxiedUrl = this.proxyWrapUrl(rawUrl);

    if (!window.Hls || !window.Hls.isSupported()) {
      if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        this._playNative(proxiedUrl);
        return;
      }
      console.warn('HLS.js not supported in this browser, trying MPEG-TS...');
      this.fallbackToTs('HLS non supportato nel browser. Tentativo MPEG-TS...');
      return;
    }

    this.hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000000,
      maxBufferHole: 0.5,
      maxStarvationDelay: 4,
      startLevel: -1,
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 5,
      fragLoadingRetryDelay: 1000,
      abrEwmaDefaultEstimate: 500000,
      startFragPrefetch: true,
      progressive: true
    });

    // Our Python proxy automatically rewrites all segment URLs in the .m3u8 to /api/proxy?url=...
    // so HLS.js loads everything through the proxy effortlessly
    this.hls.loadSource(proxiedUrl);
    this.hls.attachMedia(this.video);

    this.hls.on(window.Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log(`HLS Manifest loaded (${data.levels.length} quality levels)`);
      this.showLoading(`Stream HLS avviato (${data.levels.length} qualità)...`);
      this.video.play().catch(err => {
        console.log('Autoplay prevented:', err);
        this.showLoading('Clicca sul video per avviare la riproduzione');
      });
    });

    this.hls.on(window.Hls.Events.FRAG_LOADED, () => {
      this.clearStallTimer();
    });

    this.hls.on(window.Hls.Events.ERROR, (event, data) => {
      console.warn('HLS Error event:', data.type, data.details, data.fatal);

      if (data.fatal) {
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            // If manifest cannot be fetched, this channel likely only exists as MPEG-TS
            if (data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut') {
              console.warn('HLS manifest load failed, auto-failing over to MPEG-TS (.ts)');
              this.fallbackToTs('Manifest HLS non disponibile. Passaggio a MPEG-TS...');
            } else {
              console.warn('HLS Network error, attempting recovery...');
              this.showLoading('Recupero connessione di rete...');
              this.hls.startLoad();
            }
            break;

          case window.Hls.ErrorTypes.MEDIA_ERROR:
            console.warn('HLS Media error, attempting recovery...');
            this.showLoading('Errore decodifica media, recupero...');
            this.hls.recoverMediaError();
            break;

          default:
            this.fallbackToTs('Errore fatale flusso HLS. Tentativo MPEG-TS...');
            break;
        }
      }
    });
  }

  /**
   * Play live stream via mpegts.js (MSE demuxer for raw .ts streams)
   */
  _playMpegts() {
    let tsUrl = this.currentStream.streamUrl;

    // Ensure URL has .ts format or is Xtream TS path
    if (this.currentStream.account && this.currentStream.item) {
      tsUrl = XtreamAPI.buildStreamUrl(this.currentStream.account, this.currentStream.item, 'live', 'ts');
    } else if (tsUrl.includes('.m3u8')) {
      tsUrl = tsUrl.replace('.m3u8', '.ts');
    }

    const proxiedTsUrl = this.proxyWrapUrl(tsUrl);
    console.log(`Playing MPEG-TS via mpegts.js: ${proxiedTsUrl}`);

    if (window.mpegts && window.mpegts.isSupported()) {
      try {
        this.mpegtsPlayer = window.mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url: proxiedTsUrl
        }, {
          enableWorker: true,
          lazyLoad: false,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 3.5,
          liveBufferLatencyMinRemain: 1.0,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 30,
          autoCleanupMinBackwardDuration: 15
        });

        this.mpegtsPlayer.attachMediaElement(this.video);
        this.mpegtsPlayer.load();

        this.mpegtsPlayer.on(window.mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
          console.warn('mpegts.js error:', errorType, errorDetail, errorInfo);
          this.handlePlaybackError(`Errore MPEG-TS (${errorDetail || errorType}).`);
        });

        this.mpegtsPlayer.play().catch(err => {
          console.log('mpegts autoplay blocked:', err);
          this.showLoading('Clicca sul video per avviare la riproduzione');
        });

      } catch (err) {
        console.error('Failed to create mpegts player:', err);
        this.handlePlaybackError('Impossibile inizializzare il motore MPEG-TS: ' + err.message);
      }
    } else {
      // Fallback to native video
      console.warn('mpegts.js is not supported, trying native video');
      this._playNative(proxiedTsUrl);
    }
  }

  /**
   * Fallback to TS format when HLS is unavailable
   */
  fallbackToTs(msg = 'Passaggio al formato MPEG-TS (.ts)...') {
    if (!this.currentStream || this.currentStream.type !== 'live') return;

    if (this.currentStream.currentFormat === 'ts') {
      // Already on TS, trigger error
      this.handlePlaybackError('Impossibile caricare il canale sia in HLS che in MPEG-TS.');
      return;
    }

    this.showLoading(msg);
    this._destroyPlayers();

    setTimeout(() => {
      if (!this.isOpen()) return;
      this.currentStream.currentFormat = 'ts';
      this.updateFormatBadge('ts');
      this._playMpegts();
    }, 400);
  }

  /**
   * Native HTML5 video playback (for VOD MP4/MKV)
   */
  _playNative(url) {
    this.video.src = url;
    this.video.load();
    this.video.play().catch(err => {
      console.log('Native autoplay prevented:', err);
      this.showLoading('Clicca sul video per avviare la riproduzione');
    });
  }

  _destroyPlayers() {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch (e) {
        console.warn('Error destroying HLS:', e);
      }
      this.hls = null;
    }

    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.pause();
        this.mpegtsPlayer.unload();
        this.mpegtsPlayer.detachMediaElement();
        this.mpegtsPlayer.destroy();
      } catch (e) {
        console.warn('Error destroying mpegts player:', e);
      }
      this.mpegtsPlayer = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  // --- Stall Detection & Auto-Recovery ---

  startStallTimer() {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      if (this.isOpen() && this.video && (this.video.paused || this.video.readyState < 3)) {
        console.warn('Stall timer expired (25s without playback)');
        if (this.currentStream && this.currentStream.type === 'live' && this.currentStream.currentFormat === 'm3u8') {
          console.log('Stall on HLS, attempting automatic fallback to TS...');
          this.fallbackToTs('HLS lento o in stallo. Passaggio a MPEG-TS...');
        } else {
          this.handlePlaybackError(
            'Lo stream impiega troppo tempo a caricare. Il server IPTV potrebbe essere lento o il canale non disponibile.'
          );
        }
      }
    }, 22000);
  }

  clearStallTimer() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  handlePlaybackError(message) {
    this.clearStallTimer();

    if (!this.currentStream) return;
    const { type, currentFormat } = this.currentStream;

    // If HLS failed, automatically try TS
    if (type === 'live' && currentFormat === 'm3u8') {
      this.fallbackToTs('HLS non riuscito. Tentativo automatico MPEG-TS (.ts)...');
      return;
    }

    // Auto-retry once more if retryCount allows
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.showLoading(`Riconnessione allo stream (tentativo ${this.retryCount}/${this.maxRetries})...`);
      setTimeout(() => {
        if (this.isOpen()) {
          this._startPlayback();
        }
      }, 1000);
      return;
    }

    this.showError(message);
  }

  // --- UI Helpers ---

  showLoading(msg) {
    if (this.loadingSpinner) {
      this.loadingSpinner.style.display = 'flex';
      if (!this.loadingMsg) {
        this.loadingMsg = this.loadingSpinner.querySelector('.loading-status-text');
      }
      if (this.loadingMsg) {
        this.loadingMsg.textContent = msg || 'Bufferizzazione stream...';
      }
    }
    if (!this.loadingInterval && this.loadingSpinner) {
      const timerEl = this.loadingSpinner.querySelector('.loading-elapsed');
      if (timerEl) {
        this.loadingInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - this.loadStartTime) / 1000);
          timerEl.textContent = `${elapsed}s`;
        }, 500);
      }
    }
  }

  hideLoading() {
    if (this.loadingSpinner) this.loadingSpinner.style.display = 'none';
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
  }

  showError(msg) {
    this.hideLoading();
    if (!this.errorBanner) return;

    const isLive = this.currentStream && this.currentStream.type === 'live';
    const altFormat = isLive && this.currentStream.currentFormat === 'm3u8' ? 'TS' : 'HLS';

    this.errorBanner.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">${msg}</div>
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <button id="player-retry-btn" style="padding: 7px 16px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.18); color: #fff; border-radius: 8px; font-weight: 600; cursor: pointer;">
          🔄 Riprova
        </button>
        ${isLive ? `
          <button id="player-switch-fmt-btn" style="padding: 7px 16px; border: 1px solid #3b82f6; background: rgba(59,130,246,0.3); color: #93c5fd; border-radius: 8px; font-weight: 600; cursor: pointer;">
            ⚡ Prova Formato ${altFormat}
          </button>
        ` : ''}
        <button id="player-close-err-btn" style="padding: 7px 16px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.7); border-radius: 8px; font-weight: 600; cursor: pointer;">
          ✕ Chiudi
        </button>
      </div>
    `;
    this.errorBanner.style.display = 'block';

    const retryBtn = document.getElementById('player-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (this.currentStream) {
          this.retryCount = 0;
          this._startPlayback();
        }
      });
    }

    const switchFmtBtn = document.getElementById('player-switch-fmt-btn');
    if (switchFmtBtn) {
      switchFmtBtn.addEventListener('click', () => {
        this.toggleStreamFormat();
      });
    }

    const closeErrBtn = document.getElementById('player-close-err-btn');
    if (closeErrBtn) {
      closeErrBtn.addEventListener('click', () => this.close());
    }
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  toggleFullscreen() {
    if (!this.video) return;
    if (!document.fullscreenElement) {
      const wrapper = this.video.closest('.player-modal') || this.video;
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen();
      } else if (wrapper.webkitRequestFullscreen) {
        wrapper.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  close() {
    this.clearStallTimer();
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    this._destroyPlayers();
    if (this.modal) {
      this.modal.classList.remove('active');
    }
    this.currentStream = null;
    this.retryCount = 0;
  }
}
