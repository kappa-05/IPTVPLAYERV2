import React, { useState, useMemo, useCallback } from 'react';
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
import { MobileHeader } from './components/MobileHeader';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileLiveItem } from './components/MobileLiveItem';
import { MobileVodCard } from './components/MobileVodCard';
import { MobileCategorySheet } from './components/MobileCategorySheet';
import { MobileAccountSheet } from './components/MobileAccountSheet';
import { MobileEpgView } from './components/MobileEpgView';
import { ContinueWatchingRow } from '../components/ContinueWatchingRow';
import { Ionicons } from '@expo/vector-icons';

interface MobileAppProps {
  account: Account | null;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
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
  onToggleDesktopMode: () => void;
  onOpenInstallPwa?: () => void;
}

export const MobileApp: React.FC<MobileAppProps> = ({
  account,
  activeTab,
  onTabChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
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
  onToggleDesktopMode,
  onOpenInstallPwa
}) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  const [searchQuery, setSearchQuery] = useState('');
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [favFilter, setFavFilter] = useState<'all' | 'live' | 'vod' | 'series'>('all');

  // Filter history relevant to current tab
  const relevantHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (activeTab === 'vod') return history.filter(h => h.type === 'vod');
    if (activeTab === 'series') return history.filter(h => h.type === 'series');
    return [];
  }, [history, activeTab]);

  // Filter items by search and active tab
  const displayedItems = useMemo(() => {
    if (activeTab === 'favorites') {
      let list = favorites;
      if (favFilter !== 'all') {
        list = list.filter(f => (f.type || 'live') === favFilter);
      }
      if (!searchQuery.trim()) return list;
      const q = searchQuery.toLowerCase();
      return list.filter(f => f.title.toLowerCase().includes(q));
    }

    let list = streams;
    // Strict type separation: ensure movies never leak into series tab and vice versa
    if (activeTab === 'series') {
      list = list.filter(s => {
        if (s.stream_type === 'movie' || s.type === 'vod') return false;
        return true;
      });
    } else if (activeTab === 'vod') {
      list = list.filter(s => {
        if (s.series_id && !s.stream_id) return false;
        if (s.stream_type === 'series' || s.type === 'series') return false;
        return true;
      });
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s => {
      const name = (s.name || s.title || '').toLowerCase();
      const sid = String(s.stream_id || s.series_id || '');
      return name.includes(q) || sid.includes(q);
    });
  }, [activeTab, streams, favorites, favFilter, searchQuery]);

  // VOD Columns: 2 on phone, 3 on tablet
  const numVodColumns = isTablet ? 3 : 2;

  // Render Item
  const renderItem = useCallback(({ item }: { item: any }) => {
    const isLive = activeTab === 'live';
    const isVodOrSeries = activeTab === 'vod' || activeTab === 'series';

    if (activeTab === 'favorites') {
      const cardType = (item.type || 'live') as MediaType;
      const cardItem = item.rawItem || item;
      const sid = String(cardItem.stream_id || cardItem.streamId || cardItem.id || '');
      const sched = cardType === 'live' ? epgMap[sid] : null;

      if (cardType === 'live') {
        return (
          <MobileLiveItem
            channel={cardItem as LiveStream}
            isFavorite={true}
            epgSchedule={sched}
            onPress={(ch) => onPressItem(ch, 'live')}
            onToggleFavorite={onToggleFavorite}
            onOpenEpg={onOpenEpgModal}
          />
        );
      }

      return (
        <View style={{ flex: 1 / numVodColumns, paddingHorizontal: 4 }}>
          <MobileVodCard
            item={cardItem}
            type={cardType}
            isFavorite={true}
            onPress={(it) => onPressItem(it, cardType)}
            onToggleFavorite={onToggleFavorite}
          />
        </View>
      );
    }

    if (isLive) {
      const ch = item as LiveStream;
      const sid = String(ch.stream_id);
      const isFav = favorites.some(f => String(f.streamId) === sid);
      const sched = epgMap[sid];

      return (
        <MobileLiveItem
          channel={ch}
          isFavorite={isFav}
          epgSchedule={sched}
          onPress={(c) => onPressItem(c, 'live')}
          onToggleFavorite={onToggleFavorite}
          onOpenEpg={onOpenEpgModal}
        />
      );
    }

    if (isVodOrSeries) {
      const isFav = favorites.some(f => String(f.streamId) === String(item.stream_id || item.series_id || item.id));
      return (
        <View style={{ flex: 1 / numVodColumns, paddingHorizontal: 4 }}>
          <MobileVodCard
            item={item}
            type={activeTab as MediaType}
            isFavorite={isFav}
            onPress={(it) => onPressItem(it, activeTab as MediaType)}
            onToggleFavorite={onToggleFavorite}
          />
        </View>
      );
    }

    return null;
  }, [activeTab, favorites, epgMap, numVodColumns, onPressItem, onToggleFavorite, onOpenEpgModal]);

  return (
    <View style={styles.root}>
      {/* Mobile Top Header */}
      <MobileHeader
        activeTab={activeTab}
        account={account}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={onSelectCategory}
        onOpenCategorySheet={() => setCategorySheetVisible(true)}
        onOpenAccountSheet={() => setAccountSheetVisible(true)}
        onRefresh={onRefresh}
        totalCount={streams.length}
      />

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {activeTab === 'epg' && account ? (
          <MobileEpgView
            account={account}
            channels={liveChannels.length > 0 ? liveChannels : (streams as LiveStream[])}
            categories={liveCategories.length > 0 ? liveCategories : categories}
            epgMap={epgMap}
            onLoadEpg={onLoadEpg}
            onPlayChannel={(ch) => onPressItem(ch, 'live')}
          />
        ) : loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Caricamento contenuti...</Text>
          </View>
        ) : displayedItems.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons
              name={activeTab === 'favorites' ? 'star-outline' : 'search-outline'}
              size={34}
              color={colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {activeTab === 'favorites'
                ? 'Nessun preferito'
                : searchQuery
                ? 'Nessun risultato trovato'
                : 'Nessun contenuto disponibile'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'favorites'
                ? 'Aggiungi i tuoi canali o film preferiti cliccando sull\'icona a forma di stella.'
                : 'Prova a selezionare una categoria diversa o verifica la playlist.'}
            </Text>
          </View>
        ) : (
          <FlatList
            key={`mobile_grid_${activeTab}_${activeTab === 'live' ? '1' : numVodColumns}`}
            data={displayedItems}
            renderItem={renderItem}
            keyExtractor={(item, index) => {
              const id = item.stream_id || item.series_id || item.favId || item.id;
              return `mobile_${id}_${index}`;
            }}
            numColumns={activeTab === 'live' ? 1 : numVodColumns}
            style={styles.flatList}
            contentContainerStyle={[
              styles.listContent,
              (activeTab === 'vod' || activeTab === 'series') && styles.gridPadding
            ]}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
            windowSize={7}
            maxToRenderPerBatch={10}
            initialNumToRender={12}
            removeClippedSubviews={Platform.OS !== 'web'}
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

      {/* Mobile Sticky Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(newTab) => {
          setSearchQuery('');
          onTabChange(newTab);
        }}
        favoritesCount={favorites.length}
      />

      {/* Mobile Category Bottom Sheet */}
      <MobileCategorySheet
        visible={categorySheetVisible}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        totalCount={streams.length}
        onSelectCategory={onSelectCategory}
        onClose={() => setCategorySheetVisible(false)}
      />

      {/* Mobile Account Profile Sheet */}
      <MobileAccountSheet
        visible={accountSheetVisible}
        account={account}
        onClose={() => setAccountSheetVisible(false)}
        onOpenLogin={onOpenLogin}
        onRefresh={onRefresh}
        onToggleDesktopMode={onToggleDesktopMode}
        onLogout={onLogout}
        onOpenInstallPwa={onOpenInstallPwa}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden'
  },
  contentArea: {
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
    paddingVertical: 10,
    paddingBottom: 24,
    backgroundColor: colors.background,
    minHeight: '100%'
  },
  gridPadding: {
    paddingHorizontal: 8
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    backgroundColor: colors.background
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4
  }
});
