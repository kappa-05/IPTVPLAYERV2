import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Animated,
  Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { PlayingStream, Account } from '../types';
import { usePlayerCore } from './player/usePlayerCore';
import { SeamlessPosterBackdrop } from './player/SeamlessPosterBackdrop';
import { TrackSelectionModal } from './player/TrackSelectionModal';
import { QualitySelectionModal } from './player/QualitySelectionModal';
import { SpeedSelectionModal } from './player/SpeedSelectionModal';

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

interface UniversalVideoPlayerProps {
  visible: boolean;
  stream: PlayingStream | null;
  account?: Account | null;
  isMinimized?: boolean;
  onClose: () => void;
  onOpenEpg?: () => void;
  onToggleMinimize?: () => void;
  onWatchProgressUpdated?: () => void;
}

export const UniversalVideoPlayer: React.FC<UniversalVideoPlayerProps> = ({
  visible,
  stream,
  account,
  isMinimized = false,
  onClose,
  onOpenEpg,
  onToggleMinimize,
  onWatchProgressUpdated
}) => {
  const { width } = useWindowDimensions();

  // Core Playback & Device Engine Hook
  const {
    isIOS,
    isAndroid,
    isTouchDevice,
    isLive,
    isMovieOrSeries,
    webVideoRef,
    nativeVideoRef,
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
    handleClose: handleCoreClose,
    initWebPlayer
  } = usePlayerCore({
    visible,
    stream,
    account,
    isMinimized,
    onClose,
    onWatchProgressUpdated
  });

  // UI Controls Animation & Auto-Hide
  const [showControls, setShowControls] = useState(true);
  const [showTimeRemaining, setShowTimeRemaining] = useState(false);
  const [volumeHovered, setVolumeHovered] = useState(false);
  const [isHoveredMini, setIsHoveredMini] = useState(false);
  const [hoverSeekTime, setHoverSeekTime] = useState<number | null>(null);
  const [hoverSeekPos, setHoverSeekPos] = useState<number>(0);

  const controlsAnim = useRef(new Animated.Value(1)).current;
  const animFade = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.96)).current;
  const controlsTimeoutRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const trackRef = useRef<any>(null);

  // Smooth entrance animation
  useEffect(() => {
    if (visible && stream) {
      animFade.setValue(0);
      animScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(animScale, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
      resetControlsTimer();
    }
  }, [visible, stream]);

  // Controls auto-hide timer
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
      useNativeDriver: Platform.OS !== 'web'
    }).start();

    // Auto-hide after 3.8s if video is playing
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isDraggingTrack && !trackModalVisible && !qualityModalVisible && !speedModalVisible) {
        Animated.timing(controlsAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web'
        }).start(() => {
          setShowControls(false);
        });
      }
    }, 3800);
  }, [clearControlsTimer, controlsAnim, isPlaying, isDraggingTrack, trackModalVisible, qualityModalVisible, speedModalVisible]);

  // Animated close handler
  const handleAnimatedClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(animFade, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web'
      }),
      Animated.timing(animScale, {
        toValue: 0.96,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web'
      })
    ]).start(() => {
      handleCoreClose();
    });
  }, [animFade, animScale, handleCoreClose]);

  // Center double-tap skip vs single-tap toggle controls
  const handleCenterTap = (e: any) => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timeDiff < 300) {
      // Double tap skip
      const clickX = e.nativeEvent?.locationX ?? e.nativeEvent?.offsetX ?? (width / 2);
      if (clickX < width / 2) {
        seekRelative(-10);
      } else {
        seekRelative(10);
      }
    } else {
      // Single tap: toggle controls, or open native player on Apple/Android device
      if (isIOS && !isFullscreen && !isMinimized && webVideoRef.current) {
        openDevicePlayer();
      }
      if (showControls) {
        Animated.timing(controlsAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web'
        }).start(() => setShowControls(false));
      } else {
        resetControlsTimer();
      }
    }
  };

  // Scrubber Calculations
  const calculateScrubPosition = (clientX: number) => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect ? trackRef.current.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0) return 0;
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
    const touch = e.nativeEvent.touches?.[0];
    if (!touch) return;
    const target = calculateScrubPosition(touch.clientX);
    setIsDraggingTrack(true);
    setDragTime(target);
  };

  const handleTimelineTouchMove = (e: any) => {
    if (!isDraggingTrack || duration <= 0) return;
    const touch = e.nativeEvent.touches?.[0];
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

  const handleTimelineMouseMove = (e: any) => {
    if (duration <= 0 || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect ? trackRef.current.getBoundingClientRect() : null;
    if (!rect) return;
    const clientX = e.clientX ?? 0;
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    setHoverSeekPos(offsetX);
    setHoverSeekTime((offsetX / rect.width) * duration);
  };

  const handleTimelineMouseLeave = () => {
    setHoverSeekTime(null);
  };

  // Format time (H:MM:SS or M:SS)
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

  // Resume handlers
  const handleConfirmResume = () => {
    if (resumePrompt) {
      seekTo(resumePrompt.time);
    }
    setResumePrompt(null);
  };

  const handleRestartFromBeginning = () => {
    seekTo(0);
    setResumePrompt(null);
  };



  if (!visible || !stream) return null;

  const displayTime = isDraggingTrack && dragTime !== null ? dragTime : currentTime;
  const progressPercent = duration > 0 && isFinite(duration)
    ? Math.min(100, Math.max(0, (displayTime / duration) * 100))
    : 0;

  const playerContent = (
    <Animated.View
      style={[
        isMinimized ? styles.miniContainer : styles.container,
        {
          opacity: animFade,
          transform: [{ scale: animScale }]
        }
      ]}
      // @ts-ignore
      onMouseMove={!isMinimized ? resetControlsTimer : undefined}
    >
      {/* ── 1. Zero-Glitch Poster & Spinner Backdrop ── */}
      <SeamlessPosterBackdrop
        posterUri={stream.poster}
        title={stream.title}
        loading={loading}
        statusText={loadingStatus}
        firstFrameRendered={firstFrameRendered}
      />

      {/* ── 2. Video Engine: Web HTML5 or Native Expo-AV ── */}
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
          crossOrigin="anonymous"
          controls={false}
          autoPlay
        />
      ) : (
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
                if (status.positionMillis >= 0 && !status.isBuffering) {
                  // Frame rendered
                }
              }
            }}
          />
        ) : null
      )}

      {/* ── 3. Quick Skip Ripple Indicator (-10s / +10s) ── */}
      {seekFeedback && (
        <View
          style={[
            styles.seekRippleBadge,
            seekFeedback.direction === 'back' ? styles.seekRippleLeft : styles.seekRippleRight
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={seekFeedback.direction === 'back' ? 'arrow-undo' : 'arrow-redo'}
            size={28}
            color="#fff"
          />
          <Text style={styles.seekRippleText}>
            {seekFeedback.direction === 'back' ? '-10s' : '+10s'}
          </Text>
        </View>
      )}

      {/* ── 4. Center Tap Area for Play/Pause & Double-Tap Skip ── */}
      {!isMinimized && (
        <TouchableOpacity
          style={styles.centerTapArea}
          activeOpacity={1}
          onPress={handleCenterTap}
        />
      )}

      {/* ── 5. Error Overlay Modal ── */}
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
                  if (Platform.OS === 'web') {
                    initWebPlayer(stream.streamUrl);
                  } else if (nativeVideoRef.current) {
                    nativeVideoRef.current.replayAsync?.();
                  }
                }}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.btnActionText}>Riprova</Text>
              </TouchableOpacity>



              <TouchableOpacity
                style={[styles.btnAction, styles.btnDismiss]}
                onPress={handleAnimatedClose}
              >
                <Text style={styles.btnActionText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── 6. Full Interactive Controls Overlay ── */}
      {!isMinimized && showControls && (
        <Animated.View
          style={[styles.controlsOverlay, { opacity: controlsAnim }]}
          pointerEvents="box-none"
        >
          {/* Top Header Bar */}
          <View style={styles.topBar}>
            <View style={styles.topLeft}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleAnimatedClose}
                accessibilityLabel="Chiudi player"
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
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
              {onToggleMinimize && (
                <TouchableOpacity
                  style={styles.roundIconBtn}
                  onPress={onToggleMinimize}
                  accessibilityLabel="Riduci a Mini-Player"
                >
                  <Ionicons name="contract-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              {isLive && onOpenEpg && (
                <TouchableOpacity style={styles.glassBtn} onPress={onOpenEpg}>
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={styles.glassBtnText}>Guida TV</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.roundIconBtn}
                onPress={handleAnimatedClose}
                accessibilityLabel="Chiudi"
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Center Play/Pause Indicator (when paused) */}
          {!isPlaying && !loading && (
            <View style={styles.centerControlArea} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.bigPlayButton}
                activeOpacity={0.8}
                onPress={togglePlayPause}
                accessibilityLabel="Riproduci"
              >
                <Ionicons name="play" size={40} color="#fff" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Bar: Timeline Scrubber + Controls */}
          <View style={styles.bottomBar} pointerEvents="auto">
            {/* Scrubber Timeline (for Movies and Series) */}
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
                // @ts-ignore
                onMouseMove={handleTimelineMouseMove}
                // @ts-ignore
                onMouseLeave={handleTimelineMouseLeave}
              >
                <View style={styles.timelineBarBackground}>
                  {/* Buffer Ahead Bar */}
                  <View style={[styles.timelineBuffer, { width: `${bufferPercent}%` }]} />
                  {/* Played Progress Bar */}
                  <View style={[styles.timelinePlayed, { width: `${progressPercent}%` }]} />
                  {/* Scrubber Handle Thumb */}
                  <View style={[styles.timelineThumb, { left: `${progressPercent}%` }]} />
                </View>

                {/* Hover / Drag Preview Timestamp Tooltip */}
                {(hoverSeekTime !== null || (isDraggingTrack && dragTime !== null)) && (
                  <View
                    style={[
                      styles.scrubTooltip,
                      {
                        left: isDraggingTrack && dragTime !== null
                          ? `${progressPercent}%`
                          : `${(hoverSeekPos / (trackRef.current?.getBoundingClientRect?.()?.width || 1)) * 100}%`
                      }
                    ]}
                  >
                    <Text style={styles.scrubTooltipText}>
                      {formatTime(isDraggingTrack && dragTime !== null ? dragTime : (hoverSeekTime || 0))}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Bottom Controls Row */}
            <View style={styles.controlsRow}>
              {/* Left Group */}
              <View style={styles.leftControlsGroup}>
                <TouchableOpacity
                  style={styles.ctrlIconBtn}
                  onPress={togglePlayPause}
                  accessibilityLabel={isPlaying ? 'Pausa' : 'Riproduci'}
                >
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

              {/* Right Group */}
              <View style={styles.rightControlsGroup}>
                {/* Audio & Subtitle Selector */}
                <TouchableOpacity
                  style={[
                    styles.ctrlIconBtn,
                    (activeSubtitleTrack !== -1 || audioTracks.length > 1) && styles.ctrlIconBtnActive
                  ]}
                  onPress={() => setTrackModalVisible(true)}
                  accessibilityLabel="Tracce Audio e Sottotitoli"
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={20}
                    color={activeSubtitleTrack !== -1 ? colors.primary : '#fff'}
                  />
                </TouchableOpacity>

                {/* Quality & ABR Selector (if multiple quality levels found) */}
                {qualityLevels.length > 0 && (
                  <TouchableOpacity
                    style={[styles.ctrlIconBtn, activeQualityLevel !== -1 && styles.ctrlIconBtnActive]}
                    onPress={() => setQualityModalVisible(true)}
                    accessibilityLabel="Qualità Video"
                  >
                    <Ionicons
                      name="speedometer-outline"
                      size={20}
                      color={activeQualityLevel !== -1 ? colors.primary : '#fff'}
                    />
                  </TouchableOpacity>
                )}

                {/* Playback Speed (Movies and Series) */}
                {!isLive && (
                  <TouchableOpacity
                    style={[styles.ctrlIconBtn, playbackSpeed !== 1.0 && styles.ctrlIconBtnActive]}
                    onPress={() => setSpeedModalVisible(true)}
                    accessibilityLabel="Velocità di riproduzione"
                  >
                    <Text style={styles.speedBtnText}>
                      {playbackSpeed === 1.0 ? '1x' : `${playbackSpeed}x`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Picture in Picture */}
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    style={styles.ctrlIconBtn}
                    onPress={togglePictureInPicture}
                    accessibilityLabel="Picture-in-Picture"
                  >
                    <Ionicons name="albums-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                )}

                {/* Desktop Volume Slider on Hover */}
                <View
                  style={styles.volumeContainer}
                  // @ts-ignore
                  onMouseEnter={() => setVolumeHovered(true)}
                  // @ts-ignore
                  onMouseLeave={() => setVolumeHovered(false)}
                >
                  <TouchableOpacity style={styles.ctrlIconBtn} onPress={toggleMute}>
                    <Ionicons
                      name={isMuted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>

                  {Platform.OS === 'web' && volumeHovered && (
                    <View style={styles.volumeSliderTrack}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => changeVolume(parseFloat(e.target.value))}
                        style={{
                          width: 80,
                          height: 4,
                          cursor: 'pointer',
                          accentColor: '#3b82f6'
                        }}
                      />
                    </View>
                  )}
                </View>

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

      {/* ── 7. Resume Playback Banner ── */}
      {resumePrompt && !isMinimized && (
        <View style={styles.resumePromptContainer} pointerEvents="box-none">
          <View style={styles.resumePromptCard}>
            <View style={styles.resumeIconWrap}>
              <Ionicons name="time" size={20} color={colors.primary} />
            </View>
            <View style={styles.resumeTextWrap}>
              <Text style={styles.resumePromptTitle}>Riprendere la visione?</Text>
              <Text style={styles.resumePromptSub}>
                Eri arrivato a {formatTime(resumePrompt.time)}
              </Text>
            </View>
            <View style={styles.resumeBtnGroup}>
              <TouchableOpacity style={styles.resumeBtnPrimary} onPress={handleConfirmResume}>
                <Ionicons name="play" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.resumeBtnText}>Riprendi</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeBtnSecondary} onPress={handleRestartFromBeginning}>
                <Text style={styles.resumeBtnTextSecondary}>Dall'inizio</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeBtnClose} onPress={() => setResumePrompt(null)}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── 8. Mini-Player Floating Card Controls ── */}
      {isMinimized && (
        <View
          style={styles.miniOverlay}
          // @ts-ignore
          onMouseEnter={() => setIsHoveredMini(true)}
          // @ts-ignore
          onMouseLeave={() => setIsHoveredMini(false)}
        >
          <View style={styles.miniTopBar}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {stream.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={styles.miniIconBtn}
                onPress={onToggleMinimize}
                accessibilityLabel="Espandi"
              >
                <Ionicons name="expand" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.miniIconBtn}
                onPress={handleAnimatedClose}
                accessibilityLabel="Chiudi"
              >
                <Ionicons name="close" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.miniCenterTap}
            activeOpacity={0.8}
            onPress={togglePlayPause}
          >
            {(!isPlaying || isHoveredMini) && (
              <View style={styles.miniPlayCircle}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {!isLive && duration > 0 && (
            <View style={styles.miniProgressTrack}>
              <View
                style={[
                  styles.miniProgressFill,
                  { width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }
                ]}
              />
            </View>
          )}
        </View>
      )}

      {/* ── 9. Track Selection Modal (Audio & Subtitles) ── */}
      <TrackSelectionModal
        visible={trackModalVisible}
        audioTracks={audioTracks}
        subtitleTracks={subtitleTracks}
        activeAudioTrack={activeAudioTrack}
        activeSubtitleTrack={activeSubtitleTrack}
        onSelectAudioTrack={handleSelectAudioTrack}
        onSelectSubtitleTrack={handleSelectSubtitleTrack}
        onClose={() => setTrackModalVisible(false)}
      />

      {/* ── 10. Quality Selection Modal (ABR) ── */}
      <QualitySelectionModal
        visible={qualityModalVisible}
        qualityLevels={qualityLevels}
        activeQualityLevel={activeQualityLevel}
        onSelectQualityLevel={handleSelectQualityLevel}
        onClose={() => setQualityModalVisible(false)}
      />

      {/* ── 11. Playback Speed Modal ── */}
      <SpeedSelectionModal
        visible={speedModalVisible}
        activeSpeed={playbackSpeed}
        onSelectSpeed={handleSelectPlaybackSpeed}
        onClose={() => setSpeedModalVisible(false)}
      />
    </Animated.View>
  );

  if (Platform.OS === 'web') {
    return playerContent;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleAnimatedClose}>
      {playerContent}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    // @ts-ignore
    position: Platform.OS === 'web' ? 'fixed' : 'relative',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    backgroundColor: '#030508',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: 99999
  },
  miniContainer: {
    // @ts-ignore
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: Platform.OS === 'web' ? 24 : 76,
    right: 18,
    width: 320,
    height: 180,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 99999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 28,
    elevation: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
  },

  // Center Tap Area
  centerTapArea: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    bottom: 90,
    zIndex: 15
  },

  // Seek Ripple
  seekRippleBadge: {
    position: 'absolute',
    top: '45%',
    zIndex: 25,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    gap: 4
  },
  seekRippleLeft: {
    left: '15%'
  },
  seekRippleRight: {
    right: '15%'
  },
  seekRippleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff'
  },

  // Controls Overlay
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 20
  },

  // Top Bar
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
      ? 'linear-gradient(to bottom, rgba(3, 5, 8, 0.94) 0%, rgba(3, 5, 8, 0.45) 65%, transparent 100%)'
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
    borderRadius: 8
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
    borderRadius: 8
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
    alignItems: 'center'
  },

  // Badges
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

  // Center Big Play Button
  centerControlArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bigPlayButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(15, 20, 30, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20
  },

  // Bottom Controls Bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 18,
    paddingTop: 16,
    backgroundColor: 'transparent',
    // @ts-ignore
    background: Platform.OS === 'web'
      ? 'linear-gradient(to top, rgba(3, 5, 8, 0.96) 0%, rgba(3, 5, 8, 0.55) 65%, transparent 100%)'
      : undefined
  },

  // Timeline Scrubber
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
    backgroundColor: 'rgba(255, 255, 255, 0.38)'
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
    shadowOpacity: 0.9,
    shadowRadius: 6
  },
  scrubTooltip: {
    position: 'absolute',
    top: -28,
    marginLeft: -26,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
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

  // Controls Row
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)'
  },
  ctrlIconBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)'
  },
  speedBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },

  // Volume with Hover Slider
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  volumeSliderTrack: {
    paddingHorizontal: 6,
    justifyContent: 'center'
  },

  // Time Display
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

  // Live Status Badge
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
  },

  // Resume Playback Prompt
  resumePromptContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 70 : 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 40
  },
  resumePromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 22, 35, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    maxWidth: 500,
    width: '100%'
  },
  resumeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resumeTextWrap: {
    flex: 1
  },
  resumePromptTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },
  resumePromptSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2
  },
  resumeBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  resumeBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  resumeBtnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8
  },
  resumeBtnClose: {
    padding: 6
  },
  resumeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  resumeBtnTextSecondary: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '500'
  },

  // Mini-Player Styles
  miniOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 10
  },
  miniTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)'
  },
  miniTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    marginRight: 6
  },
  miniIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniCenterTap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniPlayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniProgressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: colors.primary
  },

  // Error Overlay
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
  }
});
