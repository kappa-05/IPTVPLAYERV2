import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
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

// Dedicated Desktop and Mobile UI Shells
import { DesktopApp } from './src/desktop/DesktopApp';
import { MobileApp } from './src/mobile/MobileApp';

// Global Shared Modals
import { LoginModal } from './src/components/LoginModal';
import { SeriesDetailsModal } from './src/components/SeriesDetailsModal';
import { UniversalVideoPlayer } from './src/components/UniversalVideoPlayer';
import { EpgModal } from './src/components/EpgModal';

export default function App() {
  const { width } = useWindowDimensions();

  // Device Mode: 'auto' | 'mobile' | 'desktop'
  const [deviceMode, setDeviceMode] = useState<'auto' | 'mobile' | 'desktop'>('auto');

  // Load saved preference
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('iptv_device_mode');
        if (saved === 'mobile' || saved === 'desktop') {
          setDeviceMode(saved);
        }
      } catch {}
    }
  }, []);

  const handleSetDeviceMode = (mode: 'auto' | 'mobile' | 'desktop') => {
    setDeviceMode(mode);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('iptv_device_mode', mode);
      } catch {}
    }
  };

  // Detect whether device is phone/tablet or desktop
  const isMobileDetected = useMemo(() => {
    if (Platform.OS !== 'web') return true;
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|Tablet/i.test(ua);
      if (isMobileUA) return true;
    }
    return width < 900;
  }, [width]);

  const activeMode: 'mobile' | 'desktop' = deviceMode === 'auto'
    ? (isMobileDetected ? 'mobile' : 'desktop')
    : deviceMode;

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
        loadCategoriesAndStreams(current, 'live');
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
      loadLiveEPGs(streams.slice(0, 30));
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
    catId?: string,
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

      // 1. Fetch Categories
      let cats: Category[] | null = null;
      if (!forceRefresh) {
        cats = await StorageService.getCachedCategories(targetAccount.id, tab);
      }

      if (!cats || cats.length === 0) {
        cats = await XtreamAPI.getCategories(targetAccount, tab);
        await StorageService.cacheCategories(targetAccount.id, tab, cats);
      }
      setCategories(cats);

      // Determine initial category to select:
      // If catId was explicitly provided (e.g. user selected from sheet/sidebar), use it.
      // Otherwise, the user requested that the first category selected is NOT 'all', but the first available category right after it (cats[0])!
      let targetCatId = catId;
      if (!targetCatId) {
        if (cats && cats.length > 0) {
          targetCatId = String(cats[0].category_id);
        } else {
          targetCatId = 'all';
        }
      }
      setSelectedCategoryId(targetCatId);

      // 2. Fetch Streams for Category
      let streamList: any[] | null = null;
      if (!forceRefresh) {
        streamList = await StorageService.getCachedStreams(targetAccount.id, tab, targetCatId);
      }

      if (!streamList || streamList.length === 0) {
        streamList = await XtreamAPI.getStreams(targetAccount, tab, targetCatId === 'all' ? undefined : targetCatId);
        await StorageService.cacheStreams(targetAccount.id, tab, targetCatId, streamList);
      }
      setStreams(streamList);

      if (tab === 'live') {
        setLiveCategories(cats);
        if (targetCatId === 'all' || liveChannels.length === 0) {
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
    setSearchQuery('');
    setCategorySearchQuery('');
    if (!account) return;

    if (newTab === 'epg') {
      if (liveChannels.length === 0) {
        await loadCategoriesAndStreams(account, 'live');
      }
    } else if (newTab === 'favorites') {
      loadFavorites(account.id);
    } else {
      // Automatically selects the first available category after 'all' (cats[0])
      loadCategoriesAndStreams(account, newTab);
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
    loadCategoriesAndStreams(newAccount, targetTab, undefined, true);
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

  const handleLoadEpg = async (channel: LiveStream): Promise<EPGChannelSchedule | null> => {
    if (!account) return null;
    const sid = String(channel.stream_id);
    if (epgMap[sid]) return epgMap[sid];
    const sched = await EPGService.getChannelEPG(account, channel);
    if (sched) {
      setEpgMap(prev => ({ ...prev, [sid]: sched }));
    }
    return sched;
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Render Dedicated UI: Mobile or Desktop */}
      {activeMode === 'mobile' ? (
        <MobileApp
          account={account}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          streams={streams}
          liveChannels={liveChannels}
          liveCategories={liveCategories}
          favorites={favorites}
          epgMap={epgMap}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onPressItem={handlePressItem}
          onToggleFavorite={handleToggleFavorite}
          onOpenEpgModal={handleOpenEpg}
          onLoadEpg={handleLoadEpg}
          onOpenLogin={() => setLoginModalVisible(true)}
          onLogout={handleLogout}
          onToggleDesktopMode={() => handleSetDeviceMode('desktop')}
        />
      ) : (
        <DesktopApp
          account={account}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          categorySearchQuery={categorySearchQuery}
          onCategorySearchChange={setCategorySearchQuery}
          streams={streams}
          liveChannels={liveChannels}
          liveCategories={liveCategories}
          favorites={favorites}
          epgMap={epgMap}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onPressItem={handlePressItem}
          onToggleFavorite={handleToggleFavorite}
          onOpenEpgModal={handleOpenEpg}
          onLoadEpg={handleLoadEpg}
          onOpenLogin={() => setLoginModalVisible(true)}
          onLogout={handleLogout}
          onToggleMobileMode={() => handleSetDeviceMode('mobile')}
        />
      )}

      {/* Shared Modals */}
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

      <SeriesDetailsModal
        visible={!!selectedSeries}
        seriesItem={selectedSeries}
        account={account}
        onClose={() => setSelectedSeries(null)}
        onPlayEpisode={handlePlaySeriesEpisode}
      />

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
    backgroundColor: colors.background,
    width: '100%',
    height: '100%'
  }
});
