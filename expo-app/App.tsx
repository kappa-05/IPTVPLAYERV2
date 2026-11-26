import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  SeriesItem,
  VodStream,
  WatchHistoryItem
} from './src/types';
import { XtreamAPI } from './src/services/api';
import { StorageService } from './src/services/storage';
import { EPGService } from './src/services/epgService';
import { NewContentService } from './src/services/NewContentService';

// Dedicated Desktop and Mobile UI Shells
import { DesktopApp } from './src/desktop/DesktopApp';
import { MobileApp } from './src/mobile/MobileApp';

// Global Shared Modals
import { LoginModal } from './src/components/LoginModal';
import { ContentDetailsScreen } from './src/components/ContentDetailsScreen';
import { UniversalVideoPlayer } from './src/components/UniversalVideoPlayer';
import { EpgModal } from './src/components/EpgModal';
import { PwaInstallModal } from './src/components/PwaInstallModal';
import { PwaInstallService } from './src/services/pwa';

export default function App() {
  const { width } = useWindowDimensions();

  // Device Mode: 'auto' | 'mobile' | 'desktop'
  const [deviceMode, setDeviceMode] = useState<'auto' | 'mobile' | 'desktop'>('auto');
  const [pwaModalVisible, setPwaModalVisible] = useState(false);

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
  const [activeTab, setActiveTab] = useState<NavTab>('home');
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
  const [homeVod, setHomeVod] = useState<any[]>([]);
  const [homeSeries, setHomeSeries] = useState<any[]>([]);
  const [newContent, setNewContent] = useState<any[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeCatalogAccountId, setHomeCatalogAccountId] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // A late response must never overwrite the screen the user has already moved to.
  const contentRequestId = useRef(0);
  const homeRequestId = useRef(0);

  // Modals & Playback State
  const [playingStream, setPlayingStream] = useState<PlayingStream | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [selectedVod, setSelectedVod] = useState<VodStream | null>(null);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);

  // EPG / TV Guide State
  const [epgMap, setEpgMap] = useState<Record<string, EPGChannelSchedule>>({});
  const [selectedEpgSchedule, setSelectedEpgSchedule] = useState<EPGChannelSchedule | null>(null);
  const [activeEpgStream, setActiveEpgStream] = useState<LiveStream | null>(null);
  const [epgModalVisible, setEpgModalVisible] = useState(false);

  const loadHistory = useCallback(async (accountId: string) => {
    try {
      const h = await StorageService.getHistory(accountId);
      setHistory(h);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

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
        loadHistory(current.id);
        loadCategoriesAndStreams(current, 'live');
        loadHomeCatalog(current);
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

  // Load the complete VOD and series catalogs for the Home dashboard.
  // This uses the existing API and cache without changing playback behavior.
  const loadHomeCatalog = async (targetAccount: Account, forceRefresh: boolean = false) => {
    const requestId = ++homeRequestId.current;
    setHomeLoading(true);
    let catalogFetched = forceRefresh;
    try {
      if (forceRefresh && targetAccount.accountType === 'm3u' && (targetAccount.m3uUrl || targetAccount.host)) {
        await XtreamAPI.loadM3U(targetAccount.m3uUrl || targetAccount.host, targetAccount.name, targetAccount.useProxy);
      }

      const loadType = async (type: MediaType) => {
        let items: any[] | null = null;
        if (!forceRefresh) {
          items = await StorageService.getCachedStreams(targetAccount.id, type, 'all');
        }
        if (!items || items.length === 0) {
          items = await XtreamAPI.getStreams(targetAccount, type);
          catalogFetched = true;
          await StorageService.cacheStreams(targetAccount.id, type, 'all', items);
        }
        return items;
      };

      const [vodItems, seriesItems] = await Promise.all([loadType('vod'), loadType('series')]);
      if (requestId !== homeRequestId.current) return;

      const recentItems = await NewContentService.updateCatalog(
        targetAccount,
        vodItems,
        seriesItems,
        catalogFetched
      );
      setNewContent(recentItems);

      if (requestId !== homeRequestId.current) return;
      setHomeVod(vodItems);
      setHomeSeries(seriesItems);
      setHomeCatalogAccountId(targetAccount.id);
    } catch (e: any) {
      console.warn('Failed to load Home catalog:', e?.message || e);
    } finally {
      if (requestId === homeRequestId.current) {
        setHomeLoading(false);
      }
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

    const requestId = ++contentRequestId.current;
    setContentError(null);
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
      // 2. Fetch Streams for Category
      let streamList: any[] | null = null;
      if (!forceRefresh) {
        streamList = await StorageService.getCachedStreams(targetAccount.id, tab, targetCatId);
      }

      if (!streamList || streamList.length === 0) {
        streamList = await XtreamAPI.getStreams(targetAccount, tab, targetCatId === 'all' ? undefined : targetCatId);
        await StorageService.cacheStreams(targetAccount.id, tab, targetCatId, streamList);
      }
      if (requestId !== contentRequestId.current) return;

      setCategories(cats);
      setSelectedCategoryId(targetCatId);
      setStreams(streamList);

      if (tab === 'live') {
        setLiveCategories(cats);
        if (targetCatId === 'all' || liveChannels.length === 0) {
          setLiveChannels(streamList as LiveStream[]);
        }
      }
    } catch (e: any) {
      console.warn('Failed to load data:', e.message);
      if (requestId === contentRequestId.current) {
        setContentError('Impossibile caricare i contenuti. Verifica la playlist o riprova.');
      }
    } finally {
      if (requestId === contentRequestId.current) {
        setLoading(false);
      }
    }
  };

  const handleGlobalSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length > 0) {
      setActiveTab('search');
    }
  };

  const handleTabChange = async (newTab: NavTab) => {
    setActiveTab(newTab);
    setSearchQuery('');
    setCategorySearchQuery('');
    // Immediately clear state to prevent stale content from previous tab (e.g. movies showing in series tab)
    setStreams([]);
    setCategories([]);
    setSelectedCategoryId('all');

    // Home, Search and Settings are UI-only tabs and do not trigger a media-category request.
    if (newTab === 'home' || newTab === 'search' || newTab === 'settings') {
      if (newTab === 'home' && account && homeCatalogAccountId !== account.id) {
        await loadHomeCatalog(account);
      }
      return;
    }
    if (!account) return;
    if (newTab === 'epg') {
      if (liveChannels.length === 0) {
        await loadCategoriesAndStreams(account, 'live', 'all');
      }
    } else if (newTab === 'favorites') {
      loadFavorites(account.id);
    } else {
      await loadCategoriesAndStreams(account, newTab, 'all');
    }
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
    if (account && activeTab !== 'home' && activeTab !== 'favorites' && activeTab !== 'epg' && activeTab !== 'search' && activeTab !== 'settings') {
      loadCategoriesAndStreams(account, activeTab, catId);
    }
  };

  const handleRefresh = async () => {
    if (!account) return;
    setRefreshing(true);
    await StorageService.clearCache(account.id);
    const targetTab = activeTab === 'epg' || activeTab === 'home' || activeTab === 'search' || activeTab === 'settings' ? 'live' : activeTab;
    await Promise.all([
      loadCategoriesAndStreams(account, targetTab, selectedCategoryId, true),
      loadHomeCatalog(account, true),
      loadFavorites(account.id)
    ]);
    setRefreshing(false);
  };

  const handleLoginSuccess = (newAccount: Account) => {
    setAccount(newAccount);
    loadFavorites(newAccount.id);
    loadHistory(newAccount.id);
    setHomeVod([]);
    setHomeSeries([]);
    setNewContent([]);
    setHomeCatalogAccountId(null);
    const targetTab = activeTab === 'epg' || activeTab === 'home' || activeTab === 'search' || activeTab === 'settings' ? 'live' : activeTab;
    loadCategoriesAndStreams(newAccount, targetTab, undefined, true);
    loadHomeCatalog(newAccount, true);
  };

  const handleLogout = async () => {
    if (account) {
      await StorageService.deleteAccount(account.id);
    }
    setAccount(null);
    setStreams([]);
    setCategories([]);
    setHomeVod([]);
    setHomeSeries([]);
    setNewContent([]);
    setHomeCatalogAccountId(null);
    setLoginModalVisible(true);
  };

  const handleToggleFavorite = async (item: any) => {
    if (!account) return;
    const type: MediaType = activeTab === 'favorites' || activeTab === 'home' || activeTab === 'search' || activeTab === 'settings'
      ? (item.type || 'live')
      : activeTab;
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

  const handlePressItem = (
    item: any,
    typeOverride?: MediaType,
    initialSeekTime?: number
  ) => {
    if (!account) return;
    const raw = item.rawItem || item;
    const currentTab = typeOverride || (activeTab === 'epg' || activeTab === 'settings' || activeTab === 'home' ? 'live' : (activeTab === 'favorites' ? (item.type || 'live') : activeTab));

    // 1. Check if Series
    const isSeries = Boolean(
      typeOverride === 'series' ||
      item.type === 'series' ||
      raw.series_id ||
      (currentTab === 'series')
    );
    if (isSeries) {
      setSelectedSeries(raw as SeriesItem);
      return;
    }

    // 2. Check if Movie / VOD
    const isVod = Boolean(
      typeOverride === 'vod' ||
      item.type === 'vod' ||
      raw.stream_type === 'movie' ||
      raw.container_extension ||
      (typeof raw.direct_source === 'string' && (
        raw.direct_source.includes('/movie/') ||
        raw.direct_source.endsWith('.mp4') ||
        raw.direct_source.endsWith('.mkv') ||
        raw.direct_source.endsWith('.avi')
      )) ||
      (currentTab === 'vod')
    );

    // Apri i dettagli per i normali clic sui film.
    // La cronologia, che passa initialSeekTime, continua invece
    // ad avviare direttamente il video dal punto salvato.
    if (isVod && initialSeekTime === undefined) {
      setSelectedSeries(null);
      setSelectedVod(raw as VodStream);
      return;
    }

    const detectedType: MediaType = isVod ? 'vod' : (currentTab === 'live' ? 'live' : (activeTab === 'epg' ? 'live' : 'live'));
    const isApple = Platform.OS === 'ios' || Platform.OS === 'macos' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Macintosh|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const defaultLiveExt = isApple ? 'm3u8' : 'ts';
    const extension = raw.container_extension || (detectedType === 'live' ? defaultLiveExt : 'mp4');

    const streamUrl = XtreamAPI.buildStreamUrl(
      account,
      raw,
      detectedType,
      extension
    );

    const sid = String(raw.stream_id || raw.id || item.streamId || '');
    const epg = epgMap[sid];
    const subTitle = (detectedType === 'live' && epg?.current)
      ? `${epg.current.title} (${epg.current.start} - ${epg.current.end})`
      : undefined;

    setIsMiniPlayer(false);
    setPlayingStream({
      streamId: sid,
      title: raw.name || raw.title || item.title || 'Contenuto',
      subTitle,
      type: detectedType,
      streamUrl,
      poster: raw.stream_icon || raw.cover || item.icon,
      extension,
      rawItem: raw,
      initialSeekTime
    });
  };

  const handlePlayVod = (item: VodStream, initialSeekTime?: number) => {
    if (!account) return;

    const extension = item.container_extension || 'mp4';
    const streamUrl = XtreamAPI.buildStreamUrl(
      account,
      item,
      'vod',
      extension
    );

    setIsMiniPlayer(false);
    setPlayingStream({
      streamId: String(item.stream_id),
      title: item.name || 'Film',
      type: 'vod',
      streamUrl,
      poster: item.stream_icon,
      extension,
      rawItem: item,
      initialSeekTime
    });
  };

  const handleToggleContentFavorite = async (
    item: any,
    type: MediaType
  ) => {
    if (!account) return;
    await StorageService.toggleFavorite(account.id, item, type);
    await loadFavorites(account.id);
  };

  const handlePlaySeriesEpisode = (
    episode: SeriesEpisode,
    seasonNum: number | string,
    seriesName: string,
    cover?: string,
    initialSeekTime?: number
  ) => {
    if (!account) return;

    // Chiudi il pannello serie prima di avviare l'episodio.
    setSelectedSeries(null);
    const streamUrl = XtreamAPI.buildStreamUrl(
      account,
      episode,
      'series',
      episode.container_extension || 'mp4'
    );

    setIsMiniPlayer(false);
    setPlayingStream({
      streamId: episode.id,
      title: episode.title || `Episodio ${episode.episode_num}`,
      subTitle: `${seriesName} • Stagione ${seasonNum}`,
      type: 'series',
      streamUrl,
      poster: cover,
      rawItem: episode,
      initialSeekTime,
      seriesName,
      seasonNum,
      episodeNum: episode.episode_num
    });
  };

  const handlePressHistoryItem = useCallback((hItem: WatchHistoryItem) => {
    if (!account) return;
    if (hItem.type === 'series') {
      if (hItem.rawItem) {
        handlePlaySeriesEpisode(
          hItem.rawItem,
          hItem.seasonNum || 1,
          hItem.seriesName || hItem.title,
          hItem.poster,
          hItem.currentTime
        );
      }
    } else {
      const vodRaw = hItem.rawItem || {
        stream_id: hItem.id,
        name: hItem.title,
        stream_icon: hItem.poster,
        stream_type: 'movie',
        container_extension: 'mp4'
      };
      setSelectedSeries(null);
      setSelectedVod(vodRaw as VodStream);
    }
  }, [account]);

  const handleRemoveHistoryItem = useCallback(async (id: string) => {
    if (!account) return;
    await StorageService.removeHistoryItem(account.id, id);
    loadHistory(account.id);
  }, [account, loadHistory]);

  const handleOpenInstallPwa = useCallback(async () => {
    const res = await PwaInstallService.promptInstall();
    if (res === 'ios_guide' || !PwaInstallService.canInstall()) {
      setPwaModalVisible(true);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Render Dedicated UI: Mobile or Desktop */}
      {activeMode === 'mobile' ? (
        <MobileApp
          account={account}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          deviceMode={deviceMode}
          onSetDeviceMode={handleSetDeviceMode}
          searchQuery={searchQuery}
          onSearchChange={handleGlobalSearchChange}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          streams={streams}
          liveChannels={liveChannels}
          liveCategories={liveCategories}
          favorites={favorites}
          history={history}
          homeVod={homeVod}
          homeSeries={homeSeries}
          newContent={newContent}
          homeLoading={homeLoading}
          onPressHistoryItem={handlePressHistoryItem}
          onRemoveHistoryItem={handleRemoveHistoryItem}
          epgMap={epgMap}
          loading={loading}
          contentError={contentError}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onPressItem={handlePressItem}
          onToggleFavorite={handleToggleFavorite}
          onOpenEpgModal={handleOpenEpg}
          onLoadEpg={handleLoadEpg}
          onOpenLogin={() => setLoginModalVisible(true)}
          onLogout={handleLogout}
          onToggleDesktopMode={() => handleSetDeviceMode('desktop')}
          onOpenInstallPwa={handleOpenInstallPwa}
        />
      ) : (
        <DesktopApp
          account={account}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          deviceMode={deviceMode}
          onSetDeviceMode={handleSetDeviceMode}
          searchQuery={searchQuery}
          onSearchChange={handleGlobalSearchChange}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          categorySearchQuery={categorySearchQuery}
          onCategorySearchChange={setCategorySearchQuery}
          streams={streams}
          liveChannels={liveChannels}
          liveCategories={liveCategories}
          favorites={favorites}
          history={history}
          homeVod={homeVod}
          homeSeries={homeSeries}
          newContent={newContent}
          homeLoading={homeLoading}
          onPressHistoryItem={handlePressHistoryItem}
          onRemoveHistoryItem={handleRemoveHistoryItem}
          epgMap={epgMap}
          loading={loading}
          contentError={contentError}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onPressItem={handlePressItem}
          onToggleFavorite={handleToggleFavorite}
          onOpenEpgModal={handleOpenEpg}
          onLoadEpg={handleLoadEpg}
          onOpenLogin={() => setLoginModalVisible(true)}
          onLogout={handleLogout}
          onToggleMobileMode={() => handleSetDeviceMode('mobile')}
          onOpenInstallPwa={handleOpenInstallPwa}
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

      <ContentDetailsScreen
        account={account}
        vodItem={selectedVod}
        seriesItem={selectedSeries}
        resumeTime={
          selectedVod
            ? history.find(h =>
                h.type === 'vod' &&
                String(h.id) === String(selectedVod.stream_id) &&
                h.currentTime > 15 &&
                h.duration > 0 &&
                h.currentTime < h.duration - 30
              )?.currentTime
            : undefined
        }
        resumePercent={
          selectedVod
            ? history.find(h =>
                h.type === 'vod' &&
                String(h.id) === String(selectedVod.stream_id) &&
                h.currentTime > 15 &&
                h.duration > 0 &&
                h.currentTime < h.duration - 30
              )?.percent
            : undefined
        }
        isFavorite={Boolean(
          selectedVod
            ? favorites.some(f => String(f.streamId) === String(selectedVod.stream_id))
            : selectedSeries
              ? favorites.some(f => String(f.streamId) === String(selectedSeries.series_id))
              : false
        )}
        onClose={() => {
          setSelectedVod(null);
          setSelectedSeries(null);
        }}
        onToggleFavorite={handleToggleContentFavorite}
        onPlayVod={handlePlayVod}
        onPlayEpisode={handlePlaySeriesEpisode}
      />

      <UniversalVideoPlayer
        visible={!!playingStream}
        stream={playingStream}
        account={account}
        isMinimized={isMiniPlayer}
        onToggleMinimize={() => setIsMiniPlayer((prev) => !prev)}
        onWatchProgressUpdated={async () => {
          if (account) {
            await loadHistory(account.id);
          }
        }}
        onClose={() => {
          setPlayingStream(null);
          setIsMiniPlayer(false);
          if (account) {
            loadHistory(account.id);
          }
        }}
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

      <PwaInstallModal
        visible={pwaModalVisible}
        onClose={() => setPwaModalVisible(false)}
        isIOS={PwaInstallService.isIOS()}
        onInstallNative={() => PwaInstallService.promptInstall()}
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
