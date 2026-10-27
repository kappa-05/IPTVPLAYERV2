import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { PlayingStream } from '../types';

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
  const { width } = useWindowDimensions();

  // OS & Device Detection
  const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && (
    /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ));

  const isAndroid = Platform.OS === 'android' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && (
    /Android/i.test(navigator.userAgent || '')
  ));

  const isMobileDevice = Platform.OS !== 'web' || isIOS || isAndroid || (typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|Tablet/i.test(navigator.userAgent || '')
  )) || width < 900;

  // Web HTML5 Video Ref
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);

  // Native Expo Video Ref
  const nativeVideoRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (visible && stream) {
      setLoading(true);
      setErrorMsg(null);
      setIsPlaying(true);
      resetControlsTimer();

      if (Platform.OS === 'web') {
        initWebPlayer();
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

  const tryEnterAppleFullscreen = (video: HTMLVideoElement) => {
    if (isIOS && typeof (video as any).webkitEnterFullscreen === 'function') {
      try {
        (video as any).webkitEnterFullscreen();
      } catch (err) {
        // Fullscreen may require direct user touch
        console.log('Apple fullscreen deferred until user touch:', err);
      }
    }
  };

  const initWebPlayer = () => {
    cleanupWebPlayer();
    const video = webVideoRef.current;
    if (!video || !stream) return;

    const streamUrl = stream.streamUrl;
    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || stream.type === 'live';
    const canNativeHls = typeof video.canPlayType === 'function' && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));

    video.onwaiting = () => setLoading(true);
    video.onplaying = () => {
      setLoading(false);
      setIsPlaying(true);
      if (isIOS) {
        tryEnterAppleFullscreen(video);
      }
    };
    video.onpause = () => setIsPlaying(false);
    video.onvolumechange = () => setIsMuted(video.muted);
    video.ontimeupdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    };
    video.onerror = () => {
      console.warn('HTML5 Video Error:', video.error);
      const code = video.error ? video.error.code : 'ignoto';

      // Graceful fallback for VOD/Series: if HLS failed, retry via direct proxy
      if (stream.streamUrl.includes('/api/hls/master.m3u8')) {
        console.log('HLS pipeline error, falling back to direct proxy stream...');
        const proxyUrl = stream.streamUrl.replace('/api/hls/master.m3u8', '/api/proxy');
        stream.streamUrl = proxyUrl;
        cleanupWebPlayer();
        video.src = proxyUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

      setErrorMsg(`Errore riproduzione stream (Codice ${code}). Verifica la connessione o il formato del server.`);
      setLoading(false);
    };

    // When exiting Apple's native player (tapping 'Fine' / 'Done'), dismiss the modal smoothly
    const handleWebkitEnd = () => {
      onClose();
    };
    video.addEventListener('webkitendfullscreen', handleWebkitEnd, { once: true });

    // Use native Apple AVPlayer HLS engine if supported (iPhone / iPad / Safari)
    if (isM3U8 && canNativeHls) {
      video.src = streamUrl;
      video.load();
      video.play().then(() => {
        tryEnterAppleFullscreen(video);
      }).catch((e) => {
        console.log('Autoplay waiting for user touch:', e);
      });
    } else if (isM3U8 && HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: stream.type === 'live',
        backBufferLength: 60
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });

      hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case HlsClass.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error, attempting recovery...');
              hls.startLoad();
              break;
            case HlsClass.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal HLS error:', data);
              if (stream.streamUrl.includes('/api/hls/master.m3u8')) {
                console.log('Falling back to proxy stream after fatal HLS error...');
                const proxyUrl = stream.streamUrl.replace('/api/hls/master.m3u8', '/api/proxy');
                stream.streamUrl = proxyUrl;
                cleanupWebPlayer();
                video.src = proxyUrl;
                video.load();
                video.play().catch(() => {});
                return;
              }
              setErrorMsg('Errore critico durante la riproduzione stream.');
              cleanupWebPlayer();
              break;
          }
        }
      });
    } else {
      // Standard MP4/MKV
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
    }
  };

  const handleLaunchNativePlayer = () => {
    if (Platform.OS === 'web' && webVideoRef.current) {
      const video = webVideoRef.current;
      video.play().catch(() => {});
      if (isIOS && typeof (video as any).webkitEnterFullscreen === 'function') {
        try {
          (video as any).webkitEnterFullscreen();
        } catch (e) {
          console.warn('Could not enter Apple fullscreen:', e);
        }
      } else if (typeof video.requestFullscreen === 'function') {
        video.requestFullscreen().catch(() => {});
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.presentFullscreenPlayer();
    }
  };

  const clearControlsTimer = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  };

  const resetControlsTimer = () => {
    clearControlsTimer();
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  const togglePlayPause = () => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      if (webVideoRef.current.paused) {
        webVideoRef.current.play().catch(() => {});
      } else {
        webVideoRef.current.pause();
      }
    } else if (nativeVideoRef.current) {
      if (isPlaying) {
        nativeVideoRef.current.pauseAsync();
      } else {
        nativeVideoRef.current.playAsync();
      }
    }
  };

  const toggleMute = () => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.muted = !webVideoRef.current.muted;
      setIsMuted(webVideoRef.current.muted);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setIsMutedAsync(!isMuted);
    }
  };

  const seekRelative = (offsetSecs: number) => {
    resetControlsTimer();
    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.currentTime = Math.max(0, Math.min(duration, webVideoRef.current.currentTime + offsetSecs));
    } else if (nativeVideoRef.current && duration > 0) {
      const newPos = Math.max(0, Math.min(duration * 1000, (currentTime + offsetSecs) * 1000));
      nativeVideoRef.current.setPositionAsync(newPos);
    }
  };

  const toggleFullscreen = () => {
    resetControlsTimer();
    if (Platform.OS === 'web') {
      const video = webVideoRef.current;
      if (video) {
        if (isIOS && typeof (video as any).webkitEnterFullscreen === 'function') {
          (video as any).webkitEnterFullscreen();
          return;
        }
        if (!document.fullscreenElement) {
          video.requestFullscreen?.().catch(() => {
            document.documentElement.requestFullscreen?.();
          });
        } else {
          document.exitFullscreen?.();
        }
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.presentFullscreenPlayer();
    }
  };

  const formatTime = (seconds: number) => {
    const totalSecs = Math.floor(seconds || 0);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!visible || !stream) return null;

  const isLive = stream.type === 'live';
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={styles.container}
        // @ts-ignore
        onMouseMove={!isMobileDevice ? resetControlsTimer : undefined}
        onTouchStart={!isMobileDevice ? resetControlsTimer : undefined}
      >
        {/* Web HTML5 Video with Native Device Player Controls on Mobile */}
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
            controls={isMobileDevice}
            autoPlay
          />
        ) : (
          /* Native Android / iOS ExoPlayer / AVPlayer */
          ExpoVideo ? (
            <ExpoVideo
              ref={nativeVideoRef}
              style={styles.video}
              source={{ uri: stream.streamUrl }}
              useNativeControls={true}
              resizeMode={ResizeModeEnum ? ResizeModeEnum.CONTAIN : 'contain'}
              shouldPlay={true}
              onPlaybackStatusUpdate={(status: any) => {
                if (status.isLoaded) {
                  setLoading(status.isBuffering);
                  setIsPlaying(status.isPlaying);
                  setIsMuted(status.isMuted);
                  setCurrentTime((status.positionMillis || 0) / 1000);
                  setDuration((status.durationMillis || 0) / 1000);
                } else if (status.error) {
                  setErrorMsg('Errore riproduzione stream nativo.');
                  setLoading(false);
                }
              }}
            />
          ) : null
        )}

        {/* Loading Spinner */}
        {loading && (
          <View style={styles.centerFeedback} pointerEvents="none">
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.centerLoadingText}>Caricamento stream in corso...</Text>
          </View>
        )}

        {/* Error Display */}
        {errorMsg && (
          <View style={styles.centerFeedback}>
            <Ionicons name="alert-circle-outline" size={38} color={colors.accentRed} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setErrorMsg(null);
                  setLoading(true);
                  if (Platform.OS === 'web') {
                    initWebPlayer();
                  } else if (nativeVideoRef.current) {
                    nativeVideoRef.current.replayAsync();
                  }
                }}
              >
                <Text style={styles.retryBtnText}>Riprova</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={styles.retryBtnText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* MOBILE FLOATING HEADER: Leaves bottom area unobstructed for device's native controls */}
        {isMobileDevice ? (
          <View style={styles.mobileFloatingOverlay} pointerEvents="box-none">
            <View style={styles.mobileTopBar}>
              <TouchableOpacity
                style={styles.mobileBackBtn}
                onPress={onClose}
                accessibilityLabel="Chiudi player"
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={styles.mobileBackBtnText}>Chiudi</Text>
              </TouchableOpacity>

              <View style={styles.mobileTitleCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {isLive ? 'LIVE' : stream.type === 'series' ? 'SERIE' : 'VOD'}
                    </Text>
                  </View>
                  <Text style={styles.mobileStreamTitle} numberOfLines={1}>
                    {stream.title}
                  </Text>
                </View>
                {stream.subTitle ? (
                  <Text style={styles.mobileStreamSub} numberOfLines={1}>
                    {stream.subTitle}
                  </Text>
                ) : null}
              </View>

              <View style={styles.mobileRightActions}>
                {isIOS && (
                  <TouchableOpacity
                    style={styles.applePlayerBtn}
                    onPress={handleLaunchNativePlayer}
                    accessibilityLabel="Apri Player Apple Schermo Intero"
                  >
                    <Ionicons name="expand" size={15} color="#fff" />
                    <Text style={styles.applePlayerBtnText}>Apple</Text>
                  </TouchableOpacity>
                )}

                {isLive && onOpenEpg && (
                  <TouchableOpacity style={styles.guideBtn} onPress={onOpenEpg}>
                    <Ionicons name="calendar-outline" size={15} color="#fff" />
                    <Text style={styles.guideBtnText}>Guida</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ) : (
          /* DESKTOP CONTROLS OVERLAY */
          showControls && (
            <View style={styles.overlay} pointerEvents="box-none">
              {/* Top Bar */}
              <View style={styles.topBar}>
                <View style={styles.topTitleContainer}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {isLive ? 'LIVE' : stream.type === 'series' ? 'SERIE' : 'VOD'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.streamTitle} numberOfLines={1}>
                      {stream.title}
                    </Text>
                    {stream.subTitle ? (
                      <Text style={styles.streamSubtitle} numberOfLines={1}>
                        {stream.subTitle}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {isLive && onOpenEpg && (
                    <TouchableOpacity style={styles.guideBtn} onPress={onOpenEpg}>
                      <Ionicons name="calendar-outline" size={16} color="#fff" />
                      <Text style={styles.guideBtnText}>Guida TV</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Center tap area to toggle play/pause */}
              <TouchableOpacity style={styles.centerTapArea} activeOpacity={1} onPress={togglePlayPause} />

              {/* Bottom Controls */}
              <View style={styles.bottomBar}>
                {!isLive && duration > 0 && (
                  <View style={styles.timelineContainer}>
                    <View style={styles.timelineTrack}>
                      <View style={[styles.timelinePlayed, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>
                )}

                <View style={styles.bottomControlsRow}>
                  <View style={styles.bottomLeftControls}>
                    <TouchableOpacity style={styles.iconBtn} onPress={togglePlayPause}>
                      <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
                    </TouchableOpacity>

                    {!isLive && (
                      <>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => seekRelative(-10)}>
                          <Ionicons name="play-back" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => seekRelative(10)}>
                          <Ionicons name="play-forward" size={18} color="#fff" />
                        </TouchableOpacity>
                      </>
                    )}

                    {isLive ? (
                      <View style={styles.liveIndicator}>
                        <View style={styles.liveRedDot} />
                        <Text style={styles.liveText}>DIRETTA</Text>
                      </View>
                    ) : (
                      <Text style={styles.timeText}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </Text>
                    )}
                  </View>

                  <View style={styles.bottomRightControls}>
                    <TouchableOpacity style={styles.iconBtn} onPress={toggleMute}>
                      <Ionicons
                        name={isMuted ? 'volume-mute' : 'volume-high'}
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.iconBtn} onPress={toggleFullscreen}>
                      <Ionicons name="expand" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative'
  },
  video: {
    width: '100%',
    height: '100%'
  },
  centerFeedback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    zIndex: 25
  },
  centerLoadingText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '500'
  },
  errorText: {
    color: colors.accentRed,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 340
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  // Mobile Floating Overlay Styles
  mobileFloatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20
  },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'web' ? 10 : 36,
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)'
  },
  mobileBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  mobileBackBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },
  mobileTitleCol: {
    flex: 1,
    marginHorizontal: 10
  },
  mobileStreamTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1
  },
  mobileStreamSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2
  },
  mobileRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  applePlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8
  },
  applePlayerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  // Desktop Controls Overlay Styles
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 10
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 38,
    backgroundColor: 'rgba(5, 7, 11, 0.75)'
  },
  topTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10
  },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  guideBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  typeBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  streamTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  streamSubtitle: {
    color: colors.textSecondary,
    fontSize: 12
  },
  centerTapArea: {
    flex: 1
  },
  bottomBar: {
    padding: 16,
    backgroundColor: 'rgba(5, 7, 11, 0.8)'
  },
  timelineContainer: {
    marginBottom: 10
  },
  timelineTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  timelinePlayed: {
    height: '100%',
    backgroundColor: colors.primary
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  bottomLeftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  bottomRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconBtn: {
    padding: 6
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  liveRedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentRed
  },
  liveText: {
    color: colors.accentRed,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  }
});
