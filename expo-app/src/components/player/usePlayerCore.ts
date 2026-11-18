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
  const currentStreamUrlRef = useRef<string>('');
  const activeStreamIdRef = useRef<string>('');
  const hlsFallbackAttemptedRef = useRef(false);
  const h264FallbackAttemptedRef = useRef(false);
  const liveFallbackAttemptedRef = useRef(false);
  const liveFormatFallbackAttemptedRef = useRef(false);
  const mediaRecoveryAttemptedRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const resumeSeekAppliedRef = useRef(false);
  const loadStreamRef = useRef<((url: string) => void) | null>(null);

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

  const applyPendingSeek = useCallback((video: HTMLVideoElement) => {
    const pending = pendingSeekRef.current;
    if (pending === null || resumeSeekAppliedRef.current) return;
    if (!Number.isFinite(pending) || pending <= 0) {
      pendingSeekRef.current = null;
      resumeSeekAppliedRef.current = true;
      return;
    }
    if (video.readyState < 1) return;
    const maxTime = Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 2)
      : pending;
    const target = Math.min(pending, maxTime);
    try {
      video.currentTime = target;
      if (Math.abs(video.currentTime - target) < 2 || video.seeking) {
        pendingSeekRef.current = null;
        resumeSeekAppliedRef.current = true;
      }
    } catch {}
  }, []);

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
  const withQueryParam = (rawUrl: string, key: string, value: string) => {
    try {
      const url = new URL(rawUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
      url.searchParams.set(key, value);
      return url.toString();
    } catch {
      const separator = rawUrl.includes('?') ? '&' : '?';
      return `${rawUrl}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
  };

  const loadStream = useCallback((targetUrl: string) => {
    destroyEngines();
    const video = webVideoRef.current;
    if (!video || !targetUrl) return;

    currentStreamUrlRef.current = targetUrl;
    setIsBuffering(true);
    setFirstFrameRendered(false);
    setErrorMsg(null);
    setIsPlaying(true);

    const cleanUrl = targetUrl.toLowerCase();
    let path = cleanUrl;
    try { path = new URL(targetUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost').pathname.toLowerCase(); } catch {}
    const isM3u8 = path.endsWith('.m3u8') || path.includes('/api/hls/');
    const isTs = path.endsWith('.ts') || path.includes('/api/live_transcode') || (!path.endsWith('.m3u8') && stream?.extension === 'ts');

    // 1. HLS Engine (Hls.js)
    if (isM3u8 && HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferHole: 1.0,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
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
          setActiveAudioTrack(hls.audioTrack ?? 0);
        } else if (targetUrl.includes('/api/hls/')) {
          let rawMediaUrl = '';
          try {
            rawMediaUrl = new URL(targetUrl, window.location.href).searchParams.get('url') || '';
          } catch {}
          if (rawMediaUrl) {
            fetch(`/api/media_info?url=${encodeURIComponent(rawMediaUrl)}`, { cache: 'no-store' })
              .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
              .then(info => {
                if (hlsRef.current !== hls || currentStreamUrlRef.current !== targetUrl) return;
                const selectedAudio = Number(new URL(targetUrl, window.location.href).searchParams.get('audio_track') || 0);
                if (info?.audio_tracks?.length > 0) {
                  setAudioTracks(info.audio_tracks.map((t: any, idx: number) => {
                    const id = t.stream_index !== undefined ? t.stream_index : idx;
                    return {
                      id,
                      label: t.title || (t.language ? `Audio ${t.language.toUpperCase()}` : `Traccia ${idx + 1}`),
                      language: t.language || '',
                      active: id === selectedAudio,
                      kind: 'audio'
                    };
                  }));
                  setActiveAudioTrack(selectedAudio);
                }
                if (info?.subtitle_tracks?.length > 0) {
                  setSubtitleTracks(info.subtitle_tracks.map((sub: any, idx: number) => ({
                    id: sub.stream_index !== undefined ? sub.stream_index : idx,
                    label: sub.title || (sub.language ? `Sottotitolo ${sub.language.toUpperCase()}` : `Sottotitolo ${idx + 1}`),
                    language: sub.language || '',
                    active: false,
                    kind: 'subtitle'
                  })));
                }
              })
              .catch(() => {});
          }
        }

        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          setSubtitleTracks(hls.subtitleTracks.map((track: any, idx: number) => ({
            id: idx,
            label: track.name || track.lang || `Sottotitolo ${idx + 1}`,
            language: track.lang || '',
            active: idx === hls.subtitleTrack,
            kind: 'subtitles'
          })));
          setActiveSubtitleTrack(hls.subtitleTrack ?? -1);
        }
      });

      hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
        if (!data?.fatal || hlsRef.current !== hls) return;
        switch (data.type) {
          case HlsClass.ErrorTypes.NETWORK_ERROR:
            if (!hlsFallbackAttemptedRef.current) {
              hlsFallbackAttemptedRef.current = true;
              hls.startLoad();
            } else {
              setErrorMsg('Connessione al flusso interrotta. Riprova la riproduzione.');
              setIsBuffering(false);
              hls.destroy();
              if (hlsRef.current === hls) hlsRef.current = null;
            }
            break;
          case HlsClass.ErrorTypes.MEDIA_ERROR:
            if (!mediaRecoveryAttemptedRef.current) {
              mediaRecoveryAttemptedRef.current = true;
              hls.recoverMediaError();
            } else {
              setErrorMsg('Formato multimediale non supportato o danneggiato.');
              setIsBuffering(false);
            }
            break;
          default: {
            // For live streams, try the provider's TS endpoint only when this is a direct HLS URL.
            if (isLive && !isSwitchingRef.current && !path.includes('/api/hls/')) {
              const altTs = targetUrl.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
              if (altTs !== targetUrl) {
                isSwitchingRef.current = true;
                setTimeout(() => {
                  isSwitchingRef.current = false;
                  loadStreamRef.current?.(altTs);
                }, 200);
                return;
              }
            }
            // The server HLS endpoint understands h264=1; preserve all existing query parameters.
            if (!isLive && path.includes('/api/hls/master.m3u8') && !/[?&](?:h264|force_h264)=1(?:&|$)/i.test(targetUrl) && !isSwitchingRef.current) {
              isSwitchingRef.current = true;
              const forceH264Url = withQueryParam(targetUrl, 'h264', '1');
              setTimeout(() => {
                isSwitchingRef.current = false;
                loadStreamRef.current?.(forceH264Url);
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
          // Restore the previously stable Live startup buffer.
          stashInitialSize: 512 * 1024,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
          liveBufferLatencyChasing: false
        });
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();

        player.on(mpegts.Events.MEDIA_INFO, (info: any) => {
          const audioCodec = String(
            info?.audioCodec || info?.audio_codec || info?.audioCodecName || ''
          );
          const needsAacTranscode = /ac-?3|e-?ac-?3|dolby/i.test(audioCodec);

          if (
            isLive &&
            needsAacTranscode &&
            !cleanUrl.includes('/api/live_transcode') &&
            !liveFallbackAttemptedRef.current
          ) {
            liveFallbackAttemptedRef.current = true;
            console.info(`[Live] Audio ${audioCodec} rilevato: attivo remux audio AAC tramite FFmpeg.`);
            const transcodedUrl = XtreamAPI.getLiveTranscodeUrl(targetUrl);
            setTimeout(() => loadStreamRef.current?.(transcodedUrl), 0);
            return;
          }

          setIsBuffering(false);
          setFirstFrameRendered(true);
        });

        const p = player.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => triggerPlay(video));
        }

        player.on(mpegts.Events.ERROR, (errType: any, errDetail: any, errInfo: any) => {
          console.warn('mpegts error:', errType, errDetail, errInfo || '');
          if (mpegtsRef.current !== player) return;
          if (isLive && !liveFormatFallbackAttemptedRef.current && !cleanUrl.includes('/api/live_transcode')) {
            const altM3u8 = targetUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
            if (altM3u8 !== targetUrl) {
              liveFormatFallbackAttemptedRef.current = true;
              isSwitchingRef.current = true;
              setTimeout(() => {
                isSwitchingRef.current = false;
                loadStreamRef.current?.(altM3u8);
              }, 250);
              return;
            }
          }
          setIsBuffering(false);
          setErrorMsg('Errore durante la lettura del flusso MPEG-TS. Prova a riavviare il canale.');
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

  loadStreamRef.current = loadStream;

  // Main lifecycle when stream changes
  useEffect(() => {
    if (visible && stream) {
      activeStreamIdRef.current = String(stream.streamId);
      isSwitchingRef.current = false;
      hlsFallbackAttemptedRef.current = false;
      h264FallbackAttemptedRef.current = false;
      liveFallbackAttemptedRef.current = false;
      liveFormatFallbackAttemptedRef.current = false;
      mediaRecoveryAttemptedRef.current = false;
      pendingSeekRef.current = Number.isFinite(stream.initialSeekTime) && (stream.initialSeekTime || 0) > 0
        ? Number(stream.initialSeekTime)
        : null;
      resumeSeekAppliedRef.current = pendingSeekRef.current === null;
      lastSaveTimeRef.current = 0;
      setAudioTracks([]);
      setSubtitleTracks([]);
      setQualityLevels([]);
      setActiveAudioTrack(0);
      setActiveSubtitleTrack(-1);
      setActiveQualityLevel(-1);
      setCurrentTime(0);
      setDuration(0);
      setBufferPercent(0);
      setErrorMsg(null);
      setResumePrompt(null);

      // Check VOD history for resume
      if (isMovieOrSeries && account?.id) {
        const requestedStreamId = String(stream.streamId);
        StorageService.getHistory(account.id).then(hist => {
          if (!visible || activeStreamIdRef.current !== requestedStreamId) return;
          const match = hist.find(h => String(h.id) === requestedStreamId);
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
    const onCanPlay = () => {
      setIsBuffering(false);
      applyPendingSeek(video);
    };
    const onLoadedMetadata = () => applyPendingSeek(video);
    const onLoadedData = () => {
      if (video.readyState >= 2) setFirstFrameRendered(true);
      applyPendingSeek(video);
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
      applyPendingSeek(video);
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
      const activeUrl = currentStreamUrlRef.current || stream?.streamUrl || '';
      if (!isSwitchingRef.current && activeUrl) {
        if (isLive) {
          isSwitchingRef.current = true;
          const clean = activeUrl;
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
          const curUrl = activeUrl;
          // If the stream wasn't routed through HLS yet, switch to server HLS pipeline with forceH264.
          if (!curUrl.includes('/api/hls/')) {
            isSwitchingRef.current = true;
            console.log('[PlayerCore] Video error code', code, 'on movie/series. Falling back to server HLS remuxer...');
            const fallbackUrl = XtreamAPI.getHlsUrl(curUrl, stream?.rawItem, true);
            setTimeout(() => {
              isSwitchingRef.current = false;
              loadStream(fallbackUrl);
            }, 200);
            return;
          } else if (!/[?&](?:h264|force_h264)=1(?:&|$)/i.test(curUrl) && !h264FallbackAttemptedRef.current) {
            // Retry HLS once with forced H.264, preserving existing query parameters.
            h264FallbackAttemptedRef.current = true;
            isSwitchingRef.current = true;
            console.log('[PlayerCore] HLS error code', code, 'on movie/series. Retrying with forced H.264 transcode...');
            const forceH264Url = withQueryParam(curUrl, 'h264', '1');
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
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('error', onError);

    // Fullscreen events: standard browsers plus Safari/iOS native video fullscreen.
    const syncFullscreenState = () => {
      const doc = document as any;
      const active = Boolean(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.webkitIsFullScreen ||
        (video as any).webkitDisplayingFullscreen
      );
      setIsFullscreen(active);
      if (!active) video.controls = false;
    };
    const onNativeFullscreenBegin = () => setIsFullscreen(true);
    const onNativeFullscreenEnd = () => {
      video.controls = false;
      setIsFullscreen(false);
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);
    video.addEventListener('webkitbeginfullscreen', onNativeFullscreenBegin as EventListener);
    video.addEventListener('webkitendfullscreen', onNativeFullscreenEnd as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);
      video.removeEventListener('webkitbeginfullscreen', onNativeFullscreenBegin as EventListener);
      video.removeEventListener('webkitendfullscreen', onNativeFullscreenEnd as EventListener);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('error', onError);
    };
  }, [stream, isMovieOrSeries, account, isLive, loadStream, saveProgress, applyPendingSeek]);

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
    const video = webVideoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;

    const container = document.getElementById('iptv-universal-player') as (HTMLElement & {
      webkitRequestFullscreen?: () => void;
    }) | null;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitIsFullScreen?: boolean;
      webkitExitFullscreen?: () => void;
    };

    const isNativeVideoFullscreen = Boolean(video?.webkitDisplayingFullscreen);
    const isDocumentFullscreen = Boolean(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.webkitIsFullScreen
    );

    if (isNativeVideoFullscreen) {
      video?.webkitExitFullscreen?.();
      return;
    }

    if (isDocumentFullscreen) {
      if (document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      } else {
        doc.webkitExitFullscreen?.();
      }
      return;
    }

    if (!container) return;

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS =
      /iPhone|iPad|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) &&
        typeof navigator !== 'undefined' &&
        navigator.maxTouchPoints > 1);

    if (isIOS && video?.webkitEnterFullscreen) {
      video.controls = true;
      try {
        video.webkitEnterFullscreen();
        setIsFullscreen(true);
      } catch {
        video.controls = false;
      }
      return;
    }

    if (video) {
      video.controls = false;
    }

    if (typeof container.requestFullscreen === 'function') {
      void container.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else if (typeof container.webkitRequestFullscreen === 'function') {
      container.webkitRequestFullscreen();
      setIsFullscreen(true);
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

  const handleSelectAudioTrack = useCallback(async (idx: number) => {
    const hls = hlsRef.current;
    if (hls && Array.isArray(hls.audioTracks) && hls.audioTracks.length > 0) {
      hls.audioTrack = idx;
      setActiveAudioTrack(idx);
      setAudioTracks(prev => prev.map(track => ({ ...track, active: track.id === idx })));
      setTrackModalVisible(false);
      return;
    }

    const currentUrl = currentStreamUrlRef.current || '';
    const isBackendMaster = currentUrl.includes('/api/hls/master.m3u8');
    const isBackendMediaPlaylist = /\/api\/hls\/[^/?#]+\/(?:index|playlist)\.m3u8(?:[?#]|$)/i.test(currentUrl);
    if (isBackendMaster || isBackendMediaPlaylist) {
      const video = webVideoRef.current;
      pendingSeekRef.current = video && Number.isFinite(video.currentTime) ? video.currentTime : currentTime;
      resumeSeekAppliedRef.current = pendingSeekRef.current <= 0;
      try {
        let mediaPlaylistUrl = currentUrl;
        if (isBackendMaster) {
          // Resolve the generated media playlist. audio_track must be attached
          // to /{sid}/index.m3u8, because the master endpoint only creates the session.
          const masterResponse = await fetch(currentUrl, { cache: 'no-store' });
          if (!masterResponse.ok) throw new Error(`HTTP ${masterResponse.status}`);
          const masterText = await masterResponse.text();
          const match = masterText.match(/(?:https?:\/\/[^\s]+)?\/api\/hls\/[^/\s"']+\/(?:index|playlist)\.m3u8/);
          if (!match) throw new Error('Playlist HLS media non trovata');
          mediaPlaylistUrl = new URL(match[0], currentUrl).toString();
        }
        const nextUrl = withQueryParam(mediaPlaylistUrl, 'audio_track', String(idx));
        loadStreamRef.current?.(nextUrl);
        setActiveAudioTrack(idx);
        setAudioTracks(prev => prev.map(track => ({ ...track, active: track.id === idx })));
      } catch (error) {
        console.warn('[PlayerCore] Impossibile cambiare traccia audio:', error);
        pendingSeekRef.current = null;
        resumeSeekAppliedRef.current = true;
        setErrorMsg('Impossibile cambiare la traccia audio. Riprova.');
      }
    } else {
      setActiveAudioTrack(idx);
      setAudioTracks(prev => prev.map(track => ({ ...track, active: track.id === idx })));
    }
    setTrackModalVisible(false);
  }, [currentTime]);

  const handleSelectSubtitleTrack = useCallback((idx: number) => {
    setActiveSubtitleTrack(idx);
    if (hlsRef.current && Array.isArray(hlsRef.current.subtitleTracks)) {
      if (idx === -1) {
        hlsRef.current.subtitleTrack = -1;
      } else if (hlsRef.current.subtitleTracks.length > 0) {
        const subtitle = hlsRef.current.subtitleTracks.findIndex((track: any, trackIndex: number) =>
          trackIndex === idx || Number(track.id) === idx
        );
        if (subtitle >= 0) hlsRef.current.subtitleTrack = subtitle;
      }
    } else if (webVideoRef.current?.textTracks) {
      Array.from(webVideoRef.current.textTracks).forEach((track, trackIndex) => {
        track.mode = idx !== -1 && trackIndex === idx ? 'showing' : 'disabled';
      });
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
    if (stream?.streamUrl) {
      hlsFallbackAttemptedRef.current = false;
      h264FallbackAttemptedRef.current = false;
      liveFallbackAttemptedRef.current = false;
      liveFormatFallbackAttemptedRef.current = false;
      mediaRecoveryAttemptedRef.current = false;
      isSwitchingRef.current = false;
      loadStream(stream.streamUrl);
    }
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
