import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  SafeAreaView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/theme/colors';
import {
  Account,
  Category,
  EPGChannelSchedule,
  FavoriteItem,
  LiveStream,
  MediaType,
  NavTab,
  PlayingStream,
  SeriesEpisode,
  SeriesItem
} from './src/types';
import { XtreamAPI } from './src/services/api';
import { StorageService } from './src/services/storage';
import { EPGService } from './src/services/epgService';
import { Header } from './src/components/Header';
import { CategorySelector } from './src/components/CategorySelector';
import { StreamCard } from './src/components/StreamCard';
import { LoginModal } from './src/components/LoginModal';
import { SeriesDetailsModal } from './src/components/SeriesDetailsModal';
import { UniversalVideoPlayer } from './src/components/UniversalVideoPlayer';
import { EpgModal } from './src/components/EpgModal';
import { EpgGuideView } from './src/components/EpgGuideView';
import { Ionicons } from '@expo/vector-icons';

export default function App() {
  const { width } = useWindowDimensions();

  // Authentication State
  const [account, setAccount] = useState<Account | null>(null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTab>('live');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [liveChannels, setLiveChannels] = useState<LiveStream[]>([]);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals & Playback State
  const [playingStream, setPlayingStream] = useState<PlayingStream | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);

  // EPG / TV Guide State
  const [epgMap, setEpgMap] = useState<Record<string, EPGChannelSchedule>>({});
  const [selectedEpgSchedule, setSelectedEpgSchedule] = useState<EPGChannelSchedule | null>(null);
  const [activeEpgStream, setActiveEpgStream] = useState<LiveStream | null>(null);
  const [epgModalVisible, setEpgModalVisible] = useState(false);

  // Initial Boot
  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      const activeId = await StorageService.getActiveAccountId();
      const accounts = await StorageService.getAccounts();
      const current = accounts.find(a => a.id === activeId) || accounts[0];

      if (current) {
        // If current account points to localhost and device is remote (e.g. mobile or Render), auto-repair host
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (!isLocal && current.host && (current.host.includes('localhost') || current.host.includes('127.0.0.1'))) {
            current.host = current.host.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, window.location.origin);
            if (current.m3uUrl) {
              current.m3uUrl = current.m3uUrl.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, window.location.origin);
            }
            StorageService.saveAccount(current).catch(() => {});
          }
        }
        setAccount(current);
        loadFavorites(current.id);
        loadCategoriesAndStreams(current, 'live', 'all');
      } else {
        setLoginModalVisible(true);
      }
    } catch (e) {
      console.error('Init error:', e);
      setLoginModalVisible(true);
    }
  };

  const loadFavorites = async (accountId: string) => {
    const favs = await StorageService.getFavorites(accountId);
    setFavorites(favs);
  };

  // Pre-load EPG for visible live channels
  useEffect(() => {
    if (activeTab === 'live' && account && streams.length > 0) {
      loadLiveEPGs(streams.slice(0, 40));
    }
  }, [activeTab, streams, account]);

  const loadLiveEPGs = async (liveList: LiveStream[]) => {
    if (!account) return;
    const updates: Record<string, EPGChannelSchedule> = {};
    for (const st of liveList) {
      const sid = String(st.stream_id);
      if (!epgMap[sid]) {
        try {
          const sched = await EPGService.getChannelEPG(account, st);
          updates[sid] = sched;
        } catch {}
      }
    }
    if (Object.keys(updates).length > 0) {
      setEpgMap(prev => ({ ...prev, ...updates }));
    }
  };

  // Load Categories & Streams when tab or account changes
  const loadCategoriesAndStreams = async (
    targetAccount: Account,
    tab: MediaType | 'favorites',
    catId: string = 'all',
    forceRefresh: boolean = false
  ) => {
    if (tab === 'favorites') {
      loadFavorites(targetAccount.id);
      return;
    }

    setLoading(true);
    try {
      if (forceRefresh && targetAccount.accountType === 'm3u' && (targetAccount.m3uUrl || targetAccount.host)) {
        await XtreamAPI.loadM3U(targetAccount.m3uUrl || targetAccount.host, targetAccount.name, targetAccount.useProxy);
      }

      // 1. Fetch Categories (with cache check)
      let cats: Category[] | null = null;
      if (!forceRefresh) {
        cats = await StorageService.getCachedCategories(targetAccount.id, tab);
      }

      if (!cats || cats.length === 0) {
        cats = await XtreamAPI.getCategories(targetAccount, tab);
        await StorageService.cacheCategories(targetAccount.id, tab, cats);
      }
      setCategories(cats);

      // 2. Fetch Streams for Category (with cache check)
      let streamList: any[] | null = null;
      if (!forceRefresh) {
        streamList = await StorageService.getCachedStreams(targetAccount.id, tab, catId);
      }

      if (!streamList || streamList.length === 0) {
        streamList = await XtreamAPI.getStreams(targetAccount, tab, catId === 'all' ? undefined : catId);
        await StorageService.cacheStreams(targetAccount.id, tab, catId, streamList);
      }
      setStreams(streamList);

      if (tab === 'live') {
        setLiveCategories(cats);
        if (catId === 'all') {
          setLiveChannels(streamList as LiveStream[]);
        }
      }
    } catch (e: any) {
      console.warn('Failed to load data:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = async (newTab: NavTab) => {
    setActiveTab(newTab);
    setSelectedCategoryId('all');
    setSearchQuery('');
    setCategorySearchQuery('');
    if (!account) return;

    if (newTab === 'epg') {
      if (liveChannels.length === 0) {
        await loadCategoriesAndStreams(account, 'live', 'all');
      }
    } else if (newTab === 'favorites') {
      loadFavorites(account.id);
    } else {
      loadCategoriesAndStreams(account, newTab, 'all');
    }
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
    if (account && activeTab !== 'favorites' && activeTab !== 'epg') {
      loadCategoriesAndStreams(account, activeTab, catId);
    }
  };

  const handleRefresh = async () => {
    if (!account) return;
    setRefreshing(true);
    await StorageService.clearCache(account.id);
    const targetTab = activeTab === 'epg' ? 'live' : activeTab;
    await loadCategoriesAndStreams(account, targetTab, selectedCategoryId, true);
    await loadFavorites(account.id);
    setRefreshing(false);
  };

  const handleLoginSuccess = (newAccount: Account) => {
    setAccount(newAccount);
    loadFavorites(newAccount.id);
    const targetTab = activeTab === 'epg' ? 'live' : activeTab;
    loadCategoriesAndStreams(newAccount, targetTab, 'all', true);
  };

  const handleLogout = async () => {
    if (account) {
      await StorageService.deleteAccount(account.id);
    }
    setAccount(null);
    setStreams([]);
    setCategories([]);
    setLoginModalVisible(true);
  };

  const handleToggleFavorite = async (item: any) => {
    if (!account) return;
    const type = activeTab === 'favorites' ? (item.type || 'live') : activeTab;
    await StorageService.toggleFavorite(account.id, item, type);
    await loadFavorites(account.id);
  };

  const handleOpenEpg = async (stream: LiveStream) => {
    if (!account) return;
    setActiveEpgStream(stream);
    const sid = String(stream.stream_id);
    let sched = epgMap[sid];
    if (!sched) {
      sched = await EPGService.getChannelEPG(account, stream);
      setEpgMap(prev => ({ ...prev, [sid]: sched }));
    }
    setSelectedEpgSchedule(sched);
    setEpgModalVisible(true);
  };

  const handlePressItem = (item: any, typeOverride?: MediaType) => {
    if (!account) return;
    const currentTab = typeOverride || (activeTab === 'epg' ? 'live' : activeTab);

    if (currentTab === 'series') {
      setSelectedSeries(item as SeriesItem);
      return;
    }

    if (currentTab === 'favorites') {
      if (item.type === 'series') {
        setSelectedSeries(item.rawItem || item);
        return;
      }
      const streamUrl = XtreamAPI.buildStreamUrl(
        account,
        item.rawItem || item,
        item.type || 'live',
        item.type === 'live' ? 'm3u8' : item.container_extension
      );

      const sid = String(item.streamId);
      const epg = epgMap[sid];
      const subTitle = epg?.current ? `${epg.current.title} (${epg.current.start} - ${epg.current.end})` : undefined;

      setPlayingStream({
        streamId: item.streamId,
        title: item.title,
        subTitle,
        type: item.type,
        streamUrl,
        poster: item.icon,
        rawItem: item.rawItem || item
      });
      return;
    }

    const streamUrl = XtreamAPI.buildStreamUrl(
      account,
      item,
      currentTab as MediaType,
      currentTab === 'live' ? 'm3u8' : item.container_extension
    );

    const sid = String(item.stream_id || item.id);
    const epg = epgMap[sid];
    const subTitle = (currentTab === 'live' && epg?.current)
      ? `${epg.current.title} (${epg.current.start} - ${epg.current.end})`
      : undefined;

    setPlayingStream({
      streamId: sid,
      title: item.name || item.title || 'Contenuto',
      subTitle,
      type: currentTab as MediaType,
      streamUrl,
      poster: item.stream_icon || item.cover,
      rawItem: item
    });
  };

  const handlePlaySeriesEpisode = (
    episode: SeriesEpisode,
    seasonNum: number | string,
    seriesName: string,
    cover?: string
  ) => {
    if (!account) return;
    const streamUrl = XtreamAPI.buildStreamUrl(
      account,
      episode,
      'series',
      episode.container_extension || 'mp4'
    );

    setPlayingStream({
      streamId: episode.id,
      title: episode.title || `Episodio ${episode.episode_num}`,
      subTitle: `${seriesName} • Stagione ${seasonNum}`,
      type: 'series',
      streamUrl,
      poster: cover,
      rawItem: episode
    });
  };

  // Filtered Items (by Search Query)
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

  // Responsive Grid Columns
  const numColumns = useMemo(() => {
    if (activeTab === 'live') {
      if (width >= 1400) return 4;
      if (width >= 960) return 3;
      if (width >= 640) return 2;
      return 1;
    }
    // Posters (VOD & Series)
    if (width >= 1400) return 6;
    if (width >= 1100) return 5;
    if (width >= 800) return 4;
    if (width >= 540) return 3;
    return 2;
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
          onPress={handlePressItem}
          isFavorite={isFav}
          onToggleFavorite={handleToggleFavorite}
          onOpenEpg={cardType === 'live' ? handleOpenEpg : undefined}
          epgSchedule={sched}
        />
      </View>
    );
  }, [activeTab, favorites, numColumns, account, epgMap]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Global Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        account={account}
        onOpenLogin={() => setLoginModalVisible(true)}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        counts={{
          live: activeTab === 'live' ? displayedItems.length : undefined,
          vod: activeTab === 'vod' ? displayedItems.length : undefined,
          series: activeTab === 'series' ? displayedItems.length : undefined,
          favorites: favorites.length
        }}
      />

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {activeTab === 'epg' && account ? (
          <EpgGuideView
            account={account}
            channels={liveChannels.length > 0 ? liveChannels : (streams as LiveStream[])}
            categories={liveCategories.length > 0 ? liveCategories : categories}
            epgMap={epgMap}
            onLoadEpg={async (channel) => {
              const sid = String(channel.stream_id);
              if (epgMap[sid]) return epgMap[sid];
              const sched = await EPGService.getChannelEPG(account, channel);
              setEpgMap(prev => ({ ...prev, [sid]: sched }));
              return sched;
            }}
            onPlayChannel={(channel) => handlePressItem(channel, 'live')}
          />
        ) : (
          <>
            {/* Category Sidebar or Mobile Pills */}
            {activeTab !== 'favorites' && categories.length > 0 && (
              <CategorySelector
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={handleSelectCategory}
                categorySearchQuery={categorySearchQuery}
                onCategorySearchChange={setCategorySearchQuery}
                totalCount={streams.length}
              />
            )}

            {/* Stream List / Grid */}
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
                    size={28}
                    color={colors.textMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    {activeTab === 'favorites'
                      ? 'Nessun preferito'
                      : searchQuery
                      ? 'Nessun risultato'
                      : 'Nessun contenuto'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === 'favorites'
                      ? 'Aggiungi canali o film ai preferiti con la stella.'
                      : 'Seleziona una categoria o modifica la ricerca.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  key={`grid_${activeTab}_${numColumns}`}
                  data={displayedItems}
                  renderItem={renderStreamItem}
                  keyExtractor={(item, index) => {
                    const id = item.stream_id || item.series_id || item.favId || item.id;
                    return `${id}_${index}`;
                  }}
                  numColumns={numColumns}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
              )}
            </View>
          </>
        )}
      </View>

      {/* TV Guide (EPG) Schedule Modal */}
      <EpgModal
        visible={epgModalVisible}
        schedule={selectedEpgSchedule}
        onClose={() => setEpgModalVisible(false)}
        onPlayChannel={() => {
          if (activeEpgStream) {
            handlePressItem(activeEpgStream);
          }
        }}
      />

      {/* Series Details Modal */}
      <SeriesDetailsModal
        visible={!!selectedSeries}
        seriesItem={selectedSeries}
        account={account}
        onClose={() => setSelectedSeries(null)}
        onPlayEpisode={handlePlaySeriesEpisode}
      />

      {/* Universal Video Player Modal */}
      <UniversalVideoPlayer
        visible={!!playingStream}
        stream={playingStream}
        onClose={() => setPlayingStream(null)}
        onOpenEpg={() => {
          if (playingStream?.rawItem) {
            handleOpenEpg(playingStream.rawItem);
          }
        }}
      />

      {/* Login Modal */}
      <LoginModal
        visible={loginModalVisible}
        onClose={() => setLoginModalVisible(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  mainContent: {
    flex: 1,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column'
  },
  gridContainer: {
    flex: 1,
    backgroundColor: colors.background
  },
  listContent: {
    padding: 10,
    paddingBottom: 24
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
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 360
  }
});
