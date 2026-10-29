import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  Platform
} from 'react-native';
import { colors } from '../../theme/colors';

interface SeamlessPosterBackdropProps {
  posterUri?: string;
  title?: string;
  loading: boolean;
  statusText?: string;
  firstFrameRendered: boolean;
  isPlaying?: boolean;
  currentTime?: number;
}

export const SeamlessPosterBackdrop: React.FC<SeamlessPosterBackdropProps> = ({
  posterUri,
  title,
  loading,
  statusText = 'Caricamento...',
  firstFrameRendered,
  isPlaying = false,
  currentTime = 0
}) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [shouldRender, setShouldRender] = useState(true);

  // Synchronize fade-out strictly with actual video rendering to eliminate any black flash / glitch
  const isVideoActivelyRendering = firstFrameRendered || (isPlaying && currentTime > 0);

  useEffect(() => {
    if (isVideoActivelyRendering) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web'
      }).start(() => {
        setShouldRender(false);
      });
    } else {
      setShouldRender(true);
      fadeAnim.setValue(1);
    }
  }, [isVideoActivelyRendering, fadeAnim]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim
        }
      ]}
      pointerEvents="none"
    >
      {/* 1. Ambient Blurred Backdrop matching dominant poster colors (cover mode for cinematic atmosphere) */}
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.ambientGlow}
          blurRadius={Platform.OS === 'web' ? 48 : 24}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.darkVignette} />

      {/* 2. Responsive Foreground Container: resizeMode="contain" ensuring neither 2:3 nor 16:9 thumbnails are cut off */}
      <View style={styles.centerContainer}>
        {posterUri ? (
          <View style={styles.posterCard}>
            <Image
              source={{ uri: posterUri }}
              style={[
                styles.posterImage,
                Platform.OS === 'web' ? ({ objectFit: 'contain' } as any) : null
              ]}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {title ? (
          <Text style={styles.titleText} numberOfLines={2}>
            {title}
          </Text>
        ) : null}

        {loading && (
          <View style={styles.spinnerRow}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#030508',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
    width: '100%',
    height: '100%'
  },
  darkVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3, 5, 8, 0.78)'
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    maxWidth: 520,
    width: '100%',
    zIndex: 2
  },
  posterCard: {
    width: 320,
    height: 200,
    maxWidth: '85%',
    maxHeight: 240,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.85,
    shadowRadius: 24,
    elevation: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(12, 16, 26, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6
  },
  posterImage: {
    width: '100%',
    height: '100%'
  },
  titleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6
  },
  spinnerRow: {
    alignItems: 'center',
    gap: 12
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3
  }
});
