import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { MediaType } from '../../types';

interface MobileVodCardProps {
  item: any;
  type: MediaType;
  isFavorite: boolean;
  onPress: (item: any) => void;
  onToggleFavorite: (item: any) => void;
}

export const MobileVodCard: React.FC<MobileVodCardProps> = ({
  item,
  type,
  isFavorite,
  onPress,
  onToggleFavorite
}) => {
  const [imageError, setImageError] = useState(false);
  const title = item.name || item.title || 'Senza Titolo';
  const posterUrl = (!imageError && (item.stream_icon || item.cover)) ? (item.stream_icon || item.cover) : null;
  const rating = item.rating || item.rating_5based;
  const year = item.year || item.releaseDate ? String(item.year || item.releaseDate).slice(0, 4) : null;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
    >
      {/* Poster Image */}
      <View style={styles.posterWrapper}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.posterImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.fallbackPoster}>
            <Ionicons
              name={type === 'series' ? 'albums-outline' : 'film-outline'}
              size={32}
              color={colors.textMuted}
            />
          </View>
        )}

        {/* Top Badges */}
        <View style={styles.topBadges}>
          {type === 'series' && (
            <View style={styles.badgeSeries}>
              <Text style={styles.badgeSeriesText}>SERIE</Text>
            </View>
          )}

          {rating ? (
            <View style={styles.badgeRating}>
              <Ionicons name="star" size={9} color={colors.accentAmber} />
              <Text style={styles.badgeRatingText}>{String(rating).slice(0, 3)}</Text>
            </View>
          ) : null}
        </View>

        {/* Favorite Button */}
        <TouchableOpacity
          style={styles.favBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            // @ts-ignore
            e?.stopPropagation?.();
            onToggleFavorite(item);
          }}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={16}
            color={isFavorite ? colors.accentAmber : '#ffffff'}
          />
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {year && (
          <Text style={styles.year}>{year}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12
  },
  posterWrapper: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: colors.surface,
    position: 'relative'
  },
  posterImage: {
    width: '100%',
    height: '100%'
  },
  fallbackPoster: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  topBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    gap: 4
  },
  badgeSeries: {
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3
  },
  badgeSeriesText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  badgeRating: {
    backgroundColor: 'rgba(9, 11, 16, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  badgeRatingText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700'
  },
  favBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(9, 11, 16, 0.75)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  info: {
    padding: 8
  },
  title: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16
  },
  year: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2
  }
});
