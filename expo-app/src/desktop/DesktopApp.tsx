import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { colors } from '../theme/colors';
import {
  Account,
  Category,
  EPGChannelSchedule,
  FavoriteItem,
  LiveStream,
  MediaType,
  NavTab
} from '../types';
import { Header } from '../components/Header';
import { CategorySelector } from '../components/CategorySelector';
import { StreamCard } from '../components/StreamCard';
import { EpgGuideView } from '../components/EpgGuideView';
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
  onToggleMobileMode?: () => void;
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
  onToggleMobileMode
}) => {
  const { width } = useWindowDimensions();

  // Filtered items by search query
  const displayedItems = useMemo(() => {
    if (activeTab === 'favorites') {
      if (!searchQuery) return favorites;
      return favorites.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    if (!searchQuery) return streams;
    const q = searchQuery.toLowerCase();
    return streams.filter(s => {
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
