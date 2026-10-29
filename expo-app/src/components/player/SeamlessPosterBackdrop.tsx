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
}

export const SeamlessPosterBackdrop: React.FC<SeamlessPosterBackdropProps> = ({
  posterUri,
  title,
  loading,
  statusText = 'Caricamento...',
  firstFrameRendered
}) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [shouldRender, setShouldRender] = useState(true);

  // When first frame is decoded and rendered, smoothly fade out this poster overlay
  useEffect(() => {
    if (firstFrameRendered) {
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
  }, [firstFrameRendered, fadeAnim]);

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
      {/* Ambient Deep Blur Backdrop matching poster colors */}
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.ambientGlow}
          blurRadius={Platform.OS === 'web' ? 48 : 24}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.darkVignette} />

      {/* Center Poster Preview with Responsive Aspect-Ratio Contain */}
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
    opacity: 0.32,
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
    paddingHorizontal: 24,
    maxWidth: 480,
    width: '100%'
  },
  posterCard: {
    width: 280,
    height: 180,
    maxWidth: '85%',
    maxHeight: 220,
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
    backgroundColor: 'rgba(15, 20, 30, 0.7)',
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
