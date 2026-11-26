import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { FavoriteItem, MediaType, WatchHistoryItem } from '../types';
import { ContinueWatchingRow } from './ContinueWatchingRow';
import { NewContentItem, matchesNewContentItem } from '../services/NewContentService';

interface HomeScreenProps {
  vod: any[];
  series: any[];
  newContent: NewContentItem[];
  history: WatchHistoryItem[];
  favorites: FavoriteItem[];
  loading?: boolean;
  onPressItem: (item: any, type: MediaType) => void;
  onToggleFavorite: (item: any) => void;
  onPressHistoryItem?: (item: WatchHistoryItem) => void;
  onRemoveHistoryItem?: (id: string) => void;
  onNavigate: (tab: 'live' | 'vod' | 'series' | 'favorites') => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  vod,
  series,
  newContent = [],
  history,
  favorites,
  loading = false,
  onPressItem,
  onToggleFavorite,
  onPressHistoryItem,
  onRemoveHistoryItem,
  onNavigate
}) => {
  const { width } = useWindowDimensions();
  const renderPoster = (item: any, type: MediaType, index: number) => {
    const poster = item?.stream_icon || item?.cover;
    const title = item?.name || item?.title || 'Senza titolo';
    const itemId = String(item?.stream_id || item?.series_id || item?.id || '');
    const isFavorite = favorites.some((favorite) => String(favorite.streamId) === itemId);
    return (
      <TouchableOpacity
        key={`${type}_${item?.stream_id || item?.series_id || index}`}
        style={[styles.posterCard, { width: width < 600 ? 116 : 142 }]}
        activeOpacity={0.82}
        onPress={() => onPressItem(item, type)}
      >
        <View style={styles.posterFrame}>
          {poster ? (
            <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name={type === 'series' ? 'albums-outline' : 'film-outline'} size={30} color={colors.textMuted} />
            </View>
          )}
          {item?.rating || item?.rating_5based ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={10} color={colors.accentAmber} />
              <Text style={styles.ratingText}>{String(item.rating || item.rating_5based).slice(0, 3)}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.favoriteButton}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            onPress={(event) => {
              // @ts-ignore - React Native Web exposes stopPropagation on the event.
              event?.stopPropagation?.();
              onToggleFavorite({ ...item, type });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={16} color={isFavorite ? colors.accentAmber : '#fff'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.posterTitle} numberOfLines={2}>{title}</Text>
        {!!(item?.year || item?.releaseDate) && (
          <Text style={styles.posterYear}>{String(item.year || item.releaseDate).slice(0, 4)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, icon: keyof typeof Ionicons.glyphMap, items: any[], type: MediaType, destination: 'vod' | 'series') => {
    if (!items?.length) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            <Ionicons name={icon} size={19} color={colors.primary} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate(destination)} style={styles.seeAll}>
            <Text style={styles.seeAllText}>Vedi tutti</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterList}>
          {items.slice(0, 18).map((item, index) => renderPoster(item, type, index))}
        </ScrollView>
      </View>
    );
  };

  const renderNewContentSection = () => {
    const sortedItems = [...newContent]
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, 18);

    if (sortedItems.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            <Ionicons name="sparkles" size={19} color={colors.primary} />
            <Text style={styles.sectionTitle}>Novità</Text>
          </View>
          <Text style={styles.newContentSubtitle}>Ultimi 30 giorni</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterList}>
          {sortedItems.map((entry, index) => {
            const catalog = entry.type === 'vod' ? vod : series;
            const item = catalog.find(candidate =>
              matchesNewContentItem(entry, candidate)
            );

            if (!item) return null;

            const itemId = String(item.stream_id || item.series_id || item.id || '');
            const isFavorite = favorites.some(
              favorite => String(favorite.streamId) === itemId
            );
            const poster = item.stream_icon || item.cover || entry.poster;
            const detectedDate = new Date(entry.detectedAt).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: '2-digit'
            });

            return (
              <TouchableOpacity
                key={`new_${entry.type}_${entry.id}`}
                style={[styles.posterCard, { width: width < 600 ? 116 : 142 }]}
                activeOpacity={0.82}
                onPress={() => onPressItem(item, entry.type)}
              >
                <View style={styles.posterFrame}>
                  {poster ? (
                    <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
                  ) : (
                    <View style={styles.posterFallback}>
                      <Ionicons
                        name={entry.type === 'series' ? 'albums-outline' : 'film-outline'}
                        size={30}
                        color={colors.textMuted}
                      />
                    </View>
                  )}

                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NUOVO</Text>
                  </View>

                  {item.rating || item.rating_5based ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={10} color={colors.accentAmber} />
                      <Text style={styles.ratingText}>
                        {String(item.rating || item.rating_5based).slice(0, 3)}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.favoriteButton}
                    accessibilityRole="button"
                    accessibilityLabel={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    onPress={(event) => {
                      // @ts-ignore - React Native Web exposes stopPropagation on the event.
                      event?.stopPropagation?.();
                      onToggleFavorite({ ...item, type: entry.type });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={isFavorite ? 'star' : 'star-outline'}
                      size={16}
                      color={isFavorite ? colors.accentAmber : '#fff'}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.posterTitle} numberOfLines={2}>
                  {entry.title}
                </Text>
                <Text style={styles.newDate}>
                  Aggiunto il {detectedDate}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.welcomeRow}>
        <View>
          <Text style={styles.eyebrow}>LA TUA LIBRERIA</Text>
          <Text style={styles.pageTitle}>Home</Text>
        </View>
      </View>

      {history.length > 0 && onPressHistoryItem && onRemoveHistoryItem && (
        <ContinueWatchingRow
          history={history.slice(0, 12)}
          onPressItem={onPressHistoryItem}
          onRemoveItem={onRemoveHistoryItem}
        />
      )}

      {renderNewContentSection()}

      {renderSection('Film', 'film-outline', vod, 'vod', 'vod')}
      {renderSection('Serie TV', 'albums-outline', series, 'series', 'series')}

      {!loading && vod.length === 0 && series.length === 0 && history.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="library-outline" size={38} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>La tua Home è pronta</Text>
          <Text style={styles.emptyText}>Quando il catalogo sarà disponibile, troverai qui film, serie e contenuti da riprendere.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => onNavigate('live')}>
            <Text style={styles.emptyButtonText}>Vai alla TV in diretta</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 36 },
  welcomeRow: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  pageTitle: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 3 },
  section: { marginBottom: 28 },
  sectionHeader: { paddingHorizontal: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seeAllText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  posterList: { paddingHorizontal: 16, gap: 12 },
  posterCard: { marginRight: 1 },
  posterFrame: { aspectRatio: 2 / 3, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.surface, position: 'relative', borderWidth: 1, borderColor: colors.border },
  poster: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rating: { position: 'absolute', top: 7, right: 7, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  favoriteButton: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  posterTitle: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 8 },
  posterYear: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  newBadge: { position: 'absolute', top: 7, left: 7, backgroundColor: colors.primary, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  newBadgeText: { color: '#080a0f', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  newDate: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  newContentSubtitle: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingVertical: 48 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 7, maxWidth: 360 },
  emptyButton: { marginTop: 18, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  emptyButtonText: { color: '#080a0f', fontSize: 12, fontWeight: '800' }
});
