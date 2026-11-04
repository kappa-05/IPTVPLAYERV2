import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { PlayingStream, Account, MediaTrack, QualityLevel, PlaybackSpeed } from '../../types';
import { XtreamAPI } from '../../services/api';
import { StorageService } from '../../services/storage';

let HlsClass: any = null;
let mpegts: any = null;

if (Platform.OS === 'web') {
  try {
    HlsClass = require('hls.js');
    if (HlsClass?.default) HlsClass = HlsClass.default;
  } catch {}
  try {
    mpegts = require('mpegts.js');
    if (mpegts?.default) mpegts = mpegts.default;
  } catch {}
}

export type VideoFitMode = 'contain' | 'cover' | 'fill';

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
  // Video element refs
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const mpegtsRef = useRef<any>(null);

  // Core playback states
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferPercent, setBufferPercent] = useState(0);

  // Audio & Aspect Ratio
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [videoFit, setVideoFit] = useState<VideoFitMode>('contain');
  const [fitFeedback, setFitFeedback] = useState<string | null>(null);
  const [volumeFeedback, setVolumeFeedback] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tracks & Quality
  const [audioTracks, setAudioTracks] = useState<MediaTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<MediaTrack[]>([]);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(0);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<number>(-1);
  const [activeQualityLevel, setActiveQualityLevel] = useState<number>(-1);

  // Modals visibility
  const [trackModalVisible, setTrackModalVisible] = useState(false);
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [speedModalVisible, setSpeedModalVisible] = useState(false);
  const [shortcutsModalVisible, setShortcutsModalVisible] = useState(false);

  // Autoplay banner & Errors
  const [showMutedBanner, setShowMutedBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resume prompt
  const [resumePrompt, setResumePrompt] = useState<{ visible: boolean; time: number } | null>(null);

  // Timeouts
  const fitTimeoutRef = useRef<any>(null);
  const volumeTimeoutRef = useRef<any>(null);
  const lastSaveTimeRef = useRef(0);
  const isSwitchingRef = useRef(false);

  // Stream type detection
  const isLive = useMemo(() => {
    if (!stream) return false;
    return stream.type === 'live' || (!stream.rawItem?.container_extension && stream.type !== 'vod' && stream.type !== 'series');
  }, [stream]);

  const isMovieOrSeries = !isLive;

  // Cleanup helper
  const destroyEngines = useCallback(() => {
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
        const v = webVideoRef.current;
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {}
    }
  }, []);

  // Save watch progress to storage
  const saveProgress = useCallback(() => {
    if (!isMovieOrSeries || !account?.id || !stream) return;
    const cur = webVideoRef.current?.currentTime || currentTime;
    const dur = webVideoRef.current?.duration || duration;
    if (cur > 10 && dur > 0) {
      const pct = Math.min(100, Math.floor((cur / dur) * 100));
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

  // Safe Play that handles browser autoplay policies smoothly
  const triggerPlay = useCallback(async (vid?: HTMLVideoElement) => {
    const v = vid || webVideoRef.current;
    if (!v) return;
    try {
      await v.play();
      setIsPlaying(true);
      setShowMutedBanner(false);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (err?.name === 'NotAllowedError') {
        // Autoplay policy: start muted and display subtle pill banner
        try {
          v.muted = true;
          setIsMuted(true);
          await v.play();
          setIsPlaying(true);
          setShowMutedBanner(true);
        } catch {}
      }
    }
  }, []);

  // Stream Loader
  const loadStream = useCallback((targetUrl: string) => {
    destroyEngines();
    const video = webVideoRef.current;
    if (!video || !targetUrl) return;

    setIsBuffering(true);
    setFirstFrameRendered(false);
    setErrorMsg(null);
    setIsPlaying(true);

    const cleanUrl = targetUrl.toLowerCase();
    const isM3u8 = cleanUrl.includes('.m3u8') || targetUrl.includes('/api/hls/');
    const isTs = cleanUrl.endsWith('.ts') || cleanUrl.includes('.ts?') || cleanUrl.includes('.ts&') || stream?.extension === 'ts';

    // 1. HLS Engine (Hls.js)
    if (isM3u8 && HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferHole: 0.5,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 6,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        autoStartLoad: true
      });
      hlsRef.current = hls;

      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        triggerPlay(video);

        // Quality levels
        if (hls.levels && hls.levels.length > 1) {
          const qList: QualityLevel[] = hls.levels.map((lvl: any, idx: number) => ({
            id: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`,
            height: lvl.height,
            width: lvl.width,
            bitrate: lvl.bitrate
          }));
          setQualityLevels(qList);
        }

        // Audio tracks
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const aList: MediaTrack[] = hls.audioTracks.map((t: any, idx: number) => ({
            id: idx,
            label: t.name || t.lang || `Traccia ${idx + 1}`,
            language: t.lang || '',
            active: idx === hls.audioTrack,
            kind: 'audio'
          }));
          setAudioTracks(aList);
        }
      });

      hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case HlsClass.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case HlsClass.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              // Fallback to TS if live
              if (isLive && !isSwitchingRef.current) {
                isSwitchingRef.current = true;
                const altTs = targetUrl.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
                if (altTs !== targetUrl) {
                  setTimeout(() => {
                    isSwitchingRef.current = false;
                    loadStream(altTs);
                  }, 200);
                  return;
                }
              }
              // Fallback for VOD / Movies: if HLS failed and did not have &h264=1, retry with forced H264
              if (!isLive && !isSwitchingRef.current && !targetUrl.includes('&h264=1')) {
                isSwitchingRef.current = true;
                const forceH264Url = targetUrl + '&h264=1';
                setTimeout(() => {
                  isSwitchingRef.current = false;
                  loadStream(forceH264Url);
                }, 200);
                return;
              }
              setErrorMsg('Impossibile caricare il flusso multimediale.');
              setIsBuffering(false);
              break;
          }
        }
      });
      return;
    }

    // 2. MPEG-TS Engine (mpegts.js) for TS live streams
    if (isTs && mpegts && mpegts.isSupported()) {
      try {
        const player = mpegts.createPlayer({
          type: 'mse',
          isLive: true,
          url: targetUrl
        }, {
          enableWorker: true,
          lazyLoad: false,
          stashInitialSize: 512 * 1024,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
          liveBufferLatencyChasing: false // NEVER chase latency on IPTV: prevents stuttering
        });
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();

        player.on(mpegts.Events.MEDIA_INFO, () => {
          setIsBuffering(false);
          setFirstFrameRendered(true);
        });

        const p = player.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => triggerPlay(video));
        }

        player.on(mpegts.Events.ERROR, (errType: any, errDetail: any) => {
          console.warn('mpegts warning:', errType, errDetail);
        });
        return;
      } catch (e) {
        console.warn('mpegts failed, trying direct HLS:', e);
      }
    }

    // 3. Direct HTML5 Video (Native MP4, Apple Safari HLS)
    video.src = targetUrl;
    video.load();
    triggerPlay(video);
  }, [destroyEngines, stream, triggerPlay, isLive]);

  // Main lifecycle when stream changes
  useEffect(() => {
    if (visible && stream) {
      isSwitchingRef.current = false;
      setCurrentTime(0);
      setDuration(0);
      setBufferPercent(0);
      setErrorMsg(null);
      setResumePrompt(null);

      // Check VOD history for resume
      if (isMovieOrSeries && account?.id) {
        StorageService.getHistory(account.id).then(hist => {
          const match = hist.find(h => String(h.id) === String(stream.streamId));
          if (match && match.currentTime > 15 && match.currentTime < match.duration - 30) {
            setResumePrompt({ visible: true, time: match.currentTime });
          }
        }).catch(() => {});
      }

      if (Platform.OS === 'web') {
        loadStream(stream.streamUrl);
      }
    } else {
      destroyEngines();
    }

    return () => {
      destroyEngines();
    };
  }, [visible, stream, isMovieOrSeries, account, loadStream, destroyEngines]);

  // Video Element Events Attachment
  useEffect(() => {
    const video = webVideoRef.current;
    if (!video || Platform.OS !== 'web') return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setFirstFrameRendered(true);
      setIsPlaying(true);
    };
    const onCanPlay = () => setIsBuffering(false);
    const onLoadedData = () => {
      if (video.readyState >= 2) setFirstFrameRendered(true);
    };
    const onTimeUpdate = () => {
      if (video.currentTime > 0) setFirstFrameRendered(true);
      setCurrentTime(video.currentTime);
      // Auto-save history every 5 seconds for VOD
      if (isMovieOrSeries && account?.id && video.currentTime > 10) {
        const now = Date.now();
        if (now - lastSaveTimeRef.current >= 5000) {
          lastSaveTimeRef.current = now;
          saveProgress();
        }
      }
    };
    const onDurationChange = () => {
      if (video.duration && isFinite(video.duration)) setDuration(video.duration);
    };
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBufferPercent(Math.min(100, (end / video.duration) * 100));
      }
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onError = () => {
      const code = video.error ? video.error.code : 0;
      console.warn('HTML5 Video Error code:', code);
      if (!isSwitchingRef.current && stream?.streamUrl) {
        if (isLive) {
          isSwitchingRef.current = true;
          const clean = stream.streamUrl;
          const altM3u8 = clean.includes('.ts') ? clean.replace(/\.ts(\?.*)?$/i, '.m3u8$1') : clean;
          if (altM3u8 !== clean) {
            setTimeout(() => {
              isSwitchingRef.current = false;
              loadStream(altM3u8);
            }, 300);
            return;
          }
        } else {
          // VOD / Movie / Series Error (Code 3: MEDIA_ERR_DECODE or Code 4: MEDIA_ERR_SRC_NOT_SUPPORTED)
          const curUrl = stream.streamUrl;
          // If the stream wasn't routed through HLS yet, switch to server HLS pipeline with forceH264
          if (!curUrl.includes('/api/hls/')) {
            isSwitchingRef.current = true;
            console.log('[PlayerCore] Video error code', code, 'on movie/series. Falling back to server HLS remuxer...');
            const fallbackUrl = XtreamAPI.getHlsUrl(curUrl, stream.rawItem, true);
            setTimeout(() => {
              isSwitchingRef.current = false;
              loadStream(fallbackUrl);
            }, 200);
            return;
          } else if (!curUrl.includes('&h264=1')) {
            // If already on HLS but failed, force H.264 transcode
            isSwitchingRef.current = true;
            console.log('[PlayerCore] HLS error code', code, 'on movie/series. Retrying with forced H.264 transcode...');
            const forceH264Url = curUrl + '&h264=1';
            setTimeout(() => {
              isSwitchingRef.current = false;
              loadStream(forceH264Url);
            }, 200);
            return;
          }
        }
      }
      setErrorMsg('Impossibile riprodurre lo stream multimediale.');
      setIsBuffering(false);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('error', onError);
    };
  }, [stream, isMovieOrSeries, account, isLive, loadStream, saveProgress]);

  // Controls Handlers
  const togglePlayPause = useCallback(() => {
    const video = webVideoRef.current;
    if (!video) return;
    if (showMutedBanner) {
      video.muted = false;
      setIsMuted(false);
      setShowMutedBanner(false);
    }
    if (video.paused) {
      triggerPlay(video);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [showMutedBanner, triggerPlay]);

  const toggleMute = useCallback(() => {
    const video = webVideoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
    setShowMutedBanner(false);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const video = webVideoRef.current;
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (video) {
      video.volume = clamped;
      video.muted = clamped === 0;
    }
    setVolumeFeedback(Math.round(clamped * 100));
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setVolumeFeedback(null), 1200);
  }, []);

  const seekTo = useCallback((sec: number) => {
    const video = webVideoRef.current;
    if (!video || duration <= 0) return;
    const clamped = Math.max(0, Math.min(duration, sec));
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const seekRelative = useCallback((offset: number) => {
    const video = webVideoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(duration > 0 ? duration : 86400, video.currentTime + offset));
    video.currentTime = target;
    setCurrentTime(target);
  }, [duration]);

  const cycleVideoFit = useCallback(() => {
    setVideoFit(prev => {
      let next: VideoFitMode = 'contain';
      let label = 'Originale (Adatta)';
      if (prev === 'contain') {
        next = 'cover';
        label = 'Riempi (Zoom)';
      } else if (prev === 'cover') {
        next = 'fill';
        label = 'Allunga (100%)';
      }
      setFitFeedback(label);
      if (fitTimeoutRef.current) clearTimeout(fitTimeoutRef.current);
      fitTimeoutRef.current = setTimeout(() => setFitFeedback(null), 1500);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById('iptv-universal-player') || document.documentElement;
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = webVideoRef.current as any;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const handleSelectAudioTrack = useCallback((idx: number) => {
    setActiveAudioTrack(idx);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = idx;
    }
    setAudioTracks(prev => prev.map(t => ({ ...t, active: t.id === idx })));
    setTrackModalVisible(false);
  }, []);

  const handleSelectSubtitleTrack = useCallback((idx: number) => {
    setActiveSubtitleTrack(idx);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = idx;
    }
    setSubtitleTracks(prev => prev.map(t => ({ ...t, active: t.id === idx })));
    setTrackModalVisible(false);
  }, []);

  const handleSelectQualityLevel = useCallback((levelId: number) => {
    setActiveQualityLevel(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
    }
    setQualityModalVisible(false);
  }, []);

  const handleSelectPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (webVideoRef.current) {
      webVideoRef.current.playbackRate = speed;
    }
    setSpeedModalVisible(false);
  }, []);

  const dismissMutedBanner = useCallback(() => {
    if (webVideoRef.current) {
      webVideoRef.current.muted = false;
      setIsMuted(false);
    }
    setShowMutedBanner(false);
  }, []);

  const handleClose = useCallback(() => {
    saveProgress();
    destroyEngines();
    onClose();
  }, [saveProgress, destroyEngines, onClose]);

  const retry = useCallback(() => {
    if (stream?.streamUrl) loadStream(stream.streamUrl);
  }, [stream, loadStream]);

  return {
    webVideoRef,
    isPlaying,
    isBuffering,
    firstFrameRendered,
    currentTime,
    duration,
    bufferPercent,
    volume,
    isMuted,
    videoFit,
    fitFeedback,
    volumeFeedback,
    playbackSpeed,
    isFullscreen,
    isLive,
    isMovieOrSeries,
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
    showMutedBanner,
    errorMsg,
    resumePrompt,
    setResumePrompt,
    togglePlayPause,
    toggleMute,
    changeVolume,
    seekTo,
    seekRelative,
    cycleVideoFit,
    toggleFullscreen,
    togglePictureInPicture,
    handleSelectAudioTrack,
    handleSelectSubtitleTrack,
    handleSelectQualityLevel,
    handleSelectPlaybackSpeed,
    dismissMutedBanner,
    handleClose,
    retry
  };
}
