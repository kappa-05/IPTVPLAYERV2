import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, Category, FavoriteItem, MediaType, WatchHistoryItem } from '../types';

const PREFIX = 'iptv_v2_';
const KEYS = {
  ACCOUNTS: `${PREFIX}accounts`,
  ACTIVE_ACCOUNT: `${PREFIX}active_account_id`,
  CATEGORIES_CACHE: (accId: string, type: MediaType) => `${PREFIX}cat_${accId}_${type}`,
  STREAMS_CACHE: (accId: string, type: MediaType, catId: string) => `${PREFIX}str_${accId}_${type}_${catId}`,
  FAVORITES: (accId: string) => `${PREFIX}fav_${accId}`,
  HISTORY: (accId: string) => `${PREFIX}history_${accId}`
};

export class StorageService {
  // --- ACCOUNTS ---
  static async getAccounts(): Promise<Account[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.ACCOUNTS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async saveAccount(account: Account): Promise<void> {
    try {
      const accounts = await this.getAccounts();
      const existingIdx = accounts.findIndex(a => a.id === account.id);
      if (existingIdx >= 0) {
        accounts[existingIdx] = account;
      } else {
        accounts.unshift(account);
      }
      await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(accounts));
      await this.setActiveAccountId(account.id);
    } catch (e) {
      console.error('Failed to save account:', e);
    }
  }

  static async deleteAccount(id: string): Promise<void> {
    try {
      const accounts = await this.getAccounts();
      const filtered = accounts.filter(a => a.id !== id);
      await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(filtered));
      const activeId = await this.getActiveAccountId();
      if (activeId === id) {
        await AsyncStorage.removeItem(KEYS.ACTIVE_ACCOUNT);
      }
    } catch (e) {
      console.error('Failed to delete account:', e);
    }
  }

  static async getActiveAccountId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.ACTIVE_ACCOUNT);
    } catch {
      return null;
    }
  }

  static async setActiveAccountId(id: string): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.ACTIVE_ACCOUNT, id);
    } catch (e) {
      console.error('Failed to set active account:', e);
    }
  }

  // --- CATEGORIES CACHE ---
  static async getCachedCategories(accId: string, type: MediaType): Promise<Category[] | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.CATEGORIES_CACHE(accId, type));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Valid for 24h
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return parsed.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  static async cacheCategories(accId: string, type: MediaType, data: Category[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.CATEGORIES_CACHE(accId, type), JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to cache categories:', e);
    }
  }

  // --- STREAMS CACHE ---
  static async getCachedStreams(accId: string, type: MediaType, catId: string): Promise<any[] | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.STREAMS_CACHE(accId, type, catId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Valid for 6h
      if (Date.now() - parsed.timestamp < 6 * 60 * 60 * 1000) {
        return parsed.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  static async cacheStreams(accId: string, type: MediaType, catId: string, data: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.STREAMS_CACHE(accId, type, catId), JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to cache streams:', e);
    }
  }

  static async clearCache(accId: string): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToDelete = allKeys.filter(k => 
        k.startsWith(`${PREFIX}cat_${accId}`) || k.startsWith(`${PREFIX}str_${accId}`)
      );
      if (keysToDelete.length > 0) {
        await AsyncStorage.multiRemove(keysToDelete);
      }
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  }

  // --- FAVORITES ---
  static async getFavorites(accId: string): Promise<FavoriteItem[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FAVORITES(accId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async isFavorite(accId: string, streamId: string | number, type: MediaType): Promise<boolean> {
    const list = await this.getFavorites(accId);
    return list.some(f => String(f.streamId) === String(streamId) && f.type === type);
  }

  static async toggleFavorite(accId: string, item: any, type: MediaType): Promise<boolean> {
    try {
      const list = await this.getFavorites(accId);
      const streamId = item.stream_id || item.series_id || item.id;
      const title = item.name || item.title || 'Senza titolo';
      const icon = item.stream_icon || item.cover || '';
      const categoryId = item.category_id || '';
      const favId = `${accId}_${type}_${streamId}`;

      const existsIdx = list.findIndex(f => f.favId === favId || (String(f.streamId) === String(streamId) && f.type === type));

      let isNowFav = false;
      if (existsIdx >= 0) {
        list.splice(existsIdx, 1);
        isNowFav = false;
      } else {
        list.unshift({
          favId,
          accountId: accId,
          type,
          streamId,
          title,
          icon,
          categoryId,
          rawItem: item
        });
        isNowFav = true;
      }

      await AsyncStorage.setItem(KEYS.FAVORITES(accId), JSON.stringify(list));
      return isNowFav;
    } catch (e) {
      console.error('Failed to toggle favorite:', e);
      return false;
    }
  }

  // --- HISTORY ---
  static async getHistory(accId: string): Promise<WatchHistoryItem[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.HISTORY(accId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async saveWatchProgress(accId: string, progress: Partial<WatchHistoryItem>): Promise<void> {
    try {
      if (!progress.id) return;
      const history = await this.getHistory(accId);
      const filtered = history.filter(h => h.id !== progress.id);

      filtered.unshift({
        id: progress.id,
        accountId: accId,
        type: progress.type || 'vod',
        title: progress.title || '',
        subTitle: progress.subTitle || '',
        seriesName: progress.seriesName || '',
        seasonNum: progress.seasonNum,
        episodeNum: progress.episodeNum,
        poster: progress.poster || '',
        currentTime: Math.floor(progress.currentTime || 0),
        duration: Math.floor(progress.duration || 0),
        percent: Math.min(100, Math.max(0, Math.floor(progress.percent || 0))),
        updatedAt: Date.now(),
        rawItem: progress.rawItem
      });

      // Keep maximum 50 recent items
      await AsyncStorage.setItem(KEYS.HISTORY(accId), JSON.stringify(filtered.slice(0, 50)));
    } catch (e) {
      console.error('Failed to save watch progress:', e);
    }
  }
}
