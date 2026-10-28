import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { WatchHistoryItem } from '../types';

interface ContinueWatchingRowProps {
  history: WatchHistoryItem[];
  onPressItem: (item: WatchHistoryItem) => void;
  onRemoveItem: (id: string) => void;
}

export const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({
  history,
  onPressItem,
  onRemoveItem
}) => {
  if (!history || history.length === 0) return null;

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const renderCard = ({ item }: { item: WatchHistoryItem }) => {
    const remainingSec = Math.max(0, item.duration - item.currentTime);
    const subtitle = item.seriesName
      ? `${item.seriesName}${item.seasonNum ? ` • S${item.seasonNum}` : ''}${item.episodeNum ? `:E${item.episodeNum}` : ''}`
      : (remainingSec > 0 ? `Mancano ${formatDuration(remainingSec)}` : `${Math.floor(item.percent)}% completato`);

    return (
      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => onPressItem(item)}
        >
          {/* Poster / Thumbnail */}
          <View style={styles.imageWrapper}>
            {item.poster ? (
              <Image
                source={{ uri: item.poster }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="film-outline" size={32} color={colors.textMuted} />
              </View>
            )}

            {/* Gradient Dark Overlay */}
            <View style={styles.gradientOverlay} />

            {/* Top Badge: Type / Season */}
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {item.type === 'series'
                  ? (item.seasonNum ? `S${item.seasonNum}:E${item.episodeNum}` : 'SERIE')
                  : 'FILM'}
              </Text>
            </View>

            {/* Remove / Dismiss Button */}
            <TouchableOpacity
              style={styles.removeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e.stopPropagation?.();
                onRemoveItem(item.id);
              }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>

            {/* Center Play Icon */}
            <View style={styles.centerPlayCircle}>
              <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
            </View>

            {/* Progress Bar Container */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(5, item.percent))}%` }
                ]}
              />
            </View>
          </View>

          {/* Info Below Thumbnail */}
          <View style={styles.infoWrapper}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText} numberOfLines={1}>
                {subtitle}
              </Text>
              <Text style={styles.percentText}>
                {Math.floor(item.percent)}%
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <View style={styles.flameIconWrapper}>
            <Ionicons name="time" size={18} color={colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>Continua a guardare</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{history.length}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={history}
        renderItem={renderCard}
        keyExtractor={(it) => `cw_${it.id}_${it.updatedAt}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    marginTop: 6
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  flameIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 12
  },
  cardContainer: {
    width: 220
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  imageWrapper: {
    width: '100%',
    height: 124,
    backgroundColor: '#0c0f17',
    position: 'relative'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121722'
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 12, 0.35)'
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  typeBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  centerPlayCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -18 }, { translateY: -18 }],
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4
  },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2
  },
  infoWrapper: {
    padding: 10
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1
  },
  percentText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 6
  }
});
