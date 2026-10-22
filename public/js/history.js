/**
 * IPTV Player V2 - Watch History & Resume Playback Manager
 * Provides reliable persistent storage for VOD and series playback progress.
 * Stores data per account in LocalStorage.
 */

export class WatchHistoryManager {
  static getStorageKey(accountId) {
    return `iptv_playback_history_${accountId || 'default'}`;
  }

  static getCompletedKey(accountId) {
    return `iptv_completed_${accountId || 'default'}`;
  }

  static getItemId(item, type) {
    if (!item) return '';
    if (type === 'series' || item.episode_num !== undefined || item.season !== undefined) {
      return `episode_${item.id || item.stream_id}`;
    }
    return `vod_${item.stream_id || item.id}`;
  }

  static getHistory(accountId) {
    if (!accountId) return [];
    try {
      const raw = localStorage.getItem(this.getStorageKey(accountId));
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn('Error reading playback history:', e);
      return [];
    }
  }

  static saveProgress(accountId, data) {
    if (!accountId || !data || !data.id) return;
    try {
      const history = this.getHistory(accountId);
      const filtered = history.filter(item => item.id !== data.id);

      // Only add to history if played more than 15s or 2% and not completed
      if (!data.completed && data.currentTime >= 15 && data.percent >= 2) {
        filtered.unshift({
          id: data.id,
          type: data.type, // 'vod' | 'series'
          title: data.title || 'Contenuto',
          subTitle: data.subTitle || '',
          seriesName: data.seriesName || '',
          seasonNum: data.seasonNum || '',
          episodeNum: data.episodeNum || '',
          poster: data.poster || '',
          currentTime: Math.floor(data.currentTime),
          duration: Math.floor(data.duration || 0),
          percent: Math.min(100, Math.max(1, Math.floor(data.percent))),
          updatedAt: Date.now(),
          item: data.item
        });
      }

      // Max 40 entries
      const trimmed = filtered.slice(0, 40);
      localStorage.setItem(this.getStorageKey(accountId), JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Error saving playback progress:', e);
    }
  }

  static getProgress(accountId, itemId) {
    if (!accountId || !itemId) return null;
    const history = this.getHistory(accountId);
    return history.find(item => item.id === itemId) || null;
  }

  static removeItem(accountId, itemId) {
    if (!accountId || !itemId) return;
    try {
      const history = this.getHistory(accountId);
      const filtered = history.filter(item => item.id !== itemId);
      localStorage.setItem(this.getStorageKey(accountId), JSON.stringify(filtered));
    } catch (e) {
      console.warn('Error removing history item:', e);
    }
  }

  static clearHistory(accountId) {
    if (!accountId) return;
    try {
      localStorage.removeItem(this.getStorageKey(accountId));
    } catch (e) {
      console.warn('Error clearing history:', e);
    }
  }

  static markCompleted(accountId, itemId) {
    if (!accountId || !itemId) return;
    this.removeItem(accountId, itemId);
    try {
      const compKey = this.getCompletedKey(accountId);
      const raw = localStorage.getItem(compKey);
      const set = raw ? JSON.parse(raw) : [];
      if (!set.includes(itemId)) {
        set.push(itemId);
        localStorage.setItem(compKey, JSON.stringify(set.slice(-300)));
      }
    } catch (e) {
      console.warn('Error marking item completed:', e);
    }
  }

  static isCompleted(accountId, itemId) {
    if (!accountId || !itemId) return false;
    try {
      const compKey = this.getCompletedKey(accountId);
      const raw = localStorage.getItem(compKey);
      if (!raw) return false;
      const list = JSON.parse(raw);
      return Array.isArray(list) && list.includes(itemId);
    } catch (e) {
      return false;
    }
  }

  static formatRemaining(duration, current) {
    if (!duration || duration <= 0) return '';
    const rem = Math.max(0, duration - current);
    const mins = Math.round(rem / 60);
    if (mins < 1) return 'Meno di 1 min';
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${hrs}h ${m}m rim.` : `${hrs}h rim.`;
    }
    return `${mins} min rim.`;
  }
}
