import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { EPGChannelSchedule, LiveStream, MediaType } from '../types';

interface StreamCardProps {
  item: any;
  type: MediaType;
  onPress: (item: any) => void;
  isFavorite: boolean;
  onToggleFavorite: (item: any) => void;
  onOpenEpg?: (stream: LiveStream) => void;
  epgSchedule?: EPGChannelSchedule | null;
}

export const StreamCard: React.FC<StreamCardProps> = ({
  item,
  type,
  onPress,
  isFavorite,
  onToggleFavorite,
  onOpenEpg,
  epgSchedule
}) => {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // --- LIVE TV CARD ---
  if (type === 'live') {
    const stream = item as LiveStream;
    const iconUrl = (!imageError && stream.stream_icon) ? stream.stream_icon : null;
    const currentProg = epgSchedule?.current;

    return (
      <TouchableOpacity
        style={[
          styles.liveCard,
          isHovered && styles.cardHovered
        ]}
        activeOpacity={0.7}
        onPress={() => onPress(stream)}
        // @ts-ignore
        onMouseEnter={() => setIsHovered(true)}
        // @ts-ignore
        onMouseLeave={() => setIsHovered(false)}
      >
        <View style={styles.liveIconWrapper}>
          {iconUrl ? (
            <Image
              source={{ uri: iconUrl }}
              style={styles.liveIcon}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.liveIconFallback}>
              <Ionicons name="tv-outline" size={22} color={colors.textSecondary} />
            </View>
          )}
        </View>

        <View style={styles.liveContent}>
          <Text style={styles.liveTitle} numberOfLines={1}>
            {stream.name}
          </Text>

          {/* Current Program EPG preview */}
          {currentProg ? (
            <View style={styles.liveEpgPreview}>
              <View style={styles.liveEpgTitleRow}>
                <Text style={styles.liveEpgProgTitle} numberOfLines={1}>
                  {currentProg.title}
                </Text>
                <Text style={styles.liveEpgProgTime}>
                  {currentProg.start}
                </Text>
              </View>
              {currentProg.progressPercent !== undefined && (
                <View style={styles.miniEpgTrack}>
                  <View style={[styles.miniEpgBar, { width: `${currentProg.progressPercent}%` }]} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.liveMetaRow}>
              <View style={styles.badgeLive}>
                <View style={styles.liveRedDot} />
                <Text style={styles.badgeLiveText}>LIVE</Text>
              </View>
              {stream.epg_channel_id ? (
                <Text style={styles.liveEpg} numberOfLines={1}>
                  {stream.epg_channel_id}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Action Buttons: EPG + Favorite */}
        <View style={styles.liveActions}>
          {onOpenEpg && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                // @ts-ignore
                e?.stopPropagation?.();
                onOpenEpg(stream);
              }}
              accessibilityLabel="Guida TV"
            >
              <Ionicons name="calendar-outline" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={(e) => {
              // @ts-ignore
              e?.stopPropagation?.();
              onToggleFavorite(stream);
            }}
            accessibilityLabel="Aggiungi ai preferiti"
          >
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={isFavorite ? colors.accentAmber : colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  // --- VOD MOVIE & SERIES POSTER CARD ---
  const isSeries = type === 'series';
  const title = item.name || item.title || 'Senza Titolo';
  const posterUrl = (!imageError && (item.stream_icon || item.cover)) ? (item.stream_icon || item.cover) : null;
  const rating = item.rating || item.rating_5based;

  return (
    <TouchableOpacity
      style={[
        styles.posterCard,
        isHovered && styles.cardHovered
      ]}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      // @ts-ignore
      onMouseEnter={() => setIsHovered(true)}
      // @ts-ignore
      onMouseLeave={() => setIsHovered(false)}
    >
      <View style={styles.posterWrapper}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.posterImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.posterFallback}>
            <Ionicons
              name={isSeries ? 'albums-outline' : 'film-outline'}
              size={36}
              color={colors.textMuted}
            />
          </View>
        )}

        {/* Top Badges */}
        <View style={styles.posterBadges}>
          {isSeries ? (
            <View style={styles.badgeNeutral}>
              <Text style={styles.badgeNeutralText}>SERIE</Text>
            </View>
          ) : item.container_extension ? (
            <View style={styles.badgeNeutral}>
              <Text style={styles.badgeNeutralText}>
                {item.container_extension.toUpperCase()}
              </Text>
            </View>
          ) : null}

          {rating ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color={colors.accentAmber} />
              <Text style={styles.ratingText}>
                {typeof rating === 'number' ? rating.toFixed(1) : String(rating).slice(0, 3)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Favorite Icon */}
        <TouchableOpacity
          style={styles.posterFavBtn}
          onPress={(e) => {
            // @ts-ignore
            e?.stopPropagation?.();
            onToggleFavorite(item);
          }}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={16}
            color={isFavorite ? colors.accentAmber : 'rgba(255,255,255,0.85)'}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.posterInfo}>
        <Text style={styles.posterTitle} numberOfLines={1}>
          {title}
        </Text>
        {isSeries && item.genre ? (
          <Text style={styles.posterSubtitle} numberOfLines={1}>
            {item.genre}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardHovered: {
    borderColor: colors.borderActive,
    backgroundColor: colors.cardHover,
    transform: Platform.OS === 'web' ? [{ translateY: -2 }] : []
  },

  // Live Card
  liveCard: {
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8
  },
  liveIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  liveIcon: {
    width: 40,
    height: 40
  },
  liveIconFallback: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  liveContent: {
    flex: 1
  },
  liveTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 3
  },
  liveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  liveRedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accentRed
  },
  badgeLiveText: {
    color: colors.accentRed,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  liveEpg: {
    color: colors.textMuted,
    fontSize: 11
  },
  liveEpgPreview: {
    marginTop: 2
  },
  liveEpgTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6
  },
  liveEpgProgTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    flex: 1
  },
  liveEpgProgTime: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600'
  },
  miniEpgTrack: {
    height: 3,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 3
  },
  miniEpgBar: {
    height: '100%',
    backgroundColor: colors.primary
  },
  liveActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  actionBtn: {
    padding: 6
  },

  // Poster Card
  posterCard: {
    backgroundColor: colors.card,
    borderRadius: 6,
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
  posterFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  posterBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    gap: 4
  },
  badgeNeutral: {
    backgroundColor: 'rgba(9, 11, 16, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  badgeNeutralText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700'
  },
  ratingBadge: {
    backgroundColor: 'rgba(9, 11, 16, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  ratingText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700'
  },
  posterFavBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(9, 11, 16, 0.75)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  posterInfo: {
    padding: 10
  },
  posterTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600'
  },
  posterSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  }
});
