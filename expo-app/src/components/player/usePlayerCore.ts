import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { PlayingStream, Account, MediaTrack, QualityLevel, PlaybackSpeed } from '../../types';
import { XtreamAPI } from '../../services/api';
import { StorageService } from '../../services/storage';

let HlsClass: any = null;
let mpegts: any = null;

if (Platform.OS === 'web') {
  try {
    HlsClass = require('hls.js');
    if (HlsClass?.default) {
      HlsClass = HlsClass.default;
    }
  } catch (e) {
    console.warn('Hls.js module not available:', e);
  }

  try {
    mpegts = require('mpegts.js');
    if (mpegts?.default) {
      mpegts = mpegts.default;
    }
  } catch (e) {
    console.warn('mpegts.js module not available:', e);
  }
}

export interface UsePlayerCoreOptions {
  visible: boolean;
  stream: PlayingStream | null;
  account?: Account | null;
  isMinimized?: boolean;
  onClose: () => void;
  onWatchProgressUpdated?: () => void;
}

export function usePlayerCore({
  visible,
  stream,
  account,
  isMinimized = false,
  onClose,
  onWatchProgressUpdated
}: UsePlayerCoreOptions) {
  // Device & Platform Detection
  const isIOS = useMemo(() => {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    return false;
  }, []);

  const isAndroid = useMemo(() => {
    if (Platform.OS === 'android') return true;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      return /Android/i.test(navigator.userAgent || '');
    }
    return false;
  }, []);

  const isTouchDevice = useMemo(() => {
    return isIOS || isAndroid || (Platform.OS === 'web' && typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  }, [isIOS, isAndroid]);

  // Content Type Detection
  const isMovieOrSeries = Boolean(
    stream?.type === 'vod' ||
    stream?.type === 'series' ||
    stream?.streamUrl.includes('/movie/') ||
    stream?.streamUrl.includes('/series/') ||
    stream?.streamUrl.includes('%2Fmovie%2F') ||
    stream?.streamUrl.includes('%2Fseries%2F') ||
    stream?.extension === 'mp4' ||
    stream?.extension === 'mkv' ||
    stream?.extension === 'avi' ||
    Boolean(stream?.rawItem?.container_extension) ||
    stream?.rawItem?.stream_type === 'movie' ||
    stream?.rawItem?.type === 'vod' ||
    stream?.rawItem?.type === 'series'
  );
  const isLive = !isMovieOrSeries;

  // Media Element Refs
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const mpegtsRef = useRef<any>(null);
  const nativeVideoRef = useRef<any>(null);

  // Playback & Timing States
  const [isPlaying, setIsPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Connessione allo stream...');
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresUserUnmute, setRequiresUserUnmute] = useState(false);
  const [requiresUserGesture, setRequiresUserGesture] = useState(false);

  // Keep ref in sync with state for use inside event handler closures
  useEffect(() => {
    requiresUserGestureRef.current = requiresUserGesture;
  }, [requiresUserGesture]);

  // Tracks & Quality States
  const [audioTracks, setAudioTracks] = useState<MediaTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<MediaTrack[]>([]);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(0);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<number>(-1);
  const [activeQualityLevel, setActiveQualityLevel] = useState<number>(-1); // -1 = Auto

  // Modals visibility
  const [trackModalVisible, setTrackModalVisible] = useState(false);
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [speedModalVisible, setSpeedModalVisible] = useState(false);
  const [shortcutsModalVisible, setShortcutsModalVisible] = useState(false);

  // Scrubber dragging state
  const [isDraggingTrack, setIsDraggingTrack] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Quick skip ripple indicator
  const [seekFeedback, setSeekFeedback] = useState<{ direction: 'back' | 'forward'; key: number } | null>(null);

  // Resume prompt
  const [resumePrompt, setResumePrompt] = useState<{ visible: boolean; time: number } | null>(null);
  const hasResumedRef = useRef(false);
  const lastSaveTimeRef = useRef(0);
  const resumeTimerRef = useRef<any>(null);
  const fallbackTierRef = useRef<number>(0);
  const isClosingRef = useRef(false);
  const requiresUserGestureRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>((AppState.currentState as AppStateStatus) || 'active');

  // Extract clean target URL from proxy, HLS wrapper, or transcode wrapper for probes & fallbacks
  const cleanTargetUrl = useMemo(() => {
    if (!stream?.streamUrl) return '';
    let raw = stream.streamUrl;
    if (raw.includes('/api/proxy?url=')) {
      raw = decodeURIComponent(raw.split('/api/proxy?url=')[1]);
    } else if (raw.includes('/api/hls/master.m3u8?url=')) {
      const parts = raw.split('/api/hls/master.m3u8?url=')[1];
      raw = decodeURIComponent(parts.split('&')[0]);
    } else if (raw.includes('/api/transcode?url=')) {
      const parts = raw.split('/api/transcode?url=')[1];
      raw = decodeURIComponent(parts.split('&')[0]);
    }
    return raw;
  }, [stream]);

  // Teardown web player cleanly
  const cleanupWebPlayer = useCallback(() => {
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.pause();
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    if (webVideoRef.current) {
      try {
        const vid = webVideoRef.current;
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      } catch {}
    }
  }, []);

  // Save watch progress to storage
  const saveCurrentProgress = useCallback(() => {
    if (!isMovieOrSeries || !account?.id || !stream) return;
    const cur = webVideoRef.current?.currentTime || currentTime;
    const dur = (webVideoRef.current?.duration && isFinite(webVideoRef.current.duration) && webVideoRef.current.duration > 0)
      ? webVideoRef.current.duration
      : duration;

    if (cur > 10) {
      const pct = dur > 0 ? Math.min(100, Math.floor((cur / dur) * 100)) : 0;
      if (pct >= 96) {
        StorageService.removeHistoryItem(account.id, String(stream.streamId)).catch(() => {});
      } else {
        StorageService.saveWatchProgress(account.id, {
          id: String(stream.streamId),
          accountId: account.id,
          type: stream.type === 'series' ? 'series' : 'vod',
          title: stream.title || '',
          subTitle: stream.subTitle,
          poster: stream.poster,
          currentTime: Math.floor(cur),
          duration: Math.floor(dur),
          percent: pct,
          rawItem: stream.rawItem
        }).catch(() => {});
      }
      onWatchProgressUpdated?.();
    }
  }, [isMovieOrSeries, account, stream, currentTime, duration, onWatchProgressUpdated]);

  // Close player handler
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    saveCurrentProgress();
    cleanupWebPlayer();
    if (nativeVideoRef.current) {
      try {
        nativeVideoRef.current.unloadAsync();
      } catch {}
    }
    onClose();
  }, [saveCurrentProgress, cleanupWebPlayer, onClose]);

  // Picture in Picture
  const togglePictureInPicture = useCallback(async () => {
    if (Platform.OS !== 'web' || !webVideoRef.current) return;
    const vid = webVideoRef.current as any;
    try {
      if (document.pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (typeof vid.requestPictureInPicture === 'function') {
        await vid.requestPictureInPicture();
      } else if (typeof vid.webkitSetPresentationMode === 'function') {
        const mode = vid.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
        vid.webkitSetPresentationMode(mode);
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  }, []);

  // Update native HTML5 audio and subtitle tracks (Apple Safari AVPlayer & Android native)
  const syncNativeTracks = useCallback(() => {
    const video = webVideoRef.current;
    if (!video) return;

    try {
      // 1. Audio tracks (Apple Safari WebKit HTMLAudioElement.audioTracks)
      const aTracks = (video as any).audioTracks;
      if (aTracks && aTracks.length > 0) {
        const list: MediaTrack[] = [];
        let activeIdx = 0;
        for (let i = 0; i < aTracks.length; i++) {
          if (aTracks[i].enabled) activeIdx = i;
          list.push({
            id: i,
            label: aTracks[i].label || aTracks[i].language || `Traccia ${i + 1}`,
            language: aTracks[i].language || '',
            active: aTracks[i].enabled,
            kind: 'audio'
          });
        }
        setAudioTracks(list);
        setActiveAudioTrack(activeIdx);
      }

      // 2. Subtitle / Text tracks (video.textTracks)
      const tTracks = video.textTracks;
      if (tTracks && tTracks.length > 0) {
        const list: MediaTrack[] = [];
        let activeIdx = -1;
        for (let i = 0; i < tTracks.length; i++) {
          if (tTracks[i].mode === 'showing') activeIdx = i;
          list.push({
            id: i,
            label: tTracks[i].label || tTracks[i].language || `Sottotitolo ${i + 1}`,
            language: tTracks[i].language || '',
            active: tTracks[i].mode === 'showing',
            kind: 'subtitles'
          });
        }
        setSubtitleTracks(list);
        setActiveSubtitleTrack(activeIdx);
      }
    } catch {}
  }, []);

  // Resume progress check
  const checkResumeProgress = useCallback((vid: HTMLVideoElement) => {
    if (hasResumedRef.current) return;
    hasResumedRef.current = true;

    if (stream?.initialSeekTime && stream.initialSeekTime > 0) {
      vid.currentTime = stream.initialSeekTime;
      setCurrentTime(stream.initialSeekTime);
      return;
    }

    if (isMovieOrSeries && account?.id && stream) {
      StorageService.getHistory(account.id).then(hist => {
        const match = hist.find(h => String(h.id) === String(stream.streamId));
        const maxDur = (vid.duration && isFinite(vid.duration) && vid.duration > 0) ? vid.duration : duration;
        if (match && match.currentTime > 15 && match.currentTime < (maxDur > 0 ? maxDur - 40 : 36000)) {
          setResumePrompt({ visible: true, time: match.currentTime });
          if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = setTimeout(() => {
            setResumePrompt(null);
          }, 8500);
        }
      }).catch(() => {});
    }
  }, [duration, isMovieOrSeries, account, stream]);

  // Safe Play pipeline: handles modern browser autoplay restrictions seamlessly
  const safePlay = useCallback(async (vid?: HTMLVideoElement | null) => {
    const target = vid || webVideoRef.current;
    if (!target) return;
    try {
      setIsPlaying(true);
      await target.play();
      setRequiresUserUnmute(false);
      setRequiresUserGesture(false);
    } catch (err: any) {
      // Ignore AbortError: normal during loading, switching streams or rapid playback initiation
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('Playback play() with audio blocked by browser policy:', err);
      // Fallback 1: Try playing muted so video and frames render immediately
      try {
        target.muted = true;
        setIsMuted(true);
        await target.play();
        setRequiresUserUnmute(true);
        setRequiresUserGesture(false);
        setIsPlaying(true);
      } catch (muteErr: any) {
        if (muteErr?.name === 'AbortError') {
          return;
        }
        console.warn('Muted autoplay also blocked, user gesture required:', muteErr);
        // Only require user gesture if the video has loaded metadata or frames
        if (target.readyState >= 1) {
          setRequiresUserGesture(true);
          setIsPlaying(false);
          setLoading(false);
        }
      }
    }
  }, []);

  const handleDismissUnmute = useCallback(() => {
    if (webVideoRef.current) {
      webVideoRef.current.muted = false;
      setIsMuted(false);
      webVideoRef.current.play().catch(() => {});
    }
    setRequiresUserUnmute(false);
  }, []);

  const handleUserGesturePlay = useCallback(() => {
    if (webVideoRef.current) {
      const v = webVideoRef.current;
      if (mpegtsRef.current) {
        try {
          mpegtsRef.current.play();
        } catch {}
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad();
        } catch {}
      }
      setLoading(true);
      setLoadingStatus('Avvio riproduzione...');
      v.play().then(() => {
        setIsPlaying(true);
        setRequiresUserGesture(false);
        setRequiresUserUnmute(false);
        setLoading(false);
      }).catch((e) => {
        console.warn('User gesture play failed, trying muted:', e);
        v.muted = true;
        setIsMuted(true);
        v.play().then(() => {
          setIsPlaying(true);
          setRequiresUserGesture(false);
          setRequiresUserUnmute(true);
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });
      });
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.playAsync?.().catch(() => {});
      setIsPlaying(true);
      setRequiresUserGesture(false);
    }
  }, []);

  // Update native Expo mobile player state (Android/iOS Expo Go)
  const handleNativePlaybackStatusUpdate = useCallback((status: any) => {
    if (!status) return;
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      setLoading(status.isBuffering);
      if (status.isBuffering) {
        setLoadingStatus('Buffering...');
      }
      if (status.positionMillis !== undefined) {
        const sec = status.positionMillis / 1000;
        if (!isDraggingTrack) {
          setCurrentTime(sec);
        }
        if (sec > 0 || status.isPlaying) {
          setFirstFrameRendered(true);
          setLoading(false);
        }
      }
      if (status.durationMillis !== undefined && status.durationMillis > 0) {
        setDuration(status.durationMillis / 1000);
      }
      if (status.playableDurationMillis !== undefined && status.durationMillis > 0) {
        setBufferPercent(Math.min(100, (status.playableDurationMillis / status.durationMillis) * 100));
      }
    } else if (status.error) {
      setErrorMsg(status.error);
      setLoading(false);
    }
  }, [isDraggingTrack]);

  // Open native player on Apple / Android
  const openDevicePlayer = useCallback((targetVid?: HTMLVideoElement) => {
    if (isMinimized) return false;
    if (Platform.OS === 'web') {
      const vid = targetVid || webVideoRef.current;
      if (vid) {
        if (isIOS && typeof (vid as any).webkitEnterFullscreen === 'function') {
          try {
            (vid as any).webkitEnterFullscreen();
            setIsFullscreen(true);
            return true;
          } catch (err) {
            console.log('Apple fullscreen deferred until user touch:', err);
          }
        }
      }
    } else if (nativeVideoRef.current) {
      try {
        nativeVideoRef.current.presentFullscreenPlayer();
        setIsFullscreen(true);
        return true;
      } catch (e) {}
    }
    return false;
  }, [isIOS, isMinimized]);

  // Initialize Web Video & Multi-Platform Engine
  const initWebPlayer = useCallback((targetUrl: string) => {
    cleanupWebPlayer();
    const video = webVideoRef.current;
    if (!video || !stream) return;

    setLoading(true);
    setLoadingStatus('Connessione allo stream...');
    setErrorMsg(null);

    // Cross-origin attribute is mandatory for WebVTT subtitle tracks and Safari AVPlayer
    video.crossOrigin = 'anonymous';

    const cleanUrl = cleanTargetUrl || targetUrl;
    const cleanLower = cleanUrl.toLowerCase();
    const urlLower = targetUrl.toLowerCase();

    // High-precision format detection across all protocols & wrappers
    const isExplicitM3U8 = urlLower.includes('.m3u8') || cleanLower.includes('.m3u8') || targetUrl.includes('/api/hls/');
    const isExplicitTs = cleanLower.endsWith('.ts') || cleanLower.includes('.ts?') || cleanLower.includes('.ts&') || stream?.extension === 'ts';
    const isLiveTs = isLive && (isExplicitTs || (!isExplicitM3U8 && stream?.extension === 'ts'));
    const isLiveHls = isLive && !isLiveTs;
    const isHls = isExplicitM3U8 || isLiveHls;
    const canNativeHls = typeof video.canPlayType === 'function' && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));

    // Video Element Standard Events
    video.onwaiting = () => {
      setLoading(true);
      setLoadingStatus('Buffering...');
    };

    // Auto-recover when the stream stalls for too long (common with IPTV live TS streams)
    let stalledTimer: any = null;
    video.onstalled = () => {
      if (stalledTimer) clearTimeout(stalledTimer);
      stalledTimer = setTimeout(() => {
        if (video.paused && !requiresUserGestureRef.current && video.readyState < 3) {
          safePlay(video);
        }
      }, 3000);
    };

    video.onloadeddata = () => {
      if (video.readyState >= 2) {
        setFirstFrameRendered(true);
      }
      syncNativeTracks();
      if (video.paused && !requiresUserGestureRef.current) {
        safePlay(video);
      }
    };

    video.oncanplay = () => {
      setLoading(false);
      if (video.paused && !requiresUserGestureRef.current) {
        safePlay(video);
      }
    };

    video.onplaying = () => {
      setFirstFrameRendered(true);
      setLoading(false);
      setIsPlaying(true);
      syncNativeTracks();
      checkResumeProgress(video);
    };

    video.onplay = () => {
      setIsPlaying(true);
      syncNativeTracks();
    };

    video.onpause = () => {
      setIsPlaying(false);
    };

    video.onvolumechange = () => {
      setIsMuted(video.muted);
      setVolume(video.volume);
    };

    video.onprogress = () => {
      if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBufferPercent(Math.min(100, (end / video.duration) * 100));
      }
    };

    video.onloadedmetadata = () => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
      syncNativeTracks();
      checkResumeProgress(video);
    };

    video.ondurationchange = () => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    video.ontimeupdate = () => {
      if (video.currentTime > 0) {
        setFirstFrameRendered(true);
      }
      if (!isDraggingTrack) {
        setCurrentTime(video.currentTime);
      }
      if (video.duration && isFinite(video.duration) && video.duration > 0 && duration <= 0) {
        setDuration(video.duration);
      }

      // Throttle watch progress save
      if (isMovieOrSeries && account?.id && video.currentTime > 10) {
        const now = Date.now();
        if (now - lastSaveTimeRef.current >= 4500) {
          lastSaveTimeRef.current = now;
          saveCurrentProgress();
        }
      }
    };

    // Track listeners for Safari AVPlayer and native tracks
    try {
      const aTracks = (video as any).audioTracks;
      if (aTracks) {
        aTracks.onchange = () => syncNativeTracks();
        aTracks.onaddtrack = () => syncNativeTracks();
      }
      if (video.textTracks) {
        video.textTracks.onchange = () => syncNativeTracks();
        video.textTracks.onaddtrack = () => syncNativeTracks();
      }
    } catch {}

    // Resilient Multi-Tier Error Recovery Pipeline (Fixes Media Error Code 4 / Code 3 on all platforms)
    video.onerror = () => {
      const err = video.error;
      const code = err ? err.code : 0;
      console.warn('HTML5 Video Error code:', code, err ? err.message : '');

      const cleanTarget = cleanTargetUrl || targetUrl;
      const encodedTarget = encodeURIComponent(cleanTarget);

      // Tier 1 for Live streams: try alternative extension (.ts <-> .m3u8)
      if (isLive && fallbackTierRef.current === 0) {
        fallbackTierRef.current = 1;
        if (cleanTarget.includes('.ts')) {
          const altM3u8 = cleanTarget.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
          if (altM3u8 !== cleanTarget) {
            setErrorMsg(null);
            setLoading(true);
            setLoadingStatus('Tentativo formato alternativo (HLS)...');
            setTimeout(() => {
              initWebPlayer(XtreamAPI.getProxyUrl(altM3u8, true));
            }, 100);
            return;
          }
        } else if (cleanTarget.includes('.m3u8')) {
          const altTs = cleanTarget.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
          if (altTs !== cleanTarget) {
            setErrorMsg(null);
            setLoading(true);
            setLoadingStatus('Tentativo formato alternativo (TS)...');
            setTimeout(() => {
              initWebPlayer(XtreamAPI.getProxyUrl(altTs, true));
            }, 100);
            return;
          }
        }
      }

      // Tier 2: Real-time FFmpeg pipe remuxer via server.py (/api/transcode with H.264 fallback)
      if (fallbackTierRef.current <= 1 && !targetUrl.includes('/api/transcode')) {
        fallbackTierRef.current = 2;
        setErrorMsg(null);
        setLoading(true);
        setLoadingStatus('Transcodifica compatibile (FFmpeg)...');
        const transcodeUrl = `/api/transcode?url=${encodedTarget}&h264=1`;
        setTimeout(() => {
          initWebPlayer(transcodeUrl);
        }, 100);
        return;
      }

      // Tier 3: Switch to HLS Master Playlist remuxer (/api/hls/master.m3u8 with H.264 fallback)
      if (fallbackTierRef.current <= 2 && !targetUrl.includes('/api/hls/master.m3u8')) {
        fallbackTierRef.current = 3;
        setErrorMsg(null);
        setLoading(true);
        setLoadingStatus('Ottimizzazione formato stream (HLS)...');
        const fallbackHlsUrl = `/api/hls/master.m3u8?url=${encodedTarget}&h264=1`;
        setTimeout(() => {
          initWebPlayer(fallbackHlsUrl);
        }, 100);
        return;
      }

      // Tier 4: Try proxy with remux=1
      if (fallbackTierRef.current <= 3 && !targetUrl.includes('remux=1')) {
        fallbackTierRef.current = 4;
        setErrorMsg(null);
        setLoading(true);
        setLoadingStatus('Tentativo proxy remux...');
        const proxyRemuxUrl = `/api/proxy?url=${encodedTarget}&remux=1`;
        setTimeout(() => {
          initWebPlayer(proxyRemuxUrl);
        }, 100);
        return;
      }

      setErrorMsg(`Impossibile riprodurre il flusso multimediale (Codice ${code || 'sorgente non supportata'}).`);
      setLoading(false);
    };

    // Fullscreen listeners
    const handleWebkitEnd = () => {
      setIsFullscreen(false);
      video.controls = false;
      // Do NOT call handleClose() here so exiting iOS fullscreen does not kill the stream!
    };
    video.addEventListener('webkitendfullscreen', handleWebkitEnd);

    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(isFs);
      if (!isFs) {
        video.controls = false;
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // ─────────────────────────────────────────────────────────────
    // ENGINE SELECTION PIPELINE
    // ─────────────────────────────────────────────────────────────

    // Engine 1: Apple Native HLS (Safari on iOS / iPadOS / macOS)
    if (isHls && canNativeHls && isIOS) {
      video.src = targetUrl;
      video.load();
      safePlay(video);
    }
    // Engine 2: mpegts.js for MPEG-TS Live Streams (Chrome, Edge, Firefox, Android Web)
    else if (isLiveTs && mpegts && mpegts.isSupported()) {
      try {
        const player = mpegts.createPlayer({
          type: 'mse',
          isLive: true,
          url: targetUrl
        }, {
          enableWorker: true,
          lazyLoad: false,
          stashInitialSize: 128 * 1024,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 3.5,
          liveBufferLatencyMinRemain: 1.0
        });
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();

        player.on(mpegts.Events.MEDIA_INFO, () => {
          setLoading(false);
          setFirstFrameRendered(true);
          setIsPlaying(true);
        });

        const playPromise = player.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => {
            setIsPlaying(true);
            setLoading(false);
          }).catch((e: any) => {
            console.log('mpegts autoplay pending user gesture:', e);
            safePlay(video);
          });
        } else {
          safePlay(video);
        }

        player.on(mpegts.Events.ERROR, (errType: any, errDetail: any) => {
          console.warn('mpegts error:', errType, errDetail);
          const altM3u8 = cleanUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
          if (altM3u8 !== cleanUrl) {
            initWebPlayer(XtreamAPI.getProxyUrl(altM3u8, true));
          } else if (!targetUrl.includes('/api/hls/master.m3u8')) {
            const encoded = encodeURIComponent(cleanTargetUrl || targetUrl);
            initWebPlayer(`/api/hls/master.m3u8?url=${encoded}`);
          }
        });
      } catch (err) {
        console.warn('mpegts init failed, falling back to HLS:', err);
        const altM3u8 = cleanUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
        if (altM3u8 !== cleanUrl) {
          initWebPlayer(XtreamAPI.getProxyUrl(altM3u8, true));
        } else {
          const encoded = encodeURIComponent(cleanTargetUrl || targetUrl);
          initWebPlayer(`/api/hls/master.m3u8?url=${encoded}`);
        }
      }
    }
    // Engine 2b: Fallback for Live TS on iOS Safari where mpegts (MSE) is not supported
    else if (isLiveTs && isIOS) {
      const altM3u8 = cleanUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
      if (altM3u8 !== cleanUrl) {
        video.src = XtreamAPI.getProxyUrl(altM3u8, true);
        video.load();
        safePlay(video);
      } else {
        const encoded = encodeURIComponent(cleanTargetUrl || targetUrl);
        initWebPlayer(`/api/hls/master.m3u8?url=${encoded}`);
      }
    }
    // Engine 3: HLS.js (Chrome, Firefox, Edge, Android Web)
    else if (isHls && HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 90 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        startLevel: -1,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaFastVoD: 2.0,
        abrEwmaSlowVoD: 8.0,
        abrBandWidthFactor: 0.85,
        abrBandWidthUpFactor: 0.7,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetryTimeout: 32000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        levelLoadingMaxRetryTimeout: 32000,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 64000,
        renderTextTracksNatively: true,
        subtitleDisplay: true,
        autoStartLoad: true,
        progressive: true
      });
      hlsRef.current = hls;

      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, (_event: any, data: any) => {
        const raw = data?.audioTracks || hls.audioTracks || [];
        const tracks: MediaTrack[] = raw.map((t: any, idx: number) => ({
          id: idx,
          label: t.name || t.lang || `Traccia ${idx + 1}`,
          language: t.lang || '',
          active: idx === hls.audioTrack,
          kind: 'audio'
        }));
        if (tracks.length > 0) {
          setAudioTracks(tracks);
          setActiveAudioTrack(hls.audioTrack);
        }
      });

      hls.on(HlsClass.Events.SUBTITLE_TRACKS_UPDATED, (_event: any, data: any) => {
        const raw = data?.subtitleTracks || hls.subtitleTracks || [];
        const tracks: MediaTrack[] = raw.map((t: any, idx: number) => ({
          id: idx,
          label: t.name || t.lang || `Sottotitolo ${idx + 1}`,
          language: t.lang || '',
          active: idx === hls.subtitleTrack,
          kind: 'subtitles'
        }));
        if (tracks.length > 0) {
          setSubtitleTracks(tracks);
          setActiveSubtitleTrack(hls.subtitleTrack);
        }
      });

      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event: any, data: any) => {
        setLoading(false);
        if (data?.levels?.[0]?.details?.totalduration) {
          setDuration(data.levels[0].details.totalduration);
        }

        if (hls.levels && hls.levels.length > 0) {
          const qList: QualityLevel[] = hls.levels.map((lvl: any, idx: number) => ({
            id: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`,
            height: lvl.height,
            width: lvl.width,
            bitrate: lvl.bitrate
          }));
          setQualityLevels(qList);
        }

        safePlay(video);
      });

      hls.on(HlsClass.Events.LEVEL_LOADED, (_event: any, data: any) => {
        if (data?.details?.totalduration && isFinite(data.details.totalduration)) {
          setDuration(data.details.totalduration);
        }
      });

      hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          const clean = cleanTargetUrl || targetUrl;
          const encoded = encodeURIComponent(clean);

          switch (data.type) {
            case HlsClass.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error, executing backoff recovery...', data);
              // If manifest failed to load or parse on live stream, fallback to MPEG-TS
              if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
                if (isLive) {
                  const altTs = clean.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
                  if (altTs !== clean) {
                    cleanupWebPlayer();
                    initWebPlayer(XtreamAPI.getProxyUrl(altTs, true));
                    return;
                  }
                } else if (isMovieOrSeries) {
                  cleanupWebPlayer();
                  initWebPlayer(`/api/transcode?url=${encoded}&h264=1`);
                  return;
                }
              }
              hls.startLoad();
              break;

            case HlsClass.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error, executing buffer recovery...', data.details);
              if (data.details === 'bufferIncompatibleCodecsError' && isMovieOrSeries) {
                // Incompatible video codec (e.g. HEVC in Chrome/Firefox on PC) -> fallback to H.264 transcode
                cleanupWebPlayer();
                initWebPlayer(`/api/transcode?url=${encoded}&h264=1`);
                return;
              }
              hls.recoverMediaError();
              break;

            default:
              console.error('Fatal HLS error:', data);
              if (isLive) {
                const altTs = clean.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
                if (altTs !== clean) {
                  cleanupWebPlayer();
                  initWebPlayer(XtreamAPI.getProxyUrl(altTs, true));
                  return;
                }
              }
              if (isMovieOrSeries) {
                cleanupWebPlayer();
                initWebPlayer(`/api/transcode?url=${encoded}&h264=1`);
                return;
              }
              setErrorMsg('Errore durante la decodifica del flusso.');
              setLoading(false);
              cleanupWebPlayer();
              break;
          }
        }
      });
    }
    // Engine 4: Direct Native Stream (MP4, etc.)
    else {
      video.src = targetUrl;
      video.load();
      safePlay(video);
    }
  }, [
    cleanupWebPlayer,
    stream,
    isLive,
    syncNativeTracks,
    checkResumeProgress,
    isDraggingTrack,
    duration,
    isMovieOrSeries,
    account,
    saveCurrentProgress,
    isIOS,
    cleanTargetUrl,
    safePlay
  ]);

  // Initial Boot & Media Probe
  useEffect(() => {
    if (visible && stream) {
      isClosingRef.current = false;
      setLoading(true);
      setLoadingStatus('Connessione allo stream...');
      setFirstFrameRendered(false);
      setErrorMsg(null);
      setIsPlaying(true);
      setCurrentTime(0);
      setBufferPercent(0);
      fallbackTierRef.current = 0;

      // Extract duration from stream object
      const initialDur = XtreamAPI.extractDuration(stream.rawItem);
      if (initialDur > 0) {
        setDuration(initialDur);
      } else {
        setDuration(0);
      }

      // Probe media info for movies/series
      if (isMovieOrSeries && cleanTargetUrl) {
        fetch(`/api/media_info?url=${encodeURIComponent(cleanTargetUrl)}`)
          .then(res => res.json())
          .then(data => {
            if (data) {
              if (data.duration && data.duration > 0 && isFinite(data.duration)) {
                setDuration(data.duration);
              }
              // Audio tracks from container
              if (data.audio_tracks && Array.isArray(data.audio_tracks) && data.audio_tracks.length > 0) {
                const aList: MediaTrack[] = data.audio_tracks.map((t: any, idx: number) => ({
                  id: idx,
                  label: t.title || t.language || `Traccia ${idx + 1}`,
                  language: t.language || '',
                  active: idx === 0,
                  codec: t.codec,
                  kind: 'audio'
                }));
                setAudioTracks(aList);
                setActiveAudioTrack(0);
              }
              // Subtitle tracks from container
              if (data.subtitle_tracks && Array.isArray(data.subtitle_tracks) && data.subtitle_tracks.length > 0) {
                const sList: MediaTrack[] = data.subtitle_tracks.map((t: any, idx: number) => ({
                  id: idx,
                  label: t.title || t.language || `Sottotitolo ${idx + 1}`,
                  language: t.language || '',
                  active: false,
                  codec: t.codec,
                  kind: 'subtitles'
                }));
                setSubtitleTracks(sList);

                // Inject <track> DOM elements with crossOrigin="anonymous" for Apple AVPlayer & Android
                if (webVideoRef.current) {
                  const vid = webVideoRef.current;
                  const existingTracks = vid.querySelectorAll('track');
                  existingTracks.forEach(tr => tr.remove());

                  data.subtitle_tracks.forEach((sub: any, idx: number) => {
                    const trackEl = document.createElement('track');
                    trackEl.kind = 'subtitles';
                    trackEl.label = sub.title || sub.language || `Sottotitolo ${idx + 1}`;
                    trackEl.srclang = sub.language || 'it';
                    trackEl.src = `/api/subtitles?url=${encodeURIComponent(cleanTargetUrl)}&track_index=${sub.stream_index !== undefined ? sub.stream_index : idx}`;
                    trackEl.default = false;
                    vid.appendChild(trackEl);
                  });
                }
              }
            }
          })
          .catch(() => {});
      }

      if (Platform.OS === 'web') {
        initWebPlayer(stream.streamUrl);
      }
    } else {
      cleanupWebPlayer();
    }

    return () => {
      cleanupWebPlayer();
    };
  }, [visible, stream, isMovieOrSeries, cleanTargetUrl, initWebPlayer, cleanupWebPlayer]);

  // Lifecycle Management (Android ExoPlayer & iOS Backgrounding)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App went to background: pause playback to prevent memory leaks and ghost playback
        if (webVideoRef.current && !webVideoRef.current.paused) {
          webVideoRef.current.pause();
          setIsPlaying(false);
        } else if (nativeVideoRef.current) {
          nativeVideoRef.current.pauseAsync().catch(() => {});
          setIsPlaying(false);
        }
        saveCurrentProgress();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [saveCurrentProgress]);

  // Play / Pause
  const togglePlayPause = useCallback(() => {
    if (requiresUserUnmute && webVideoRef.current) {
      webVideoRef.current.muted = false;
      setIsMuted(false);
      setRequiresUserUnmute(false);
    }
    if (requiresUserGesture) {
      handleUserGesturePlay();
      return;
    }
    if (Platform.OS === 'web' && webVideoRef.current) {
      if (webVideoRef.current.paused) {
        safePlay(webVideoRef.current);
      } else {
        webVideoRef.current.pause();
        setIsPlaying(false);
      }
    } else if (nativeVideoRef.current) {
      if (isPlaying) {
        nativeVideoRef.current.pauseAsync().catch(() => {});
        setIsPlaying(false);
      } else {
        nativeVideoRef.current.playAsync().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [isPlaying, requiresUserUnmute, requiresUserGesture, handleUserGesturePlay, safePlay]);

  // Mute / Unmute
  const toggleMute = useCallback(() => {
    if (Platform.OS === 'web' && webVideoRef.current) {
      const nextMuted = !webVideoRef.current.muted;
      webVideoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setIsMutedAsync(!isMuted).catch(() => {});
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Volume Change
  const changeVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.volume = clamped;
      webVideoRef.current.muted = clamped === 0;
    }
  }, []);

  // Direct Seek
  const seekTo = useCallback((targetSecs: number) => {
    const maxDur = duration > 0 && isFinite(duration) ? duration : (webVideoRef.current?.duration || 0);
    if (maxDur <= 0) return;
    const clamped = Math.max(0, Math.min(maxDur, targetSecs));

    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    } else if (nativeVideoRef.current && maxDur > 0) {
      nativeVideoRef.current.setPositionAsync(clamped * 1000).catch(() => {});
      setCurrentTime(clamped);
    }
  }, [duration]);

  // Relative Seek (+/-10s) with Ripple
  const seekRelative = useCallback((offsetSecs: number) => {
    const cur = (Platform.OS === 'web' && webVideoRef.current)
      ? (webVideoRef.current.currentTime || currentTime)
      : currentTime;

    const maxDur = duration > 0 && isFinite(duration) ? duration : (webVideoRef.current?.duration || 86400);
    const target = Math.max(0, Math.min(maxDur, cur + offsetSecs));

    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.currentTime = target;
      setCurrentTime(target);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setPositionAsync(target * 1000).catch(() => {});
      setCurrentTime(target);
    }

    setSeekFeedback({
      direction: offsetSecs > 0 ? 'forward' : 'back',
      key: Date.now()
    });
    setTimeout(() => {
      setSeekFeedback(null);
    }, 600);
  }, [currentTime, duration]);

  // Fullscreen Toggle
  const toggleFullscreen = useCallback(() => {
    if (Platform.OS === 'web') {
      const video = webVideoRef.current;
      const isCurrentlyFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );

      if (isCurrentlyFs) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
        try {
          if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
          }
        } catch {}
        return;
      }

      // Enter fullscreen:
      // On iPhone (where standard element.requestFullscreen is not supported by Apple Safari):
      if (isIOS && typeof (video as any)?.webkitEnterFullscreen === 'function' && !document.fullscreenEnabled) {
        try {
          (video as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          return;
        } catch (e) {
          console.warn('iOS webkitEnterFullscreen error:', e);
        }
      }

      // On Desktop, iPad, Android:
      // Request fullscreen on player container element so all custom controls, titles, and menus remain interactive
      const playerEl = document.getElementById('iptv-universal-player') || document.documentElement;
      const reqFs = playerEl.requestFullscreen ||
        (playerEl as any).webkitRequestFullscreen ||
        (playerEl as any).mozRequestFullScreen ||
        (playerEl as any).msRequestFullscreen;

      if (reqFs) {
        reqFs.call(playerEl).then(() => {
          setIsFullscreen(true);
          try {
            if (screen.orientation && (screen.orientation as any).lock) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            }
          } catch {}
        }).catch(() => {
          video?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
        });
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.presentFullscreenPlayer();
      setIsFullscreen(true);
    }
  }, [isIOS]);

  // Select Audio Track
  const handleSelectAudioTrack = useCallback((idx: number) => {
    setActiveAudioTrack(idx);
    if (hlsRef.current) {
      try {
        hlsRef.current.audioTrack = idx;
      } catch {}
    } else if (webVideoRef.current) {
      const aTracks = (webVideoRef.current as any).audioTracks;
      if (aTracks && aTracks.length > 0) {
        for (let i = 0; i < aTracks.length; i++) {
          aTracks[i].enabled = (i === idx);
        }
      }
    }
    setAudioTracks(prev => prev.map(t => ({ ...t, active: t.id === idx })));
  }, []);

  // Select Subtitle Track
  const handleSelectSubtitleTrack = useCallback((idx: number) => {
    setActiveSubtitleTrack(idx);
    if (hlsRef.current) {
      try {
        hlsRef.current.subtitleTrack = idx;
      } catch {}
    } else if (webVideoRef.current) {
      const tTracks = webVideoRef.current.textTracks;
      if (tTracks && tTracks.length > 0) {
        for (let i = 0; i < tTracks.length; i++) {
          tTracks[i].mode = (i === idx ? 'showing' : 'disabled');
        }
      }
    }
    setSubtitleTracks(prev => prev.map(t => ({ ...t, active: t.id === idx })));
  }, []);

  // Select Quality Level (ABR)
  const handleSelectQualityLevel = useCallback((levelId: number) => {
    setActiveQualityLevel(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
    }
    setQualityModalVisible(false);
  }, []);

  // Change Playback Speed
  const handleSelectPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.playbackRate = speed;
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setRateAsync(speed, true).catch(() => {});
    }
    setSpeedModalVisible(false);
  }, []);

  // Keyboard Shortcuts (Desktop Web)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.05));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          togglePictureInPicture();
          break;
        case '?':
        case 'h':
        case 'H':
          e.preventDefault();
          setShortcutsModalVisible(prev => !prev);
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          // Cycle subtitle tracks: off -> 0 -> 1 -> ... -> off
          if (subtitleTracks.length > 0) {
            const nextIdx = activeSubtitleTrack < subtitleTracks.length - 1 ? activeSubtitleTrack + 1 : -1;
            handleSelectSubtitleTrack(nextIdx);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement || (document as any).webkitFullscreenElement || isFullscreen) {
            toggleFullscreen();
          } else {
            handleClose();
          }
          break;
        default:
          // Numbers 0..9 seek to 0% .. 90%
          if (e.key >= '0' && e.key <= '9' && duration > 0) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) * 10;
            seekTo((pct / 100) * duration);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    visible,
    togglePlayPause,
    seekRelative,
    changeVolume,
    volume,
    toggleMute,
    toggleFullscreen,
    subtitleTracks,
    activeSubtitleTrack,
    handleSelectSubtitleTrack,
    handleClose,
    duration,
    seekTo
  ]);

  return {
    isIOS,
    isAndroid,
    isTouchDevice,
    isLive,
    isMovieOrSeries,
    webVideoRef,
    nativeVideoRef,
    hlsRef,
    mpegtsRef,
    isPlaying,
    loading,
    loadingStatus,
    firstFrameRendered,
    currentTime,
    duration,
    bufferPercent,
    volume,
    isMuted,
    playbackSpeed,
    isFullscreen,
    errorMsg,
    audioTracks,
    subtitleTracks,
    qualityLevels,
    activeAudioTrack,
    activeSubtitleTrack,
    activeQualityLevel,
    trackModalVisible,
    setTrackModalVisible,
    qualityModalVisible,
    setQualityModalVisible,
    speedModalVisible,
    setSpeedModalVisible,
    shortcutsModalVisible,
    setShortcutsModalVisible,
    isDraggingTrack,
    setIsDraggingTrack,
    dragTime,
    setDragTime,
    seekFeedback,
    resumePrompt,
    setResumePrompt,
    togglePlayPause,
    toggleMute,
    changeVolume,
    seekTo,
    seekRelative,
    toggleFullscreen,
    togglePictureInPicture,
    openDevicePlayer,
    handleSelectAudioTrack,
    handleSelectSubtitleTrack,
    handleSelectQualityLevel,
    handleSelectPlaybackSpeed,
    handleClose,
    initWebPlayer,
    saveCurrentProgress,
    requiresUserUnmute,
    requiresUserGesture,
    handleDismissUnmute,
    handleUserGesturePlay,
    handleNativePlaybackStatusUpdate
  };
}
