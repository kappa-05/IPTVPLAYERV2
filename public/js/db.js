/**
 * IPTV Player V2 - IndexedDB Storage Manager
 * Ultra-fast persistent client-side storage for accounts, categories,
 * streams cache, and favorites.
 */

const DB_NAME = 'IPTVPlayerV2_DB';
const DB_VERSION = 1;

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Accounts store
        if (!db.objectStoreNames.contains('accounts')) {
          db.createObjectStore('accounts', { keyPath: 'id' });
        }

        // Categories cache store: { id: `${accountId}_${type}`, data, timestamp }
        if (!db.objectStoreNames.contains('categories_cache')) {
          db.createObjectStore('categories_cache', { keyPath: 'id' });
        }

        // Streams cache store: { id: `${accountId}_${type}_${catId}`, data, timestamp }
        if (!db.objectStoreNames.contains('streams_cache')) {
          db.createObjectStore('streams_cache', { keyPath: 'id' });
        }

        // Favorites store: { favId: `${accountId}_${type}_${streamId}`, ... }
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'favId' });
          favStore.createIndex('accountId', 'accountId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB init error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ready() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  // --- ACCOUNTS MANAGEMENT ---
  async saveAccount(account) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const req = store.put(account);
      req.onsuccess = () => resolve(account);
      req.onerror = () => reject(req.error);
    });
  }

  async getAccounts() {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readonly');
      const store = tx.objectStore('accounts');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteAccount(id) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- CATEGORIES CACHE ---
  async cacheCategories(accountId, type, categories) {
    const db = await this.ready();
    const id = `${accountId}_${type}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('categories_cache', 'readwrite');
      const store = tx.objectStore('categories_cache');
      const req = store.put({
        id,
        accountId,
        type,
        categories,
        timestamp: Date.now()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getCachedCategories(accountId, type, maxAgeMs = 3600000 * 12) { // 12 hours TTL
    const db = await this.ready();
    const id = `${accountId}_${type}`;
    return new Promise((resolve) => {
      const tx = db.transaction('categories_cache', 'readonly');
      const store = tx.objectStore('categories_cache');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item && (Date.now() - item.timestamp < maxAgeMs)) {
          resolve(item.categories);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  // --- STREAMS CACHE ---
  async cacheStreams(accountId, type, catId, streams) {
    const db = await this.ready();
    const id = `${accountId}_${type}_${catId || 'all'}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('streams_cache', 'readwrite');
      const store = tx.objectStore('streams_cache');
      const req = store.put({
        id,
        accountId,
        type,
        catId: catId || 'all',
        streams,
        timestamp: Date.now()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getCachedStreams(accountId, type, catId, maxAgeMs = 3600000 * 6) { // 6 hours TTL
    const db = await this.ready();
    const id = `${accountId}_${type}_${catId || 'all'}`;
    return new Promise((resolve) => {
      const tx = db.transaction('streams_cache', 'readonly');
      const store = tx.objectStore('streams_cache');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item && (Date.now() - item.timestamp < maxAgeMs)) {
          resolve(item.streams);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  // --- FAVORITES ---
  async toggleFavorite(accountId, type, item) {
    const db = await this.ready();
    const streamId = item.stream_id || item.series_id;
    const favId = `${accountId}_${type}_${streamId}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('favorites', 'readwrite');
      const store = tx.objectStore('favorites');
      const getReq = store.get(favId);

      getReq.onsuccess = () => {
        if (getReq.result) {
          // Remove from favorites
          store.delete(favId);
          resolve({ isFavorite: false, favId });
        } else {
          // Add to favorites
          store.put({
            favId,
            accountId,
            type,
            streamId,
            item,
            addedAt: Date.now()
          });
          resolve({ isFavorite: true, favId });
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async getFavorites(accountId, type = null) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('favorites', 'readonly');
      const store = tx.objectStore('favorites');
      const index = store.index('accountId');
      const req = index.getAll(accountId);

      req.onsuccess = () => {
        let results = req.result || [];
        if (type) {
          results = results.filter(f => f.type === type);
        }
        resolve(results.map(f => f.item));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async isFavorite(accountId, type, streamId) {
    const db = await this.ready();
    const favId = `${accountId}_${type}_${streamId}`;
    return new Promise((resolve) => {
      const tx = db.transaction('favorites', 'readonly');
      const store = tx.objectStore('favorites');
      const req = store.get(favId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  }

  // Clear caches for refresh
  async clearAccountCaches(accountId) {
    const db = await this.ready();
    const tx = db.transaction(['categories_cache', 'streams_cache'], 'readwrite');
    const catStore = tx.objectStore('categories_cache');
    const streamStore = tx.objectStore('streams_cache');

    catStore.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.accountId === accountId) cursor.delete();
        cursor.continue();
      }
    };

    streamStore.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.accountId === accountId) cursor.delete();
        cursor.continue();
      }
    };
  }
}

export const dbManager = new DatabaseManager();
