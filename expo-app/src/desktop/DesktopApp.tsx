import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform
} from 'react-native';
import { colors } from '../theme/colors';
import {
  Account,
  Category,
  EPGChannelSchedule,
  FavoriteItem,
  LiveStream,
  MediaType,
  NavTab,
  WatchHistoryItem
} from '../types';
import { Header } from '../components/Header';
import { CategorySelector } from '../components/CategorySelector';
import { StreamCard } from '../components/StreamCard';
import { EpgGuideView } from '../components/EpgGuideView';
import { ContinueWatchingRow } from '../components/ContinueWatchingRow';
import { Ionicons } from '@expo/vector-icons';

interface DesktopAppProps {
  account: Account | null;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  categorySearchQuery: string;
  onCategorySearchChange: (q: string) => void;
  streams: any[];
  liveChannels: LiveStream[];
  liveCategories: Category[];
  favorites: FavoriteItem[];
  epgMap: Record<string, EPGChannelSchedule>;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onPressItem: (item: any, type?: MediaType) => void;
  onToggleFavorite: (item: any) => void;
  onOpenEpgModal: (stream: LiveStream) => void;
  onLoadEpg: (channel: LiveStream) => Promise<EPGChannelSchedule | null>;
  onOpenLogin: () => void;
  onLogout: () => void;
  history?: WatchHistoryItem[];
  onPressHistoryItem?: (item: WatchHistoryItem) => void;
  onRemoveHistoryItem?: (id: string) => void;
  onToggleMobileMode?: () => void;
  onOpenInstallPwa?: () => void;
}

export const DesktopApp: React.FC<DesktopAppProps> = ({
  account,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  categorySearchQuery,
  onCategorySearchChange,
  streams,
  liveChannels,
  liveCategories,
  favorites,
  epgMap,
  loading,
  refreshing,
  onRefresh,
  onPressItem,
  onToggleFavorite,
  onOpenEpgModal,
  onLoadEpg,
  onOpenLogin,
  onLogout,
  history = [],
  onPressHistoryItem,
  onRemoveHistoryItem,
  onToggleMobileMode,
  onOpenInstallPwa
}) => {
  const { width } = useWindowDimensions();

  // Filter history relevant to current tab
  const relevantHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (activeTab === 'vod') return history.filter(h => h.type === 'vod');
    if (activeTab === 'series') return history.filter(h => h.type === 'series');
    return [];
  }, [history, activeTab]);

  // Filtered items by search query and active tab
  const displayedItems = useMemo(() => {
    if (activeTab === 'favorites') {
      if (!searchQuery) return favorites;
      return favorites.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    let list = streams;
    // Strict type separation: ensure movies never leak into series tab and vice versa
    if (activeTab === 'series') {
      list = list.filter(s => s.stream_type !== 'movie');
    } else if (activeTab === 'vod') {
      list = list.filter(s => !(s.series_id && !s.stream_id));
    }

    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s => {
      const name = (s.name || s.title || '').toLowerCase();
      const sid = String(s.stream_id || s.series_id || '');
      return name.includes(q) || sid.includes(q);
    });
  }, [activeTab, streams, favorites, searchQuery]);

  // Responsive Grid Columns for Desktop
  const numColumns = useMemo(() => {
    if (activeTab === 'live') {
      if (width >= 1600) return 4;
      if (width >= 1200) return 3;
      return 2;
    }
    // Posters (VOD & Series)
    if (width >= 1600) return 6;
    if (width >= 1300) return 5;
    if (width >= 1000) return 4;
    return 3;
  }, [width, activeTab]);

  const renderStreamItem = useCallback(({ item }: { item: any }) => {
    const isFav = activeTab === 'favorites'
      ? true
      : favorites.some(f => String(f.streamId) === String(item.stream_id || item.series_id || item.id));

    const cardType = activeTab === 'favorites' ? (item.type || 'live') : activeTab;
    const cardItem = activeTab === 'favorites' ? (item.rawItem || item) : item;
    const sid = String(cardItem.stream_id || cardItem.streamId || '');
    const sched = cardType === 'live' ? epgMap[sid] : null;

    return (
      <View style={{ flex: 1 / numColumns, paddingHorizontal: 6 }}>
        <StreamCard
          item={cardItem}
          type={cardType}
          onPress={(it) => onPressItem(it, cardType)}
          isFavorite={isFav}
          onToggleFavorite={onToggleFavorite}
          onOpenEpg={cardType === 'live' ? onOpenEpgModal : undefined}
          epgSchedule={sched}
        />
      </View>
    );
  }, [activeTab, favorites, numColumns, epgMap, onPressItem, onToggleFavorite, onOpenEpgModal]);

  return (
    <View style={styles.container}>
      {/* Desktop Header */}
      <Header
        activeTab={activeTab}
        onTabChange={onTabChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        account={account}
        onOpenLogin={onOpenLogin}
        onLogout={onLogout}
        onRefresh={onRefresh}
        onToggleMobileMode={onToggleMobileMode}
        onOpenInstallPwa={onOpenInstallPwa}
        counts={{
          live: activeTab === 'live' ? displayedItems.length : undefined,
          vod: activeTab === 'vod' ? displayedItems.length : undefined,
          series: activeTab === 'series' ? displayedItems.length : undefined,
          favorites: favorites.length
        }}
      />

      {/* Main Content Area */}
      <View style={[styles.mainContent, { flexDirection: width >= 900 ? 'row' : 'column' }]}>
        {activeTab === 'epg' && account ? (
          <EpgGuideView
            account={account}
            channels={liveChannels.length > 0 ? liveChannels : (streams as LiveStream[])}
            categories={liveCategories.length > 0 ? liveCategories : categories}
            epgMap={epgMap}
            onLoadEpg={onLoadEpg}
            onPlayChannel={(channel) => onPressItem(channel, 'live')}
          />
        ) : (
          <>
            {/* Desktop Category Sidebar */}
            {activeTab !== 'favorites' && categories.length > 0 && (
              <CategorySelector
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={onSelectCategory}
                categorySearchQuery={categorySearchQuery}
                onCategorySearchChange={onCategorySearchChange}
                totalCount={streams.length}
              />
            )}

            {/* Stream Grid */}
            <View style={styles.gridContainer}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Caricamento contenuti in corso...</Text>
                </View>
              ) : displayedItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name={activeTab === 'favorites' ? 'star-outline' : 'search-outline'}
                    size={36}
                    color={colors.textMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    {activeTab === 'favorites'
                      ? 'Nessun preferito'
                      : searchQuery
                      ? 'Nessun risultato trovato'
                      : 'Nessun contenuto in questa categoria'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === 'favorites'
                      ? 'Aggiungi canali o film ai tuoi preferiti tramite l\'icona a forma di stella.'
                      : 'Seleziona un\'altra categoria dal menu laterale o modifica la ricerca.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  key={`desktop_grid_${activeTab}_${numColumns}`}
                  data={displayedItems}
                  renderItem={renderStreamItem}
                  keyExtractor={(item, index) => {
                    const id = item.stream_id || item.series_id || item.favId || item.id;
                    return `desktop_${id}_${index}`;
                  }}
                  numColumns={numColumns}
                  style={styles.flatList}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  windowSize={5}
                  initialNumToRender={18}
                  maxToRenderPerBatch={18}
                  removeClippedSubviews={Platform.OS !== 'web'}
                  updateCellsBatchingPeriod={50}
                  ListHeaderComponent={
                    (activeTab === 'vod' || activeTab === 'series') && relevantHistory.length > 0 && onPressHistoryItem && onRemoveHistoryItem ? (
                      <ContinueWatchingRow
                        history={relevantHistory}
                        onPressItem={onPressHistoryItem}
                        onRemoveItem={onRemoveHistoryItem}
                      />
                    ) : undefined
                  }
                />
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%'
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden'
  },
  gridContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background
  },
  flatList: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background
  },
  listContent: {
    padding: 12,
    paddingBottom: 40,
    backgroundColor: colors.background,
    minHeight: '100%'
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 380
  }
});
