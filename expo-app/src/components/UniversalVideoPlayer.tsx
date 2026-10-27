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
  const { width, height } = useWindowDimensions();

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
        webVideoRef.current.pause();
        webVideoRef.current.removeAttribute('src');
        webVideoRef.current.load();
      } catch {}
    }
  };

  const initWebPlayer = () => {
    cleanupWebPlayer();
    const video = webVideoRef.current;
    if (!video || !stream) return;

    const streamUrl = stream.streamUrl;
    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || stream.type === 'live';

    video.onwaiting = () => setLoading(true);
    video.onplaying = () => {
      setLoading(false);
      setIsPlaying(true);
    };
    video.onpause = () => setIsPlaying(false);
    video.onvolumechange = () => setIsMuted(video.muted);
    video.ontimeupdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    };
    video.onerror = (e) => {
      console.warn('HTML5 Video Error:', video.error);
      const code = video.error ? video.error.code : 'ignoto';
      setErrorMsg(`Errore riproduzione stream (Codice ${code}). Il formato potrebbe non essere supportato dal browser.`);
      setLoading(false);
    };

    if (isM3U8 && HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: true,
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
              setErrorMsg('Errore critico durante la riproduzione HLS.');
              cleanupWebPlayer();
              break;
          }
        }
      });
    } else {
      // Standard MP4/MKV or native HLS supported (e.g. Safari)
      video.src = streamUrl;
      video.play().catch(() => {});
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
        onMouseMove={resetControlsTimer}
        onTouchStart={resetControlsTimer}
      >
        {/* Web HTML5 Video with HLS.js Support */}
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
            playsInline
            autoPlay
          />
        ) : (
          /* Native Android / iOS ExoPlayer / AVPlayer */
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
          </View>
        )}

        {/* Error Display */}
        {errorMsg && (
          <View style={styles.centerFeedback}>
            <Ionicons name="alert-circle-outline" size={38} color={colors.accentRed} />
            <Text style={styles.errorText}>{errorMsg}</Text>
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
          </View>
        )}

        {/* Controls Overlay */}
        {showControls && (
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
    zIndex: 5
  },
  errorText: {
    color: colors.accentRed,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 340
  },
  retryBtn: {
    marginTop: 10,
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
