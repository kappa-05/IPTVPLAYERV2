import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Animated,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { PlayingStream, Account } from '../types';
import { usePlayerCore } from './player/usePlayerCore';
import { SeamlessPosterBackdrop } from './player/SeamlessPosterBackdrop';
import { TrackSelectionModal } from './player/TrackSelectionModal';
import { QualitySelectionModal } from './player/QualitySelectionModal';
import { SpeedSelectionModal } from './player/SpeedSelectionModal';
import { KeyboardShortcutsModal } from './player/KeyboardShortcutsModal';

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

  // Core Hook
  const {
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
  } = usePlayerCore({
    visible,
    stream,
    account,
    isMinimized,
    onClose,
    onWatchProgressUpdated
  });

  // Controls Visibility
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const trackRef = useRef<any>(null);

  // Scrubber dragging
  const [isDragging, setIsDragging] = useState(false);
  const [dragSec, setDragSec] = useState<number | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  // Auto-hide controls timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !isDragging && !trackModalVisible && !qualityModalVisible && !speedModalVisible && !shortcutsModalVisible) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2800);
    }
  }, [isPlaying, isDragging, trackModalVisible, qualityModalVisible, speedModalVisible, shortcutsModalVisible]);

  useEffect(() => {
    resetControlsTimer();
  }, [isPlaying, resetControlsTimer]);

  // Mouse wheel volume on PC
  const handleWheel = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const delta = e.deltaY ?? 0;
    if (Math.abs(delta) < 2) return;
    e.preventDefault?.();
    const step = 0.05;
    changeVolume(delta < 0 ? volume + step : volume - step);
    resetControlsTimer();
  }, [volume, changeVolume, resetControlsTimer]);

  // Click on video: Single click = Play/Pause, Double click = Fullscreen
  const handleVideoClick = useCallback(() => {
    const now = Date.now();
    const diff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (diff < 280) {
      // Double click
      toggleFullscreen();
    } else {
      // Single click
      togglePlayPause();
      resetControlsTimer();
    }
  }, [toggleFullscreen, togglePlayPause, resetControlsTimer]);

  // Keyboard Shortcuts (PC)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          cycleVideoFit();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          togglePictureInPicture();
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
          changeVolume(volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.05);
          break;
        case '?':
        case 'h':
        case 'H':
          e.preventDefault();
          setShortcutsModalVisible(prev => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
            toggleFullscreen();
          } else {
            handleClose();
          }
          break;
        default:
          if (e.key >= '0' && e.key <= '9' && duration > 0) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) * 10;
            seekTo((pct / 100) * duration);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    visible,
    togglePlayPause,
    toggleFullscreen,
    toggleMute,
    cycleVideoFit,
    togglePictureInPicture,
    seekRelative,
    changeVolume,
    volume,
    duration,
    seekTo,
    handleClose,
    setShortcutsModalVisible
  ]);

  // Timeline scrubber calculation
  const getScrubSec = (clientX: number) => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handleScrubMouseDown = (e: any) => {
    if (duration <= 0) return;
    e.preventDefault?.();
    const clientX = e.clientX ?? 0;
    const target = getScrubSec(clientX);
    setIsDragging(true);
    setDragSec(target);

    const onMove = (moveEvt: MouseEvent) => {
      setDragSec(getScrubSec(moveEvt.clientX));
    };

    const onUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const finalSec = getScrubSec(upEvt.clientX);
      setIsDragging(false);
      setDragSec(null);
      seekTo(finalSec);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleScrubMouseMove = (e: any) => {
    if (duration <= 0 || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(rect.width, (e.clientX ?? 0) - rect.left));
    setHoverX(x);
    setHoverSec((x / rect.width) * duration);
  };

  // Format time (H:MM:SS or M:SS)
  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs) || secs <= 0) return '0:00';
    const total = Math.floor(secs);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!visible || !stream) return null;

  // Mini player mode
  if (isMinimized) {
    return (
      <View style={styles.miniPlayerContainer}>
        <video
          // @ts-ignore
          ref={webVideoRef}
          style={{ width: '100%', height: '100%', objectFit: videoFit, backgroundColor: '#000' }}
          autoPlay
          playsInline
        />
        <View style={styles.miniControls}>
          <TouchableOpacity style={styles.miniBtn} onPress={togglePlayPause}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
          </TouchableOpacity>
          {onToggleMinimize && (
            <TouchableOpacity style={styles.miniBtn} onPress={onToggleMinimize}>
              <Ionicons name="expand-outline" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.miniBtn} onPress={handleClose}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const curSec = isDragging && dragSec !== null ? dragSec : currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (curSec / duration) * 100)) : 0;

  return (
    <View
      // @ts-ignore
      nativeID="iptv-universal-player"
      id="iptv-universal-player"
      style={[
        styles.fullPlayerContainer,
        Platform.OS === 'web' && !showControls && isPlaying ? ({ cursor: 'none' } as any) : undefined
      ]}
      // @ts-ignore
      onMouseMove={resetControlsTimer}
      // @ts-ignore
      onWheel={handleWheel}
    >
      {/* ── 1. Initial Loading Screen (Gone forever after 1st frame) ── */}
      <SeamlessPosterBackdrop
        posterUri={stream.poster}
        title={stream.title}
        loading={isBuffering}
        statusText="Connessione allo stream..."
        firstFrameRendered={firstFrameRendered}
      />

      {/* ── 2. Video Element ── */}
      <video
        // @ts-ignore
        ref={webVideoRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          objectFit: videoFit
        }}
        autoPlay
        playsInline
        crossOrigin="anonymous"
      />

      {/* ── 3. Transparent Video Click Layer ── */}
      <TouchableOpacity
        style={styles.videoClickLayer}
        activeOpacity={1}
        onPress={handleVideoClick}
      />

      {/* ── 4. In-Playback Buffering Spinner (Never covers video with full poster) ── */}
      {isBuffering && firstFrameRendered && (
        <View style={styles.bufferingHud} pointerEvents="none">
          <View style={styles.bufferingHudPill}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.bufferingHudText}>Buffering...</Text>
          </View>
        </View>
      )}

      {/* ── 5. Aspect Ratio HUD Feedback ── */}
      {fitFeedback !== null && (
        <View style={styles.hudBadge} pointerEvents="none">
          <Ionicons name="scan-outline" size={24} color="#fff" />
          <Text style={styles.hudBadgeText}>{fitFeedback}</Text>
        </View>
      )}

      {/* ── 6. Volume HUD Feedback ── */}
      {volumeFeedback !== null && (
        <View style={styles.hudBadge} pointerEvents="none">
          <Ionicons
            name={volumeFeedback === 0 ? 'volume-mute' : volumeFeedback < 50 ? 'volume-low' : 'volume-high'}
            size={26}
            color="#fff"
          />
          <Text style={styles.hudBadgeText}>{volumeFeedback}%</Text>
        </View>
      )}

      {/* ── 7. Muted Autoplay Warning Banner ── */}
      {showMutedBanner && (
        <TouchableOpacity
          style={styles.unmuteBanner}
          activeOpacity={0.85}
          onPress={dismissMutedBanner}
        >
          <Ionicons name="volume-mute" size={18} color="#fff" />
          <Text style={styles.unmuteBannerText}>Audio disattivato dal browser — Clicca per attivare l'audio</Text>
          <Ionicons name="volume-high" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* ── 8. Error Overlay with Retry ── */}
      {errorMsg && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
            <Text style={styles.errorHeading}>Errore di Riproduzione</Text>
            <Text style={styles.errorDesc}>{errorMsg}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryBtn} onPress={retry}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryBtnText}>Riprova</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <Text style={styles.closeBtnText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── 9. Interactive Controls Overlay ── */}
      {showControls && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.topLeft}>
              <TouchableOpacity style={styles.backBtn} onPress={handleClose}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={styles.backBtnText}>Chiudi</Text>
              </TouchableOpacity>

              <View style={styles.titleInfo}>
                <View style={styles.badgeRow}>
                  <View style={[styles.typeBadge, isLive ? styles.typeBadgeLive : styles.typeBadgeVod]}>
                    <Text style={styles.typeBadgeText}>
                      {isLive ? 'LIVE' : stream.type === 'series' ? 'SERIE' : 'VOD'}
                    </Text>
                  </View>
                  <Text style={styles.streamTitle} numberOfLines={1}>
                    {stream.title}
                  </Text>
                </View>
                {stream.subTitle ? (
                  <Text style={styles.streamSubTitle} numberOfLines={1}>
                    {stream.subTitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.topRight}>
              {isLive && onOpenEpg && (
                <TouchableOpacity style={styles.glassBtn} onPress={onOpenEpg}>
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={styles.glassBtnText}>Guida TV</Text>
                </TouchableOpacity>
              )}

              {onToggleMinimize && (
                <TouchableOpacity style={styles.iconBtn} onPress={onToggleMinimize} accessibilityLabel="Mini-player">
                  <Ionicons name="contract-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.iconBtn} onPress={() => setShortcutsModalVisible(true)} accessibilityLabel="Scorciatoie">
                <Ionicons name="help-circle-outline" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconBtn} onPress={handleClose} accessibilityLabel="Chiudi">
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Big Center Play Icon (shown only when paused) */}
          {!isPlaying && !isBuffering && (
            <View style={styles.centerPlayArea} pointerEvents="box-none">
              <TouchableOpacity style={styles.centerPlayBtn} onPress={togglePlayPause}>
                <Ionicons name="play" size={44} color="#fff" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Bar */}
          <View style={styles.bottomBar} pointerEvents="auto">
            {/* Timeline Scrubber (for Movies and Series) */}
            {!isLive && (
              <View
                // @ts-ignore
                ref={trackRef}
                style={styles.scrubberArea}
                // @ts-ignore
                onMouseDown={handleScrubMouseDown}
                // @ts-ignore
                onMouseMove={handleScrubMouseMove}
                // @ts-ignore
                onMouseLeave={() => setHoverSec(null)}
              >
                <View style={styles.scrubberTrack}>
                  <View style={[styles.scrubberBuffer, { width: `${bufferPercent}%` }]} />
                  <View style={[styles.scrubberProgress, { width: `${progressPct}%` }]} />
                  <View style={[styles.scrubberThumb, { left: `${progressPct}%` }]} />
                </View>

                {/* Hover / Drag Preview Tooltip */}
                {(hoverSec !== null || (isDragging && dragSec !== null)) && (
                  <View
                    style={[
                      styles.hoverTooltip,
                      { left: isDragging && dragSec !== null ? `${progressPct}%` : `${hoverX}px` }
                    ]}
                  >
                    <Text style={styles.hoverTooltipText}>
                      {formatTime(isDragging && dragSec !== null ? dragSec : (hoverSec || 0))}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Bottom Controls Row */}
            <View style={styles.bottomRow}>
              {/* Left: Play/Pause, Skip, Time */}
              <View style={styles.bottomLeft}>
                <TouchableOpacity style={styles.ctrlBtn} onPress={togglePlayPause}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
                </TouchableOpacity>

                {!isLive && (
                  <>
                    <TouchableOpacity style={styles.ctrlBtn} onPress={() => seekRelative(-10)}>
                      <Ionicons name="arrow-undo" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ctrlBtn} onPress={() => seekRelative(10)}>
                      <Ionicons name="arrow-redo" size={20} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}

                {isLive ? (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>DIRETTA</Text>
                  </View>
                ) : (
                  <Text style={styles.timeText}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </Text>
                )}
              </View>

              {/* Right: Tracks, Quality, Speed, Aspect Ratio, Volume, PiP, Fullscreen */}
              <View style={styles.bottomRight}>
                {/* Audio / Subtitle modal */}
                {(audioTracks.length > 1 || subtitleTracks.length > 0) && (
                  <TouchableOpacity
                    style={[styles.ctrlBtn, (activeSubtitleTrack !== -1 || audioTracks.length > 1) && styles.ctrlBtnActive]}
                    onPress={() => setTrackModalVisible(true)}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                )}

                {/* Quality modal */}
                {qualityLevels.length > 1 && (
                  <TouchableOpacity
                    style={[styles.ctrlBtn, activeQualityLevel !== -1 && styles.ctrlBtnActive]}
                    onPress={() => setQualityModalVisible(true)}
                  >
                    <Ionicons name="speedometer-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                )}

                {/* Playback speed (VOD) */}
                {!isLive && (
                  <TouchableOpacity
                    style={[styles.ctrlBtn, playbackSpeed !== 1.0 && styles.ctrlBtnActive]}
                    onPress={() => setSpeedModalVisible(true)}
                  >
                    <Text style={styles.speedText}>{playbackSpeed === 1.0 ? '1x' : `${playbackSpeed}x`}</Text>
                  </TouchableOpacity>
                )}

                {/* Aspect Ratio Toggle (Adatta / Riempi / Allunga) */}
                <TouchableOpacity
                  style={[styles.ctrlBtn, videoFit !== 'contain' && styles.ctrlBtnActive]}
                  onPress={cycleVideoFit}
                  accessibilityLabel="Formato video (Adatta / Riempi / Allunga)"
                >
                  <Ionicons
                    name={videoFit === 'cover' ? 'crop' : videoFit === 'fill' ? 'resize' : 'scan-outline'}
                    size={20}
                    color={videoFit !== 'contain' ? colors.primary : '#fff'}
                  />
                </TouchableOpacity>

                {/* Volume Button & Hover Slider */}
                <View style={styles.volumeWrap}>
                  <TouchableOpacity style={styles.ctrlBtn} onPress={toggleMute}>
                    <Ionicons
                      name={isMuted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    style={{
                      width: 75,
                      height: 4,
                      cursor: 'pointer',
                      accentColor: colors.primary
                    }}
                  />
                </View>

                {/* PiP */}
                <TouchableOpacity style={styles.ctrlBtn} onPress={togglePictureInPicture}>
                  <Ionicons name="albums-outline" size={20} color="#fff" />
                </TouchableOpacity>

                {/* Fullscreen */}
                <TouchableOpacity style={styles.ctrlBtn} onPress={toggleFullscreen}>
                  <Ionicons name={isFullscreen ? 'contract' : 'expand'} size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 10. Modals ── */}
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

      <QualitySelectionModal
        visible={qualityModalVisible}
        qualityLevels={qualityLevels}
        activeQualityLevel={activeQualityLevel}
        onSelectQualityLevel={handleSelectQualityLevel}
        onClose={() => setQualityModalVisible(false)}
      />

      <SpeedSelectionModal
        visible={speedModalVisible}
        activeSpeed={playbackSpeed}
        onSelectSpeed={handleSelectPlaybackSpeed}
        onClose={() => setSpeedModalVisible(false)}
      />

      <KeyboardShortcutsModal
        visible={shortcutsModalVisible}
        onClose={() => setShortcutsModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fullPlayerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 9999,
    overflow: 'hidden'
  },
  miniPlayerContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 320,
    height: 180,
    backgroundColor: '#000',
    borderRadius: 12,
    zIndex: 9999,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16
  },
  miniControls: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6
  },
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  videoClickLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5
  },
  bufferingHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  bufferingHudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(12, 16, 26, 0.88)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  bufferingHudText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  hudBadge: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(12, 16, 26, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.5)'
  },
  hudBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  unmuteBanner: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.6)'
  },
  unmuteBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 40
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    maxWidth: 420
  },
  errorHeading: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6
  },
  errorDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 15
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)'
  } as any,
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20
  },
  backBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  titleInfo: {
    gap: 2
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  typeBadgeLive: {
    backgroundColor: '#ef4444'
  },
  typeBadgeVod: {
    backgroundColor: colors.primary
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800'
  },
  streamTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: 400
  },
  streamSubTitle: {
    color: colors.textSecondary,
    fontSize: 12
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  glassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20
  },
  glassBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  centerPlayArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center'
  },
  centerPlayBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 30,
    backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)'
  } as any,
  scrubberArea: {
    paddingVertical: 10,
    cursor: 'pointer'
  } as any,
  scrubberTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    position: 'relative'
  },
  scrubberBuffer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 3
  },
  scrubberProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 3
  },
  scrubberThumb: {
    position: 'absolute',
    top: -5,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginLeft: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4
  },
  hoverTooltip: {
    position: 'absolute',
    top: -24,
    marginLeft: -25,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  hoverTooltipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  bottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderColor: colors.primary
  },
  speedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  volumeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444'
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800'
  },
  timeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  }
});
