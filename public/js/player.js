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

import { XtreamAPI } from './api.js?v=3.0';
import { UIManager } from './ui.js?v=3.0';
import { WatchHistoryManager } from './history.js?v=3.0';

export class VideoPlayer {
  constructor() {
    this.modal = document.getElementById('player-modal-overlay');
    this.video = document.getElementById('main-video-player');
    this.titleEl = document.getElementById('player-stream-title');
    this.typeBadge = document.getElementById('player-type-badge');
    this.formatBadge = document.getElementById('player-format-badge');
    this.audioBadge = document.getElementById('player-audio-badge');
    this.loadingSpinner = document.getElementById('player-loading');
    this.loadingMsg = null;
    this.errorBanner = document.getElementById('player-error');
    this.closeBtn = document.getElementById('player-close-btn');

    // Custom Audio & Volume Engine Elements
    this.muteBtn = document.getElementById('player-mute-btn');
    this.volumeSlider = document.getElementById('player-volume-slider');
    this.volumeLabel = document.getElementById('player-volume-label');
    this.boostBtn = document.getElementById('player-boost-btn');
    this.vlcBtn = document.getElementById('player-vlc-btn');

    // Smart Audio Notice Banner
    this.audioNotice = document.getElementById('player-audio-notice');
    this.btnFixAudioTranscode = document.getElementById('btn-fix-audio-transcode');
    this.btnFixAudioVlc = document.getElementById('btn-fix-audio-vlc');
    this.btnDismissAudioNotice = document.getElementById('btn-dismiss-audio-notice');

    // Video Container
    this.videoWrapper = document.getElementById('player-video-wrapper') || document.querySelector('.player-video-wrapper');

    // Custom Modern Controls Elements (Bottom Bar)
    this.customControls = document.getElementById('player-custom-controls');
    this.playBtn = document.getElementById('player-play-btn');
    this.iconPlay = document.getElementById('icon-ctrl-play');
    this.iconPause = document.getElementById('icon-ctrl-pause');
    this.rewindBtn = document.getElementById('player-rewind-btn');
    this.forwardBtn = document.getElementById('player-forward-btn');
    this.currentTimeEl = document.getElementById('player-current-time');
    this.durationTimeEl = document.getElementById('player-duration-time');
    this.timeDisplay = document.getElementById('player-time-display');
    this.liveBadgeInline = document.getElementById('player-live-badge-inline');

    this.timelineContainer = document.getElementById('player-timeline-container');
    this.timelineTrack = document.getElementById('player-timeline-track');
    this.timelineBuffer = document.getElementById('player-timeline-buffer');
    this.timelinePlayed = document.getElementById('player-timeline-played');
    this.timelineHandle = document.getElementById('player-timeline-handle');
    this.timelineTooltip = document.getElementById('player-timeline-tooltip');

    this.bottomAudioBtn = document.getElementById('player-bottom-audio-btn');
    this.bottomAudioIcon = document.getElementById('player-bottom-audio-icon');
    this.bottomAudioText = document.getElementById('player-bottom-audio-text');
    this.bottomMuteBtn = document.getElementById('player-bottom-mute-btn');
    this.bottomVolSlider = document.getElementById('player-bottom-vol-slider');
    this.fullscreenBtn = document.getElementById('player-fullscreen-btn');
    this.iconFullscreenEnter = document.getElementById('icon-ctrl-fullscreen-enter');
    this.iconFullscreenExit = document.getElementById('icon-ctrl-fullscreen-exit');
    this.centerFeedback = document.getElementById('player-center-feedback');
    this.feedbackIcon = document.getElementById('player-feedback-icon');

    this.hls = null;
    this.mpegtsPlayer = null;
    this.currentStream = null;

    // Timeline & playback state
    this.duration = 0;
    this.transcodeStartOffset = 0;
    this.isDraggingTimeline = false;
    this.controlsTimeout = null;

    // Volume state & persistence
    const savedVol = parseFloat(localStorage.getItem('iptv_player_volume') ?? '1.0');
    this.currentVolume = (!isNaN(savedVol) && savedVol >= 0 && savedVol <= 1) ? savedVol : 1.0;
    this.boostLevel = 1.0;
    this.audioCtx = null;
    this.gainNode = null;
    this.mediaSourceNode = null;
    this.audioProbeTimer = null;

    // Stall / timeout detection
    this.stallTimer = null;
    this.loadStartTime = 0;
    this.loadingInterval = null;
    this.retryCount = 0;
    this.maxRetries = 2;

    // Resume Playback Banner Elements
    this.resumeBanner = document.getElementById('player-resume-banner');
    this.resumeTimeEl = document.getElementById('resume-banner-time');
    this.resumeRestartBtn = document.getElementById('resume-restart-btn');
    this.resumeDismissBtn = document.getElementById('resume-dismiss-btn');
    this.resumeTimeout = null;
    this.pendingResumeSeek = 0;
    this.lastProgressSaveTime = 0;
    this.onClose = null;

    this.initEvents();
    this.initCustomControls();
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

    // Interactive audio badge: click to switch between Direct and AAC Transcoding
    if (this.audioBadge) {
      this.audioBadge.addEventListener('click', () => {
        this.toggleAudioMode();
      });
    }

    // Volume controls (Header panel)
    if (this.volumeSlider) {
      this.volumeSlider.value = this.currentVolume.toString();
      this.volumeSlider.addEventListener('input', (e) => {
        this.setVolume(parseFloat(e.target.value));
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    if (this.boostBtn) {
      this.boostBtn.addEventListener('click', () => {
        this.cycleBoost();
      });
    }

    if (this.vlcBtn) {
      this.vlcBtn.addEventListener('click', () => {
        this.openInVLC();
      });
    }

    // Audio Notice Banner Buttons
    if (this.btnFixAudioTranscode) {
      this.btnFixAudioTranscode.addEventListener('click', () => {
        this.hideAudioNotice();
        this.setAudioMode('transcode');
      });
    }

    if (this.btnFixAudioVlc) {
      this.btnFixAudioVlc.addEventListener('click', () => {
        this.hideAudioNotice();
        this.openInVLC();
      });
    }

    if (this.btnDismissAudioNotice) {
      this.btnDismissAudioNotice.addEventListener('click', () => {
        this.hideAudioNotice();
      });
    }

    // Resume banner buttons
    if (this.resumeRestartBtn) {
      this.resumeRestartBtn.addEventListener('click', () => {
        this.seek(0);
        this.hideResumeBanner();
      });
    }

    if (this.resumeDismissBtn) {
      this.resumeDismissBtn.addEventListener('click', () => {
        this.hideResumeBanner();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.isOpen()) {
        if (e.key === 'Escape') {
          this.close();
        } else if ((e.code === 'Space' || e.key === 'k' || e.key === 'K') && e.target.tagName !== 'INPUT') {
          e.preventDefault();
          this.togglePlay();
          this.showCenterFeedback(this.video?.paused ? 'PAUSA' : 'PLAY');
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          if (this.currentStream && this.currentStream.type === 'live') {
            this.toggleStreamFormat();
          } else {
            this.toggleAudioMode();
          }
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.toggleMute();
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          this.openInVLC();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.adjustVolume(0.05);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.adjustVolume(-0.05);
        } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          const cur = this.getCurrentPlaybackTime();
          this.seek(cur - 10);
          this.showCenterFeedback('-10s');
        } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          const cur = this.getCurrentPlaybackTime();
          this.seek(cur + 10);
          this.showCenterFeedback('+10s');
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
    // Reset seek & duration
    this.duration = 0;
    this.transcodeStartOffset = 0;

    // Check item metadata for duration
    if (item) {
      if (typeof item.duration_secs === 'number' && item.duration_secs > 0) {
        this.duration = item.duration_secs;
      } else if (item.duration) {
        this.duration = this.parseDurationString(item.duration);
      }
    }

    // Check for saved resume position on VOD / Series
    let initialSeek = 0;
    if (type !== 'live' && item && account) {
      const itemId = WatchHistoryManager.getItemId(item, type);
      const saved = WatchHistoryManager.getProgress(account.id, itemId);
      if (saved && saved.currentTime >= 15 && !saved.completed) {
        initialSeek = saved.currentTime;
      }
    }
    this.pendingResumeSeek = initialSeek;

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
      currentFormat: initialFormat,
      audioMode: 'direct' // 'direct' or 'transcode'
    };

    this.retryCount = 0;
    this._startPlayback(initialSeek);
  }

  _startPlayback(seekPos = 0) {
    if (!this.currentStream) return;
    const { title, type, currentFormat } = this.currentStream;

    if (this.titleEl) this.titleEl.textContent = title || 'Riproduzione Stream';

    if (this.typeBadge) {
      this.typeBadge.textContent = type.toUpperCase();
      this.typeBadge.className = `badge badge-${type === 'movie' ? 'vod' : type}`;
    }

    this.updateFormatBadge(currentFormat);
    this.updateAudioBadge();

    // Show resume banner if started from a saved position
    if (seekPos > 0 && type !== 'live') {
      this.showResumeBanner(seekPos);
    } else {
      this.hideResumeBanner();
    }

    // Ensure volume is properly initialized and never muted by default
    if (this.video) {
      this.video.muted = false;
      this.video.volume = this.currentVolume;
    }
    this.updateVolumeUI();

    this.loadStartTime = Date.now();
    this.showLoading(`Connessione (${currentFormat.toUpperCase()})...`);
    if (this.errorBanner) this.errorBanner.style.display = 'none';
    if (this.modal) this.modal.classList.add('active');

    // Clean up any existing media pipelines
    this._destroyPlayers();
    this.clearStallTimer();

    // Update progress UI & play icon state
    this.updateProgressUI(seekPos);
    this.updatePlayState(true);

    // Route playback by format
    if (type === 'live') {
      if (currentFormat === 'm3u8') {
        this._playHls();
      } else {
        this._playMpegts();
      }
    } else {
      // VOD / Series episode: use native video with Range-enabled proxy OR on-the-fly AAC transcode
      let mediaUrl;
      if (this.currentStream.audioMode === 'transcode') {
        const ssParam = seekPos > 0 ? `&ss=${Math.floor(seekPos)}` : '';
        mediaUrl = `/api/transcode?url=${encodeURIComponent(this.currentStream.streamUrl)}${ssParam}`;
        this.ensureDuration(this.currentStream.streamUrl, this.currentStream.item);
      } else {
        mediaUrl = this.proxyWrapUrl(this.currentStream.streamUrl);
      }
      this._playNative(mediaUrl, seekPos);
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
  _playNative(url, seekPos = 0) {
    this.hideAudioNotice();
    if (this.audioProbeTimer) {
      clearTimeout(this.audioProbeTimer);
      this.audioProbeTimer = null;
    }

    // Ensure video volume and muted state are strictly synchronized
    this.video.muted = false;
    this.video.volume = this.currentVolume;
    this.updateVolumeUI();

    this.video.src = url;
    this.video.load();

    if (seekPos > 0 && this.currentStream && this.currentStream.audioMode !== 'transcode') {
      const onMeta = () => {
        try {
          this.video.currentTime = seekPos;
        } catch (e) {}
        this.video.removeEventListener('loadedmetadata', onMeta);
      };
      this.video.addEventListener('loadedmetadata', onMeta);
    }

    this.video.play().catch(err => {
      console.log('Native autoplay prevented:', err);
      this.showLoading('Clicca sul video per avviare la riproduzione');
    });

    // Probe audio playback after short buffer on VOD/Series
    if (this.currentStream && this.currentStream.type !== 'live' && this.currentStream.audioMode !== 'transcode') {
      this.audioProbeTimer = setTimeout(() => {
        if (!this.isOpen() || !this.currentStream || this.currentStream.audioMode === 'transcode') return;

        let audioSilent = false;
        // Chromium audio decoded byte counter
        if (typeof this.video.webkitAudioDecodedByteCount === 'number') {
          if (this.video.webkitAudioDecodedByteCount === 0 && (this.video.webkitVideoDecodedByteCount || 0) > 0) {
            audioSilent = true;
          }
        }
        // Firefox mozHasAudio flag
        if (this.video.mozHasAudio === false) {
          audioSilent = true;
        }
        // HTMLMediaElement audioTracks API (if supported)
        if (this.video.audioTracks && this.video.audioTracks.length === 0) {
          audioSilent = true;
        }

        if (audioSilent) {
          console.warn('Audio non udibile rilevato (probabile traccia Dolby AC3/DTS non supportata dal browser).');
          this.showAudioNotice();
        }
      }, 2500);
    }
  }

  _destroyPlayers() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
      this.controlsTimeout = null;
    }
    this.showControls();

    if (this.audioProbeTimer) {
      clearTimeout(this.audioProbeTimer);
      this.audioProbeTimer = null;
    }
    this.hideAudioNotice();

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
        <button id="player-retry-btn" style="padding: 7px 16px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.08); color: #fff; border-radius: 4px; font-weight: 600; cursor: pointer;">
          Riprova
        </button>
        ${isLive ? `
          <button id="player-switch-fmt-btn" style="padding: 7px 16px; border: 1px solid #3b82f6; background: rgba(59,130,246,0.25); color: #93c5fd; border-radius: 4px; font-weight: 600; cursor: pointer;">
            Prova Formato ${altFormat}
          </button>
        ` : ''}
        <button id="player-close-err-btn" style="padding: 7px 16px; border: 1px solid var(--border-subtle); background: transparent; color: rgba(255,255,255,0.7); border-radius: 4px; font-weight: 600; cursor: pointer;">
          Chiudi
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

  initCustomControls() {
    // Play / Pause button
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => {
        this.togglePlay();
        this.showCenterFeedback(this.video?.paused ? 'PAUSA' : 'PLAY');
      });
    }

    // Video click to Play/Pause
    if (this.video) {
      this.video.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlay();
        this.showCenterFeedback(this.video?.paused ? 'PAUSA' : 'PLAY');
      });

      // Double-click video to toggle fullscreen
      this.video.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      });

      // Video playback states
      this.video.addEventListener('play', () => {
        this.updatePlayState(true);
        this.resetControlsTimeout();
      });

      this.video.addEventListener('pause', () => {
        this.updatePlayState(false);
        this.showControls();
      });

      this.video.addEventListener('timeupdate', () => {
        if (!this.isDraggingTimeline) {
          this.updateProgressUI();
          this.savePlaybackProgress(false);
        }
      });

      this.video.addEventListener('progress', () => {
        if (!this.isDraggingTimeline) {
          this.updateProgressUI();
        }
      });

      this.video.addEventListener('loadedmetadata', () => {
        if (this.video.duration && isFinite(this.video.duration) && this.video.duration > 0) {
          this.duration = this.video.duration;
        }
        this.updateProgressUI();
      });
    }

    // Rewind / Forward 10s
    if (this.rewindBtn) {
      this.rewindBtn.addEventListener('click', () => {
        const cur = this.getCurrentPlaybackTime();
        this.seek(cur - 10);
        this.showCenterFeedback('-10s');
      });
    }

    if (this.forwardBtn) {
      this.forwardBtn.addEventListener('click', () => {
        const cur = this.getCurrentPlaybackTime();
        this.seek(cur + 10);
        this.showCenterFeedback('+10s');
      });
    }

    // Timeline Scrubbing & Dragging
    if (this.timelineContainer && this.timelineTrack) {
      const getPosTime = (e) => {
        const rect = this.timelineTrack.getBoundingClientRect();
        const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const pct = rect.width > 0 ? x / rect.width : 0;
        const dur = this.getDuration();
        return { pct, time: pct * dur, x };
      };

      // Hover Tooltip
      this.timelineContainer.addEventListener('mousemove', (e) => {
        const { time, x } = getPosTime(e);
        if (this.timelineTooltip) {
          this.timelineTooltip.textContent = this.formatTime(time);
          this.timelineTooltip.style.left = `${x}px`;
        }
      });

      // Pointer / Mouse Down to Seek or Drag
      const startDrag = (e) => {
        if (!this.currentStream || this.currentStream.type === 'live') return;
        this.isDraggingTimeline = true;
        this.timelineContainer.classList.add('dragging');
        const { time } = getPosTime(e);
        this.updateProgressUI(time);

        const onMove = (ev) => {
          if (!this.isDraggingTimeline) return;
          const pos = getPosTime(ev);
          this.updateProgressUI(pos.time);
          if (this.timelineTooltip) {
            this.timelineTooltip.textContent = this.formatTime(pos.time);
            this.timelineTooltip.style.left = `${pos.x}px`;
          }
        };

        const onUp = (ev) => {
          if (!this.isDraggingTimeline) return;
          this.isDraggingTimeline = false;
          this.timelineContainer.classList.remove('dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const finalPos = getPosTime(ev);
          this.seek(finalPos.time);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      };

      this.timelineContainer.addEventListener('pointerdown', startDrag);
    }

    // Bottom Bar Volume & Mute
    if (this.bottomVolSlider) {
      this.bottomVolSlider.value = this.currentVolume.toString();
      this.bottomVolSlider.addEventListener('input', (e) => {
        this.setVolume(parseFloat(e.target.value));
      });
    }

    if (this.bottomMuteBtn) {
      this.bottomMuteBtn.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // Fullscreen button
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenUI();
    });

    // Bottom Audio Toggle Button
    if (this.bottomAudioBtn) {
      this.bottomAudioBtn.addEventListener('click', () => {
        this.toggleAudioMode();
      });
    }

    // Controls Auto-Hide
    if (this.videoWrapper) {
      this.videoWrapper.addEventListener('mousemove', () => {
        this.showControls();
        this.resetControlsTimeout();
      });

      this.videoWrapper.addEventListener('mouseleave', () => {
        if (this.video && !this.video.paused) {
          this.hideControls();
        }
      });
    }
  }

  showControls() {
    if (this.videoWrapper) {
      this.videoWrapper.classList.remove('controls-hidden');
    }
  }

  hideControls() {
    if (this.videoWrapper && this.video && !this.video.paused && !this.isDraggingTimeline) {
      this.videoWrapper.classList.add('controls-hidden');
    }
  }

  resetControlsTimeout() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
    this.controlsTimeout = setTimeout(() => {
      this.hideControls();
    }, 2800);
  }

  updatePlayState(isPlaying) {
    if (this.iconPlay && this.iconPause) {
      if (isPlaying) {
        this.iconPlay.style.display = 'none';
        this.iconPause.style.display = 'block';
      } else {
        this.iconPlay.style.display = 'block';
        this.iconPause.style.display = 'none';
      }
    }
  }

  updateFullscreenUI() {
    const isFull = !!document.fullscreenElement;
    if (this.iconFullscreenEnter && this.iconFullscreenExit) {
      if (isFull) {
        this.iconFullscreenEnter.style.display = 'none';
        this.iconFullscreenExit.style.display = 'block';
        if (this.fullscreenBtn) this.fullscreenBtn.title = 'Esci da Schermo Intero (F)';
      } else {
        this.iconFullscreenEnter.style.display = 'block';
        this.iconFullscreenExit.style.display = 'none';
        if (this.fullscreenBtn) this.fullscreenBtn.title = 'Schermo Intero (F)';
      }
    }
  }

  showCenterFeedback(icon) {
    if (!this.centerFeedback || !this.feedbackIcon) return;
    this.feedbackIcon.textContent = icon;
    this.centerFeedback.style.display = 'block';
    const circle = this.centerFeedback.querySelector('.feedback-circle');
    if (circle) {
      circle.style.animation = 'none';
      circle.offsetHeight; // reflow
      circle.style.animation = 'feedbackPulse 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }
    setTimeout(() => {
      if (this.centerFeedback) this.centerFeedback.style.display = 'none';
    }, 500);
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) {
      this.video.play().catch(e => console.log('Play notice:', e));
      this.updatePlayState(true);
    } else {
      this.video.pause();
      this.updatePlayState(false);
    }
  }

  toggleFullscreen() {
    if (!this.video) return;
    const wrapper = this.video.closest('.player-modal') || this.video;
    if (!document.fullscreenElement) {
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

  // =========================================================================
  // VOLUME & AUDIO ENGINE
  // =========================================================================

  setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    this.currentVolume = val;
    localStorage.setItem('iptv_player_volume', val.toString());

    if (this.video) {
      this.video.volume = val;
      if (val > 0 && this.video.muted) {
        this.video.muted = false;
      }
    }
    this.updateVolumeUI();
  }

  adjustVolume(delta) {
    this.setVolume(this.currentVolume + delta);
  }

  toggleMute() {
    if (!this.video) return;
    this.video.muted = !this.video.muted;
    if (!this.video.muted && this.video.volume === 0) {
      this.setVolume(0.5);
    } else {
      this.updateVolumeUI();
    }
  }

  updateVolumeUI() {
    const isMuted = !this.video || this.video.muted || this.video.volume === 0;
    const vol = this.video ? this.video.volume : this.currentVolume;

    if (this.volumeSlider) {
      this.volumeSlider.value = isMuted ? '0' : vol.toString();
    }
    if (this.bottomVolSlider) {
      this.bottomVolSlider.value = isMuted ? '0' : vol.toString();
    }

    const volSvgHigh = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    const volSvgLow = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    const volSvgMuted = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

    const iconSvg = isMuted ? volSvgMuted : (vol < 0.5 ? volSvgLow : volSvgHigh);
    if (this.muteBtn) {
      this.muteBtn.innerHTML = iconSvg;
      this.muteBtn.title = isMuted ? 'Riattiva Audio (M)' : 'Disattiva Audio (M)';
    }
    if (this.bottomMuteBtn) {
      this.bottomMuteBtn.innerHTML = iconSvg;
      this.bottomMuteBtn.title = isMuted ? 'Riattiva Audio (M)' : 'Disattiva Audio (M)';
    }

    if (this.volumeLabel) {
      const displayPct = isMuted ? 0 : Math.round(vol * 100 * this.boostLevel);
      this.volumeLabel.textContent = `${displayPct}%`;
    }
  }

  cycleBoost() {
    if (this.boostLevel === 1.0) {
      this.setBoost(1.5);
    } else if (this.boostLevel === 1.5) {
      this.setBoost(2.0);
    } else {
      this.setBoost(1.0);
    }
  }

  setBoost(level) {
    this.boostLevel = level;
    if (level > 1.0) {
      this.initWebAudio();
      if (this.gainNode) {
        this.gainNode.gain.value = level;
      }
    } else if (this.gainNode) {
      this.gainNode.gain.value = 1.0;
    }

    if (this.boostBtn) {
      this.boostBtn.textContent = `${Math.round(level * 100)}%`;
      if (level > 1.0) {
        this.boostBtn.classList.add('boosted');
        this.boostBtn.title = `Boost attivo (${Math.round(level * 100)}%). Clicca per cambiare`;
      } else {
        this.boostBtn.classList.remove('boosted');
        this.boostBtn.title = 'Amplificatore Gain Audio (100% / 150% / 200%)';
      }
    }
    this.updateVolumeUI();
  }

  initWebAudio() {
    if (this.gainNode || !this.video) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.boostLevel;
      this.mediaSourceNode = this.audioCtx.createMediaElementSource(this.video);
      this.mediaSourceNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('WebAudio init notice:', e);
    }
  }

  async openInVLC() {
    if (!this.currentStream || !this.currentStream.streamUrl) return;
    const url = this.currentStream.streamUrl;
    UIManager.showToast('VLC Player', 'Avvio di VLC Media Player in corso...', 'info', 3000);
    const res = await XtreamAPI.openVLC(url);
    if (res.success) {
      UIManager.showToast('VLC Avviato', 'Lo stream è in riproduzione su VLC con supporto audio completo!', 'success', 4000);
    } else {
      UIManager.showToast('Errore VLC', res.error || 'Impossibile avviare VLC.', 'error', 4000);
    }
  }

  // =========================================================================
  // SEEKING & PROGRESS CONTROLS (DIRECT & TRANSCODE MODES)
  // =========================================================================

  getDuration() {
    if (this.duration && this.duration > 0) return this.duration;
    if (this.video && isFinite(this.video.duration) && this.video.duration > 0) {
      return this.video.duration;
    }
    return 0;
  }

  getCurrentPlaybackTime() {
    if (!this.video) return 0;
    if (this.currentStream && this.currentStream.audioMode === 'transcode') {
      return (this.transcodeStartOffset || 0) + (this.video.currentTime || 0);
    }
    return this.video.currentTime || 0;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds === null || !isFinite(seconds) || seconds < 0) {
      return '0:00';
    }
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => (n < 10 ? '0' + n : n);

    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${mins}:${pad(secs)}`;
  }

  parseDurationString(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const num = parseFloat(str);
    if (!isNaN(num) && str.indexOf(':') === -1) return num;
    const parts = str.split(':').map(p => parseFloat(p) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  async ensureDuration(streamUrl, item) {
    if (this.duration && this.duration > 0) return;

    if (item) {
      if (typeof item.duration_secs === 'number' && item.duration_secs > 0) {
        this.duration = item.duration_secs;
        this.updateProgressUI();
        return;
      }
      if (item.duration) {
        const parsed = this.parseDurationString(item.duration);
        if (parsed > 0) {
          this.duration = parsed;
          this.updateProgressUI();
          return;
        }
      }
    }

    try {
      const res = await fetch(`/api/media_info?url=${encodeURIComponent(streamUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.duration && data.duration > 0) {
          this.duration = data.duration;
          this.updateProgressUI();
        }
      }
    } catch (e) {
      console.warn('Media info probe error:', e);
    }
  }

  seek(targetTime) {
    if (!this.currentStream || this.currentStream.type === 'live') return;
    const dur = this.getDuration();
    if (dur > 0) {
      targetTime = Math.max(0, Math.min(dur, targetTime));
    } else {
      targetTime = Math.max(0, targetTime);
    }

    if (this.currentStream.audioMode === 'transcode') {
      this.transcodeStartOffset = targetTime;
      this.showLoading(`Ricerca a ${this.formatTime(targetTime)}...`);
      const streamUrl = this.currentStream.streamUrl;
      const mediaUrl = `/api/transcode?url=${encodeURIComponent(streamUrl)}&ss=${Math.floor(targetTime)}`;
      this.video.src = mediaUrl;
      this.video.load();
      this.video.play().catch(e => console.log('Seek play notice:', e));
    } else {
      this.video.currentTime = targetTime;
    }
    this.updateProgressUI(targetTime);
  }

  updateProgressUI(forceTime = null) {
    if (!this.currentStream) return;
    const isLive = this.currentStream.type === 'live';

    if (isLive) {
      if (this.timelineContainer) this.timelineContainer.style.display = 'none';
      if (this.timeDisplay) this.timeDisplay.style.display = 'none';
      if (this.rewindBtn) this.rewindBtn.style.display = 'none';
      if (this.forwardBtn) this.forwardBtn.style.display = 'none';
      if (this.liveBadgeInline) this.liveBadgeInline.style.display = 'inline-flex';
      return;
    }

    if (this.timelineContainer) this.timelineContainer.style.display = 'flex';
    if (this.timeDisplay) this.timeDisplay.style.display = 'flex';
    if (this.rewindBtn) this.rewindBtn.style.display = 'inline-flex';
    if (this.forwardBtn) this.forwardBtn.style.display = 'inline-flex';
    if (this.liveBadgeInline) this.liveBadgeInline.style.display = 'none';

    const current = forceTime !== null ? forceTime : this.getCurrentPlaybackTime();
    const dur = this.getDuration();

    if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(current);
    if (this.durationTimeEl) this.durationTimeEl.textContent = this.formatTime(dur);

    const pct = dur > 0 ? Math.min(100, Math.max(0, (current / dur) * 100)) : 0;
    if (this.timelinePlayed) this.timelinePlayed.style.width = `${pct}%`;
    if (this.timelineHandle) this.timelineHandle.style.left = `${pct}%`;

    // Buffer progress
    if (this.timelineBuffer && this.video && this.video.buffered && this.video.buffered.length > 0) {
      try {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        let effectiveBuffered = bufferedEnd;
        if (this.currentStream.audioMode === 'transcode') {
          effectiveBuffered = (this.transcodeStartOffset || 0) + bufferedEnd;
        }
        const bufPct = dur > 0 ? Math.min(100, Math.max(0, (effectiveBuffered / dur) * 100)) : 0;
        this.timelineBuffer.style.width = `${bufPct}%`;
      } catch (e) {}
    }
  }

  // =========================================================================
  // AUDIO MODE CONTROLS
  // =========================================================================

  setAudioMode(mode) {
    if (!this.currentStream) return;
    const currentPosition = this.getCurrentPlaybackTime();
    this.currentStream.audioMode = mode;
    this.updateAudioBadge();
    this.retryCount = 0;

    if (mode === 'transcode') {
      this.transcodeStartOffset = currentPosition;
      UIManager.showToast('Transcodifica AAC Attiva', 'Flusso avviato con conversione audio AAC in tempo reale.', 'success', 3500);
    } else {
      this.transcodeStartOffset = 0;
      UIManager.showToast('Audio Diretto', 'Flusso avviato con traccia audio originale.', 'info', 2500);
    }

    this._startPlayback(currentPosition);
  }

  toggleAudioMode() {
    if (!this.currentStream || this.currentStream.type === 'live') return;
    const nextMode = this.currentStream.audioMode === 'transcode' ? 'direct' : 'transcode';
    this.setAudioMode(nextMode);
  }

  updateAudioBadge() {
    const isLive = this.currentStream && this.currentStream.type === 'live';
    const isTranscoding = this.currentStream && this.currentStream.audioMode === 'transcode';

    if (this.audioBadge) {
      if (isLive || !this.currentStream) {
        this.audioBadge.style.display = 'none';
      } else {
        this.audioBadge.style.display = 'inline-block';
        if (isTranscoding) {
          this.audioBadge.textContent = 'Audio: AAC (Transcodificato)';
          this.audioBadge.title = 'Modalità: Audio AAC convertito in tempo reale per il browser. Clicca per tornare ad Audio Diretto.';
          this.audioBadge.style.background = 'rgba(37, 99, 235, 0.2)';
          this.audioBadge.style.borderColor = 'rgba(37, 99, 235, 0.5)';
          this.audioBadge.style.color = '#93c5fd';
        } else {
          this.audioBadge.textContent = 'Audio: Diretto';
          this.audioBadge.title = 'Modalità: Traccia audio originale diretta. Clicca per attivare la Transcodifica AAC.';
          this.audioBadge.style.background = 'rgba(255, 255, 255, 0.08)';
          this.audioBadge.style.borderColor = 'var(--border-subtle)';
          this.audioBadge.style.color = 'var(--text-main)';
        }
      }
    }

    const volSvgLow = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    const zapSvg = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';

    if (this.bottomAudioBtn) {
      if (isLive || !this.currentStream) {
        this.bottomAudioBtn.style.display = 'none';
      } else {
        this.bottomAudioBtn.style.display = 'inline-flex';
        if (isTranscoding) {
          this.bottomAudioBtn.classList.add('transcoding');
          if (this.bottomAudioIcon) this.bottomAudioIcon.innerHTML = zapSvg;
          if (this.bottomAudioText) this.bottomAudioText.textContent = 'AAC Transcodificato';
          this.bottomAudioBtn.title = 'Modalità: Audio AAC (attivo). Clicca per tornare ad Audio Diretto.';
        } else {
          this.bottomAudioBtn.classList.remove('transcoding');
          if (this.bottomAudioIcon) this.bottomAudioIcon.innerHTML = volSvgLow;
          if (this.bottomAudioText) this.bottomAudioText.textContent = 'Audio: Diretto';
          this.bottomAudioBtn.title = 'Modalità: Traccia audio originale diretta. Clicca per attivare la Transcodifica AAC.';
        }
      }
    }
  }

  showAudioNotice() {
    if (this.audioNotice) {
      this.audioNotice.style.display = 'flex';
    }
  }

  hideAudioNotice() {
    if (this.audioNotice) {
      this.audioNotice.style.display = 'none';
    }
  }

  showResumeBanner(seekPos) {
    if (!this.resumeBanner || !this.resumeTimeEl) return;
    this.resumeTimeEl.textContent = this.formatTime(seekPos);
    this.resumeBanner.style.display = 'flex';
    if (this.resumeTimeout) clearTimeout(this.resumeTimeout);
    this.resumeTimeout = setTimeout(() => {
      this.hideResumeBanner();
    }, 8000);
  }

  hideResumeBanner() {
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
    if (this.resumeBanner) {
      this.resumeBanner.style.display = 'none';
    }
  }

  savePlaybackProgress(force = false) {
    if (!this.currentStream || this.currentStream.type === 'live' || !this.currentStream.account || !this.currentStream.item) return;
    const now = Date.now();
    if (!force && (now - this.lastProgressSaveTime < 4000)) return;
    this.lastProgressSaveTime = now;

    const cur = this.getCurrentPlaybackTime();
    const dur = this.getDuration();
    if (dur < 30 || cur < 5) return;

    const pct = (cur / dur) * 100;
    const accountId = this.currentStream.account.id;
    const itemId = WatchHistoryManager.getItemId(this.currentStream.item, this.currentStream.type);

    if (pct > 92 || (dur - cur) < 45) {
      WatchHistoryManager.markCompleted(accountId, itemId);
    } else if (cur >= 15 && pct >= 2) {
      let subTitle = '';
      if (this.currentStream.type === 'series') {
        const s = this.currentStream.item.season || this.currentStream.item.season_num || '1';
        const e = this.currentStream.item.episode_num || this.currentStream.item.num || '1';
        subTitle = `Stagione ${s} • Episodio ${e}`;
      } else {
        subTitle = 'Film VOD';
      }

      WatchHistoryManager.saveProgress(accountId, {
        id: itemId,
        type: this.currentStream.type,
        title: this.currentStream.title,
        subTitle: subTitle,
        poster: this.currentStream.item.stream_icon || this.currentStream.item.cover || this.currentStream.item.movie_image || '',
        currentTime: cur,
        duration: dur,
        percent: pct,
        item: this.currentStream.item,
        completed: false
      });
    }
  }

  close() {
    this.savePlaybackProgress(true);
    this.hideResumeBanner();
    this.clearStallTimer();
    if (this.audioProbeTimer) {
      clearTimeout(this.audioProbeTimer);
      this.audioProbeTimer = null;
    }
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
      this.controlsTimeout = null;
    }
    this.hideAudioNotice();
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
    this.duration = 0;
    this.transcodeStartOffset = 0;
    this.isDraggingTimeline = false;
    this.showControls();
    this.updatePlayState(false);
    if (this.onClose) {
      this.onClose();
    }
  }
}


