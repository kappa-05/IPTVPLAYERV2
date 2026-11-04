import React from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, Platform } from 'react-native';
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
  // If the first video frame has rendered, never show the full-screen backdrop
  if (firstFrameRendered) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.ambientGlow}
          blurRadius={Platform.OS === 'web' ? 48 : 24}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.darkVignette} />

      <View style={styles.centerCard}>
        {posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={[styles.posterImage, Platform.OS === 'web' ? ({ objectFit: 'contain' } as any) : null]}
            resizeMode="contain"
          />
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
    </View>
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
  centerCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    maxWidth: 480,
    width: '100%',
    zIndex: 2
  },
  posterImage: {
    width: 220,
    height: 140,
    borderRadius: 12,
    marginBottom: 16
  },
  titleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500'
  }
});
