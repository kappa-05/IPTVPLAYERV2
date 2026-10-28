import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { PlayingStream } from '../types';
import { XtreamAPI } from '../services/api';

let HlsClass: any = null;
if (Platform.OS === 'web') {
  try {
    HlsClass = require('hls.js');
    if (HlsClass.default) {
      HlsClass = HlsClass.default;
    }
  } catch (e) {
    console.warn('Hls.js not available:', e);
  }
}

let ExpoVideo: any = null;
let ResizeModeEnum: any = null;
if (Platform.OS !== 'web') {
  try {
    const expoAv = require('expo-av');
    ExpoVideo = expoAv.Video;
    ResizeModeEnum = expoAv.ResizeMode;
  } catch (e) {
    console.warn('expo-av not available on this platform');
  }
}

interface VideoPlayerProps {
  visible: boolean;
  stream: PlayingStream | null;
  onClose: () => void;
  onOpenEpg?: () => void;
}

export const UniversalVideoPlayer: React.FC<VideoPlayerProps> = ({
  visible,
  stream,
  onClose,
  onOpenEpg
}) => {
  const { width, height } = useWindowDimensions();

  // Detect Mobile / Touch / Apple Device
  const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && (
    /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ));

  const isAndroid = Platform.OS === 'android' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && (
    /Android/i.test(navigator.userAgent || '')
  ));

  const isTouchDevice = isIOS || isAndroid || (Platform.OS === 'web' && typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

  // Video Element Refs
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const nativeVideoRef = useRef<any>(null);

  // Playback States
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Connessione allo stream...');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);

  // Quick Skip Ripple Feedback Indicator (-10s / +10s)
  const [seekFeedback, setSeekFeedback] = useState<{ direction: 'back' | 'forward'; key: number } | null>(null);

  // Scrubber Dragging State
  const [isDraggingTrack, setIsDraggingTrack] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const trackRef = useRef<any>(null);

  // Timers & Mounted tracking
  const controlsTimeoutRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const retryCountRef = useRef(0);
  const isClosingRef = useRef(false);

  // ── Cinematic Opening & Closing Animations ──
  const animFade = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.95)).current;
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const splashFade = useRef(new Animated.Value(1)).current;

  // ── 100% Robust Content Type Detection (Guaranteed NO Movie marked as LIVE) ──
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

  // ── Smooth Close Trigger with Fade-Out & Scale-Down ──
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    // Gently fade out audio
    if (Platform.OS === 'web' && webVideoRef.current) {
      try {
        const vid = webVideoRef.current;
        let v = vid.volume;
        const fadeAudio = setInterval(() => {
          v = Math.max(0, v - 0.25);
          vid.volume = v;
          if (v <= 0) {
            clearInterval(fadeAudio);
            vid.pause();
          }
        }, 30);
      } catch {}
    }

    // Play smooth cinematic exit animation
    Animated.parallel([
      Animated.timing(animFade, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(animScale, {
        toValue: 0.95,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      })
    ]).start(() => {
      cleanupWebPlayer();
      onClose();
    });
  }, [animFade, animScale, onClose]);

  // ── Reset Controls Auto-Hide Timer ──
  const clearControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }, []);

  const resetControlsTimer = useCallback(() => {
    clearControlsTimer();
    setShowControls(true);
    Animated.timing(controlsAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true
    }).start();

    // Auto-hide after 3.8s if playing
    controlsTimeoutRef.current = setTimeout(() => {
      if (webVideoRef.current && !webVideoRef.current.paused && !isDraggingTrack) {
        Animated.timing(controlsAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true
        }).start(() => {
          setShowControls(false);
        });
      }
    }, 3800);
  }, [clearControlsTimer, controlsAnim, isDraggingTrack]);

  // ── Initialize Media Metadata and Duration ──
  useEffect(() => {
    if (visible && stream) {
      isClosingRef.current = false;
      setLoading(true);
      setLoadingStatus('Connessione allo stream...');
      setErrorMsg(null);
      setIsPlaying(true);
      setCurrentTime(0);
      setBufferPercent(0);
      retryCountRef.current = 0;

      // 1. Initial Duration from raw item if present
      const initialDur = XtreamAPI.extractDuration(stream.rawItem);
      if (initialDur > 0) {
        setDuration(initialDur);
      } else {
        setDuration(0);
      }

      // 2. Fetch server duration probe for movies/series
      if (isMovieOrSeries) {
        let rawUrl = stream.streamUrl;
        if (rawUrl.includes('/api/proxy?url=')) {
          rawUrl = decodeURIComponent(rawUrl.split('/api/proxy?url=')[1]);
        } else if (rawUrl.includes('/api/hls/master.m3u8?url=')) {
          const parts = rawUrl.split('/api/hls/master.m3u8?url=')[1];
          rawUrl = decodeURIComponent(parts.split('&')[0]);
        }
        if (rawUrl.startsWith('http')) {
          fetch(`/api/media_info?url=${encodeURIComponent(rawUrl)}`)
            .then(res => res.json())
            .then(data => {
              if (data && data.duration && data.duration > 0 && isFinite(data.duration)) {
                setDuration(data.duration);
              }
            })
            .catch(() => {});
        }
      }

      // 3. Play Cinematic Open Animation
      animFade.setValue(0);
      animScale.setValue(0.95);
      splashFade.setValue(1);

      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(animScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();

      resetControlsTimer();

      if (Platform.OS === 'web') {
        initWebPlayer(stream.streamUrl);
      }
    } else {
      clearControlsTimer();
      cleanupWebPlayer();
    }

    return () => {
      clearControlsTimer();
      cleanupWebPlayer();
    };
  }, [visible, stream]);

  // ── Keyboard Shortcuts (Desktop Web) ──
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
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
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
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
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, isPlaying, duration, currentTime, isMuted, volume]);

  // ── Web Player Teardown ──
  const cleanupWebPlayer = () => {
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
  };

  // ── Web HTML5 Video & HLS Setup ──
  const initWebPlayer = (targetUrl: string) => {
    cleanupWebPlayer();
    const video = webVideoRef.current;
    if (!video || !stream) return;

    const isM3U8 = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.includes('/api/hls/') || (isLive && !targetUrl.includes('/movie/') && !targetUrl.includes('/series/'));
    const canNativeHls = typeof video.canPlayType === 'function' && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));

    video.onwaiting = () => {
      setLoading(true);
      setLoadingStatus('Buffering...');
    };

    video.onplaying = () => {
      setLoading(false);
      setIsPlaying(true);
      Animated.timing(splashFade, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true
      }).start();

      if (isIOS) {
        tryEnterAppleFullscreen(video);
      }
    };

    video.onpause = () => setIsPlaying(false);
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
    };

    video.ondurationchange = () => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    video.ontimeupdate = () => {
      if (!isDraggingTrack) {
        setCurrentTime(video.currentTime);
      }
      if (video.duration && isFinite(video.duration) && video.duration > 0 && duration <= 0) {
        setDuration(video.duration);
      }
    };

    video.onerror = () => {
      console.warn('HTML5 Video Error:', video.error);
      const code = video.error ? video.error.code : 'ignoto';

      // Fallback 1: If direct stream failed on VOD/Movie, fallback to HLS remuxing
      if (!targetUrl.includes('/api/hls/master.m3u8') && !targetUrl.includes('/api/transcode') && isMovieOrSeries) {
        console.log(`Direct stream error (Code ${code}), falling back to HLS remuxing...`);
        let hlsUrl = '';
        if (targetUrl.includes('/api/proxy?url=')) {
          hlsUrl = targetUrl.replace('/api/proxy?url=', '/api/hls/master.m3u8?url=');
        } else {
          hlsUrl = `/api/hls/master.m3u8?url=${encodeURIComponent(targetUrl)}`;
        }
        initWebPlayer(hlsUrl);
        return;
      }

      // Fallback 2: If HLS failed, fallback to direct proxy stream
      if (targetUrl.includes('/api/hls/master.m3u8') && retryCountRef.current === 0) {
        retryCountRef.current = 1;
        console.log('HLS pipeline error, falling back to direct proxy stream...');
        const proxyUrl = targetUrl.replace('/api/hls/master.m3u8', '/api/proxy');
        initWebPlayer(proxyUrl);
        return;
      }

      setErrorMsg(`Impossibile riprodurre il contenuto (Codice ${code}). Verifica la connessione o il server IPTV.`);
      setLoading(false);
    };

    // Exit fullscreen listener for Apple devices (when user taps 'Done' in native AVPlayer)
    const handleWebkitEnd = () => {
      setIsFullscreen(false);
      handleClose();
    };
    video.addEventListener('webkitendfullscreen', handleWebkitEnd);

    // Apple AVPlayer HLS Engine (iPhone / iPad / Safari)
    if (isM3U8 && canNativeHls) {
      video.src = targetUrl;
      video.load();
      video.play().then(() => {
        tryEnterAppleFullscreen(video);
      }).catch((e) => {
        console.log('Autoplay waiting for user touch:', e);
      });
    } else if (isM3U8 && HlsClass && HlsClass.isSupported()) {
      // HLS.js for Chrome, Firefox, Edge, Android
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: isLive ? 30 : 120,
        maxBufferLength: isLive ? 30 : 90,
        maxMaxBufferLength: isLive ? 60 : 180
      });
      hlsRef.current = hls;

      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event: any, data: any) => {
        setLoading(false);
        if (data?.levels?.[0]?.details?.totalduration) {
          setDuration(data.levels[0].details.totalduration);
        }
        video.play().catch(() => {});
      });

      hls.on(HlsClass.Events.LEVEL_LOADED, (_event: any, data: any) => {
        if (data?.details?.totalduration && isFinite(data.details.totalduration)) {
          setDuration(data.details.totalduration);
        }
      });

      hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case HlsClass.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error, recovering...');
              hls.startLoad();
              break;
            case HlsClass.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal HLS error:', data);
              if (targetUrl.includes('/api/hls/master.m3u8')) {
                const proxyUrl = targetUrl.replace('/api/hls/master.m3u8', '/api/proxy');
                initWebPlayer(proxyUrl);
                return;
              }
              setErrorMsg('Errore critico durante la riproduzione stream.');
              setLoading(false);
              cleanupWebPlayer();
              break;
          }
        }
      });
    } else {
      // Direct MP4 / MKV stream
      video.src = targetUrl;
      video.load();
      video.play().catch(() => {});
    }
  };

  const tryEnterAppleFullscreen = (video: HTMLVideoElement) => {
    if (isIOS && typeof (video as any).webkitEnterFullscreen === 'function') {
      try {
        (video as any).webkitEnterFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.log('Apple fullscreen deferred until user touch:', err);
      }
    }
  };

  // ── Play / Pause ──
  const togglePlayPause = useCallback(() => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      if (isIOS && typeof (webVideoRef.current as any).webkitEnterFullscreen === 'function') {
        try {
          (webVideoRef.current as any).webkitEnterFullscreen();
          setIsFullscreen(true);
        } catch (e) {}
      }
      if (webVideoRef.current.paused) {
        webVideoRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        webVideoRef.current.pause();
        setIsPlaying(false);
      }
    } else if (nativeVideoRef.current) {
      if (isPlaying) {
        nativeVideoRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        nativeVideoRef.current.playAsync();
        setIsPlaying(true);
      }
    }
  }, [isPlaying, isIOS, resetControlsTimer]);

  // ── Mute / Unmute ──
  const toggleMute = useCallback(() => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      const nextMuted = !webVideoRef.current.muted;
      webVideoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setIsMutedAsync(!isMuted);
      setIsMuted(!isMuted);
    }
  }, [isMuted, resetControlsTimer]);

  // ── Volume Slider / Adjust ──
  const adjustVolume = useCallback((delta: number) => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      const newVol = Math.max(0, Math.min(1, webVideoRef.current.volume + delta));
      webVideoRef.current.volume = newVol;
      webVideoRef.current.muted = newVol === 0;
      setVolume(newVol);
      setIsMuted(newVol === 0);
    }
  }, [resetControlsTimer]);

  // ── Direct Seek To Target Timestamp ──
  const seekTo = useCallback((targetSecs: number) => {
    resetControlsTimer();
    const maxDur = duration > 0 && isFinite(duration) ? duration : (webVideoRef.current?.duration || 0);
    if (maxDur <= 0) return;
    const clamped = Math.max(0, Math.min(maxDur, targetSecs));

    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    } else if (nativeVideoRef.current && maxDur > 0) {
      nativeVideoRef.current.setPositionAsync(clamped * 1000);
      setCurrentTime(clamped);
    }
  }, [duration, resetControlsTimer]);

  // ── Relative Seek with Ripple Feedback (±10s) ──
  const seekRelative = useCallback((offsetSecs: number) => {
    resetControlsTimer();
    const cur = (Platform.OS === 'web' && webVideoRef.current)
      ? (webVideoRef.current.currentTime || currentTime)
      : currentTime;

    const maxDur = duration > 0 && isFinite(duration) ? duration : (webVideoRef.current?.duration || 86400);
    const target = Math.max(0, Math.min(maxDur, cur + offsetSecs));

    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.currentTime = target;
      setCurrentTime(target);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setPositionAsync(target * 1000);
      setCurrentTime(target);
    }

    // Trigger visual ripple burst
    setSeekFeedback({
      direction: offsetSecs > 0 ? 'forward' : 'back',
      key: Date.now()
    });
    setTimeout(() => {
      setSeekFeedback(null);
    }, 650);
  }, [currentTime, duration, resetControlsTimer]);

  // ── Fullscreen Toggle ──
  const toggleFullscreen = useCallback(() => {
    resetControlsTimer();
    if (Platform.OS === 'web') {
      const video = webVideoRef.current;
      if (isIOS && video && typeof (video as any).webkitEnterFullscreen === 'function') {
        try {
          (video as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          return;
        } catch {}
      }

      if (!document.fullscreenElement) {
        const root = document.getElementById('root') || document.documentElement;
        root.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {
          video?.requestFullscreen?.().then(() => setIsFullscreen(true));
        });
      } else {
        document.exitFullscreen?.().then(() => setIsFullscreen(false));
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.presentFullscreenPlayer();
    }
  }, [isIOS, resetControlsTimer]);

  // ── Open in VLC (Desktop) ──
  const handleOpenInVlc = () => {
    if (!stream?.streamUrl) return;
    let target = stream.streamUrl;
    if (target.includes('/api/proxy?url=')) {
      target = decodeURIComponent(target.split('/api/proxy?url=')[1]);
    } else if (target.includes('/api/hls/master.m3u8?url=')) {
      const parts = target.split('/api/hls/master.m3u8?url=')[1];
      target = decodeURIComponent(parts.split('&')[0]);
    }
    fetch(`/api/open_vlc?url=${encodeURIComponent(target)}`)
      .then(res => res.json())
      .catch(() => {});
  };

  // ── Time Formatting (H:MM:SS or M:SS) ──
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ── Interactive Timeline Scrubbing (Drag & Click) ──
  const calculateScrubPosition = (clientX: number) => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect ? trackRef.current.getBoundingClientRect() : null;
    if (!rect) return 0;
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = offsetX / rect.width;
    return ratio * duration;
  };

  const handleTimelineMouseDown = (e: any) => {
    if (duration <= 0) return;
    e.preventDefault?.();
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const target = calculateScrubPosition(clientX);
    setIsDraggingTrack(true);
    setDragTime(target);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const movedTarget = calculateScrubPosition(moveEvent.clientX);
      setDragTime(movedTarget);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalTarget = calculateScrubPosition(upEvent.clientX);
      setIsDraggingTrack(false);
      setDragTime(null);
      seekTo(finalTarget);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTimelineTouchStart = (e: any) => {
    if (duration <= 0) return;
    const touch = e.nativeEvent.touches[0];
    if (!touch) return;
    const target = calculateScrubPosition(touch.clientX);
    setIsDraggingTrack(true);
    setDragTime(target);
  };

  const handleTimelineTouchMove = (e: any) => {
    if (!isDraggingTrack || duration <= 0) return;
    const touch = e.nativeEvent.touches[0];
    if (!touch) return;
    const target = calculateScrubPosition(touch.clientX);
    setDragTime(target);
  };

  const handleTimelineTouchEnd = () => {
    if (!isDraggingTrack || duration <= 0) return;
    if (dragTime !== null) {
      seekTo(dragTime);
    }
    setIsDraggingTrack(false);
    setDragTime(null);
  };

  // ── Double Tap Center to Skip / Single Tap to Toggle Controls ──
  const handleCenterTap = (e: any) => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timeDiff < 300) {
      // Double tap detected
      const clickX = e.nativeEvent?.locationX ?? e.nativeEvent?.offsetX ?? (width / 2);
      if (clickX < width / 2) {
        seekRelative(-10);
      } else {
        seekRelative(10);
      }
    } else {
      // Single tap: toggle controls, and on iOS launch native player if not active
      if (isIOS && webVideoRef.current && typeof (webVideoRef.current as any).webkitEnterFullscreen === 'function') {
        try {
          (webVideoRef.current as any).webkitEnterFullscreen();
          setIsFullscreen(true);
        } catch (err) {}
      }
      if (showControls) {
        Animated.timing(controlsAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }).start(() => setShowControls(false));
      } else {
        resetControlsTimer();
      }
    }
  };

  if (!visible || !stream) return null;

  const displayTime = isDraggingTrack && dragTime !== null ? dragTime : currentTime;
  const progressPercent = duration > 0 && isFinite(duration)
    ? Math.min(100, Math.max(0, (displayTime / duration) * 100))
    : 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: animFade,
            transform: [{ scale: animScale }]
          }
        ]}
        // @ts-ignore
        onMouseMove={resetControlsTimer}
      >
        {/* Ambient Glow Backdrop from content poster */}
        {stream.poster ? (
          <Image
            source={{ uri: stream.poster }}
            style={styles.ambientBackdrop}
            blurRadius={ Platform.OS === 'web' ? 40 : 25 }
          />
        ) : null}

        {/* Web HTML5 Video Engine (Plays native device AVPlayer on iOS when playsInline=false) */}
        {Platform.OS === 'web' ? (
          <video
            // @ts-ignore
            ref={webVideoRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
              objectFit: 'contain'
            }}
            playsInline={!isIOS}
            controls={isIOS}
            autoPlay
          />
        ) : (
          /* Native ExoPlayer (Android) / AVPlayer (iOS) */
          ExpoVideo ? (
            <ExpoVideo
              ref={nativeVideoRef}
              style={styles.video}
              source={{ uri: stream.streamUrl }}
              useNativeControls={false}
              resizeMode={ResizeModeEnum ? ResizeModeEnum.CONTAIN : 'contain'}
              shouldPlay={true}
              onPlaybackStatusUpdate={(status: any) => {
                if (status.isLoaded) {
                  setLoading(status.isBuffering);
                  setIsPlaying(status.isPlaying);
                  setIsMuted(status.isMuted);
                  setCurrentTime((status.positionMillis || 0) / 1000);
                  if (status.durationMillis && status.durationMillis > 0) {
                    setDuration(status.durationMillis / 1000);
                  }
                } else if (status.error) {
                  setErrorMsg('Errore riproduzione stream nativo.');
                  setLoading(false);
                }
              }}
            />
          ) : null
        )}

        {/* ── Cinematic Loading Splash Overlay ── */}
        {loading && (
          <Animated.View style={[styles.splashOverlay, { opacity: splashFade }]} pointerEvents="none">
            <View style={styles.splashCard}>
              {stream.poster ? (
                <View style={styles.splashPosterWrapper}>
                  <Image source={{ uri: stream.poster }} style={styles.splashPoster} resizeMode="cover" />
                </View>
              ) : (
                <View style={[styles.splashPosterWrapper, styles.splashPosterFallback]}>
                  <Ionicons name={isLive ? 'tv-outline' : 'film-outline'} size={42} color={colors.primary} />
                </View>
              )}

              <View style={styles.splashInfo}>
                <View style={[styles.typeBadge, isLive ? styles.typeBadgeLive : styles.typeBadgeVod]}>
                  <Text style={styles.typeBadgeText}>
                    {isLive ? 'LIVE' : stream.type === 'series' ? 'SERIE' : 'VOD'}
                  </Text>
                </View>
                <Text style={styles.splashTitle} numberOfLines={2}>
                  {stream.title}
                </Text>
                {stream.subTitle ? (
                  <Text style={styles.splashSubtitle} numberOfLines={1}>
                    {stream.subTitle}
                  </Text>
                ) : null}

                <View style={styles.splashLoaderRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.splashLoadingStatus}>{loadingStatus}</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Visual Seek Ripple Indicator (-10s / +10s) ── */}
        {seekFeedback && (
          <View
            style={[
              styles.seekRippleBadge,
              seekFeedback.direction === 'back' ? styles.seekRippleLeft : styles.seekRippleRight
            ]}
            pointerEvents="none"
          >
            <View style={styles.seekRippleInner}>
              <Ionicons
                name={seekFeedback.direction === 'back' ? 'arrow-undo' : 'arrow-redo'}
                size={28}
                color="#fff"
              />
              <Text style={styles.seekRippleText}>
                {seekFeedback.direction === 'back' ? '-10s' : '+10s'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Center Tap Layer for Controls & Double Tap ── */}
        <TouchableOpacity
          style={styles.centerTapArea}
          activeOpacity={1}
          onPress={handleCenterTap}
        />

        {/* ── Error Display Modal ── */}
        {errorMsg && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.accentRed} />
              <Text style={styles.errorHeading}>Impossibile riprodurre lo stream</Text>
              <Text style={styles.errorMessage}>{errorMsg}</Text>

              <View style={styles.errorActionsRow}>
                <TouchableOpacity
                  style={[styles.btnAction, styles.btnPrimary]}
                  onPress={() => {
                    setErrorMsg(null);
                    setLoading(true);
                    if (Platform.OS === 'web') {
                      initWebPlayer(stream.streamUrl);
                    } else if (nativeVideoRef.current) {
                      nativeVideoRef.current.replayAsync();
                    }
                  }}
                >
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.btnActionText}>Riprova</Text>
                </TouchableOpacity>

                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    style={[styles.btnAction, styles.btnSecondary]}
                    onPress={handleOpenInVlc}
                  >
                    <Ionicons name="play-outline" size={18} color="#fff" />
                    <Text style={styles.btnActionText}>Apri in VLC</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.btnAction, styles.btnDismiss]}
                  onPress={handleClose}
                >
                  <Text style={styles.btnActionText}>Chiudi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Full Interactive Controls Overlay (Universal Desktop & Mobile) ── */}
        {showControls && (
          <Animated.View
            style={[
              styles.controlsOverlay,
              { opacity: controlsAnim }
            ]}
            pointerEvents="box-none"
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              <View style={styles.topLeft}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handleClose}
                  accessibilityLabel="Chiudi player"
                >
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                  <Text style={styles.backButtonText}>Chiudi</Text>
                </TouchableOpacity>

                <View style={styles.titleContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.typeBadge, isLive ? styles.typeBadgeLive : styles.typeBadgeVod]}>
                      {isLive && <View style={styles.livePulseDot} />}
                      <Text style={styles.typeBadgeText}>
                        {isLive ? 'LIVE' : stream.type === 'series' ? 'SERIE' : 'VOD'}
                      </Text>
                    </View>
                    <Text style={styles.streamTitle} numberOfLines={1}>
                      {stream.title}
                    </Text>
                  </View>
                  {stream.subTitle ? (
                    <Text style={styles.streamSubtitle} numberOfLines={1}>
                      {stream.subTitle}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.topRight}>
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    style={styles.glassBtn}
                    onPress={() => {
                      if (webVideoRef.current) {
                        const v = webVideoRef.current as any;
                        if (typeof v.webkitEnterFullscreen === 'function') {
                          try {
                            v.webkitEnterFullscreen();
                            setIsFullscreen(true);
                          } catch (e) {}
                        } else if (typeof v.requestFullscreen === 'function') {
                          v.requestFullscreen();
                          setIsFullscreen(true);
                        }
                      }
                    }}
                  >
                    <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                    <Text style={styles.glassBtnText}>Player Dispositivo</Text>
                  </TouchableOpacity>
                )}

                {isLive && onOpenEpg && (
                  <TouchableOpacity style={styles.glassBtn} onPress={onOpenEpg}>
                    <Ionicons name="calendar-outline" size={16} color="#fff" />
                    <Text style={styles.glassBtnText}>Guida TV</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.roundIconBtn} onPress={handleClose}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Center Big Play/Pause Trigger */}
            <View style={styles.centerControlArea} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.bigPlayButton}
                activeOpacity={0.8}
                onPress={togglePlayPause}
                accessibilityLabel={isPlaying ? 'Pausa' : 'Riproduci'}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={38} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Bottom Controls Bar */}
            <View style={styles.bottomBar} pointerEvents="auto">
              {/* Scrubber Timeline (For Movies and Series) */}
              {!isLive && (
                <View
                  // @ts-ignore
                  ref={trackRef}
                  style={styles.timelineHitArea}
                  // @ts-ignore
                  onMouseDown={handleTimelineMouseDown}
                  onTouchStart={handleTimelineTouchStart}
                  onTouchMove={handleTimelineTouchMove}
                  onTouchEnd={handleTimelineTouchEnd}
                  onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                >
                  <View style={styles.timelineBarBackground}>
                    {/* Buffer Bar */}
                    <View style={[styles.timelineBuffer, { width: `${bufferPercent}%` }]} />
                    {/* Played Bar */}
                    <View style={[styles.timelinePlayed, { width: `${progressPercent}%` }]} />
                    {/* Scrubber Handle Thumb */}
                    <View style={[styles.timelineThumb, { left: `${progressPercent}%` }]} />
                  </View>

                  {/* Scrubber Hover / Drag Tooltip */}
                  {isDraggingTrack && dragTime !== null && (
                    <View style={[styles.scrubTooltip, { left: `${progressPercent}%` }]}>
                      <Text style={styles.scrubTooltipText}>{formatTime(dragTime)}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Controls Row */}
              <View style={styles.controlsRow}>
                {/* Left Controls: Play/Pause, -10s, +10s, Time */}
                <View style={styles.leftControlsGroup}>
                  <TouchableOpacity style={styles.ctrlIconBtn} onPress={togglePlayPause}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
                  </TouchableOpacity>

                  {!isLive && (
                    <>
                      <TouchableOpacity
                        style={styles.ctrlIconBtn}
                        onPress={() => seekRelative(-10)}
                        accessibilityLabel="Indietro di 10 secondi"
                      >
                        <Ionicons name="arrow-undo" size={20} color="#fff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.ctrlIconBtn}
                        onPress={() => seekRelative(10)}
                        accessibilityLabel="Avanti di 10 secondi"
                      >
                        <Ionicons name="arrow-redo" size={20} color="#fff" />
                      </TouchableOpacity>
                    </>
                  )}

                  {isLive ? (
                    <View style={styles.liveStatusBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.liveStatusText}>DIRETTA</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowTimeRemaining(!showTimeRemaining)}
                      style={styles.timeDisplay}
                    >
                      <Text style={styles.timeCurrent}>{formatTime(currentTime)}</Text>
                      <Text style={styles.timeSeparator}>/</Text>
                      <Text style={styles.timeTotal}>
                        {showTimeRemaining && duration > 0
                          ? `-${formatTime(Math.max(0, duration - currentTime))}`
                          : formatTime(duration)}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Right Controls: Volume, Fullscreen */}
                <View style={styles.rightControlsGroup}>
                  {/* Volume Button */}
                  <TouchableOpacity style={styles.ctrlIconBtn} onPress={toggleMute}>
                    <Ionicons
                      name={isMuted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>

                  {/* Fullscreen Button */}
                  <TouchableOpacity
                    style={styles.ctrlIconBtn}
                    onPress={toggleFullscreen}
                    accessibilityLabel="Schermo intero"
                  >
                    <Ionicons
                      name={isFullscreen ? 'contract' : 'expand'}
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030508',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative'
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
  },
  ambientBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.18,
    // @ts-ignore
    filter: Platform.OS === 'web' ? 'blur(60px)' : undefined
  },

  // ── Cinematic Splash Overlay ──
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3, 5, 8, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    padding: 20
  },
  splashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 34, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    maxWidth: 520,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(20px)' : undefined
  },
  splashPosterWrapper: {
    width: 90,
    height: 130,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#10131a',
    marginRight: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  splashPoster: {
    width: '100%',
    height: '100%'
  },
  splashPosterFallback: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  splashInfo: {
    flex: 1,
    justifyContent: 'center'
  },
  splashTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 6,
    marginBottom: 4
  },
  splashSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12
  },
  splashLoaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8
  },
  splashLoadingStatus: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500'
  },

  // ── Seek Ripple Burst Feedback ──
  seekRippleBadge: {
    position: 'absolute',
    top: '45%',
    zIndex: 25,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(10px)' : undefined
  },
  seekRippleLeft: {
    left: '15%'
  },
  seekRippleRight: {
    right: '15%'
  },
  seekRippleInner: {
    alignItems: 'center',
    gap: 4
  },
  seekRippleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff'
  },

  // ── Error Overlay ──
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3, 5, 8, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    padding: 24
  },
  errorCard: {
    backgroundColor: '#141822',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 28,
    maxWidth: 480,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 30
  },
  errorHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 14,
    marginBottom: 8,
    textAlign: 'center'
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22
  },
  errorActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  btnPrimary: {
    backgroundColor: '#3b82f6'
  },
  btnSecondary: {
    backgroundColor: '#212838',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  btnDismiss: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  btnActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },

  // ── Controls Overlay ──
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 20
  },
  centerTapArea: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    bottom: 90,
    zIndex: 15
  },

  // ── Top Bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 48 : 18,
    paddingBottom: 24,
    backgroundColor: 'transparent',
    // @ts-ignore
    background: Platform.OS === 'web'
      ? 'linear-gradient(to bottom, rgba(3, 5, 8, 0.92) 0%, rgba(3, 5, 8, 0.4) 65%, transparent 100%)'
      : undefined
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 16
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(12px)' : undefined
  },
  backButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  titleContainer: {
    flex: 1
  },
  streamTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  streamSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  glassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(12px)' : undefined
  },
  glassBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  roundIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(12px)' : undefined
  },

  // ── Badges ──
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4
  },
  typeBadgeVod: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)'
  },
  typeBadgeLive: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    gap: 5
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444'
  },

  // ── Center Big Play Button ──
  centerControlArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bigPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(15, 20, 30, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(16px)' : undefined
  },

  // ── Bottom Controls Bar ──
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 18,
    paddingTop: 16,
    backgroundColor: 'transparent',
    // @ts-ignore
    background: Platform.OS === 'web'
      ? 'linear-gradient(to top, rgba(3, 5, 8, 0.94) 0%, rgba(3, 5, 8, 0.5) 65%, transparent 100%)'
      : undefined
  },

  // ── Timeline Scrubber ──
  timelineHitArea: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
    // @ts-ignore
    cursor: Platform.OS === 'web' ? 'pointer' : undefined
  },
  timelineBarBackground: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    position: 'relative'
  },
  timelineBuffer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)'
  },
  timelinePlayed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: '#3b82f6'
  },
  timelineThumb: {
    position: 'absolute',
    top: -5,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginLeft: -7.5,
    borderWidth: 2,
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6
  },
  scrubTooltip: {
    position: 'absolute',
    top: -28,
    marginLeft: -26,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  scrubTooltipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },

  // ── Controls Row ──
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6
  },
  leftControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  rightControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  ctrlIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    // @ts-ignore
    backdropFilter: Platform.OS === 'web' ? 'blur(8px)' : undefined
  },

  // ── Time Display ──
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6
  },
  timeCurrent: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  timeSeparator: {
    color: colors.textMuted,
    fontSize: 13
  },
  timeTotal: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },

  // ── Live Status Badge ──
  liveStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6
  },
  liveStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  }
});
