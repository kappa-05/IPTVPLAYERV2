import { Platform } from 'react-native';
import { Account, Category, LiveStream, MediaType, SeriesDetails, SeriesItem, VodStream } from '../types';
import { M3UParser } from './m3uParser';
import { StorageService } from './storage';

export class XtreamAPI {
  static normalizeHost(host: string): string {
    let clean = (host || '').trim();
    if (!clean) return '';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    try {
      const url = new URL(clean);
      let pathname = url.pathname || '';
      pathname = pathname.replace(/\/(player_api\.php|get\.php|xmltv\.php|c|portal|stalker|client_area)$/i, '');
      pathname = pathname.replace(/\/+$/, '');
      return `${url.protocol}//${url.host}${pathname}`;
    } catch {
      return clean.replace(/\/+$/, '');
    }
  }

  static getProxyUrl(targetUrl: string, useProxy: boolean = true): string {
    let clean = (targetUrl || '').trim();
    while (clean.includes('/api/proxy?url=')) {
      const idx = clean.indexOf('/api/proxy?url=');
      clean = decodeURIComponent(clean.substring(idx + '/api/proxy?url='.length));
    }

    // Auto-rewrite localhost/127.0.0.1 target if accessing from a non-localhost device (e.g. mobile phone or Render)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocalHost) {
        clean = clean.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, window.location.origin);
      }
    }

    if (!useProxy && Platform.OS !== 'web') {
      return clean;
    }

    if (Platform.OS === 'web') {
      const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      const isHttpTarget = clean.startsWith('http://');

      // Always proxy if useProxy is requested OR if the page is on HTTPS and target is HTTP (prevents Safari Mixed Content "Load failed")
      if (useProxy || (isHttpsPage && isHttpTarget)) {
        if (typeof window !== 'undefined' && window.location) {
          return `${window.location.origin}/api/proxy?url=${encodeURIComponent(clean)}`;
        }
        return `/api/proxy?url=${encodeURIComponent(clean)}`;
      }
      return clean;
    }

    return clean;
  }

  static extractDuration(item: any): number {
    if (!item) return 0;
    if (typeof item.duration_secs === 'number' && item.duration_secs > 0) return item.duration_secs;
    if (typeof item.duration_secs === 'string' && !isNaN(Number(item.duration_secs)) && Number(item.duration_secs) > 0) return Number(item.duration_secs);
    if (item.info && typeof item.info.duration_secs === 'number' && item.info.duration_secs > 0) return item.info.duration_secs;
    if (item.info && typeof item.info.duration_secs === 'string' && !isNaN(Number(item.info.duration_secs)) && Number(item.info.duration_secs) > 0) return Number(item.info.duration_secs);

    const durStr = item.duration || item.info?.duration;
    if (typeof durStr === 'string' && durStr.includes(':')) {
      const parts = durStr.trim().split(':').map(Number);
      if (parts.length === 3 && parts.every((p: number) => !isNaN(p))) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2 && parts.every((p: number) => !isNaN(p))) {
        return parts[0] * 60 + parts[1];
      }
    } else if (typeof durStr === 'number' && durStr > 0) {
      return durStr;
    }
    return 0;
  }

  static getHlsUrl(targetUrl: string, itemOrDuration?: any): string {
    const clean = (targetUrl || '').trim();
    let dur = 0;
    if (typeof itemOrDuration === 'number') {
      dur = itemOrDuration;
    } else if (itemOrDuration && typeof itemOrDuration === 'object') {
      dur = this.extractDuration(itemOrDuration);
    }
    const durParam = dur > 0 ? `&duration=${Math.floor(dur)}` : '';
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/api/hls/master.m3u8?url=${encodeURIComponent(clean)}${durParam}`;
    }
    return `/api/hls/master.m3u8?url=${encodeURIComponent(clean)}${durParam}`;
  }

  static async fetchJSON<T = any>(url: string, useProxy: boolean = true, timeoutMs: number = 15000): Promise<T> {
    const finalUrl = this.getProxyUrl(url, useProxy);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(finalUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timer);

      if (!response.ok) {
        let errorDetail = `Errore HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error) errorDetail = errData.error;
          else if (errData?.message) errorDetail = errData.message;
        } catch {}
        throw new Error(errorDetail);
      }

      const data = await response.json();
      return data as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout richiesta (${timeoutMs / 1000}s). Il server non risponde.`);
      }
      throw err;
    }
  }

  // --- XTREAM CODES LOGIN ---
  static async login(host: string, username: string, password: string, useProxy: boolean = true): Promise<Account> {
    const cleanHost = this.normalizeHost(host);
    if (!cleanHost) throw new Error('Inserisci un URL del server valido.');

    const buildUrl = (h: string) => `${h}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const primaryUrl = buildUrl(cleanHost);

    let data: any = null;
    try {
      data = await this.fetchJSON(primaryUrl, useProxy);
    } catch (primaryErr) {
      let altHost = null;
      if (cleanHost.startsWith('http://')) {
        altHost = cleanHost.replace('http://', 'https://');
      } else if (cleanHost.startsWith('https://')) {
        altHost = cleanHost.replace('https://', 'http://');
      }

      if (altHost) {
        try {
          data = await this.fetchJSON(buildUrl(altHost), useProxy);
          return this.parseLoginResponse(data, altHost, username, password, useProxy);
        } catch {}
      }
      throw primaryErr;
    }

    return this.parseLoginResponse(data, cleanHost, username, password, useProxy);
  }

  private static parseLoginResponse(data: any, host: string, username: string, password: string, useProxy: boolean): Account {
    if (!data || typeof data !== 'object') {
      throw new Error('Risposta del server non valida. Verifica URL e credenziali.');
    }

    const userInfo = data.user_info || data.userInfo;
    if (!userInfo) {
      throw new Error(data.message || 'Dati utente non trovati.');
    }

    const isAuth = userInfo.auth === 1 || userInfo.auth === '1' || userInfo.auth === true || userInfo.status?.toLowerCase() === 'active';
    if (!isAuth) {
      const status = (userInfo.status || '').toLowerCase();
      if (status === 'expired') throw new Error('Account IPTV scaduto.');
      if (status === 'banned' || status === 'disabled') throw new Error('Account disabilitato dal fornitore.');
      throw new Error('Credenziali non valide o accesso non autorizzato.');
    }

    const accountId = `${username}@${new URL(host).hostname}`;
    return {
      id: accountId,
      name: userInfo.message || username,
      accountType: 'xtream',
      host,
      username,
      password,
      useProxy,
      expDate: userInfo.exp_date ? String(userInfo.exp_date) : undefined,
      isTrial: userInfo.is_trial,
      activeCons: userInfo.active_cons,
      maxCons: userInfo.max_connections,
      status: userInfo.status,
      createdAt: Date.now()
    };
  }

  // --- M3U PLAYLIST LOADER ---
  static async loadM3U(url: string, name?: string, useProxy: boolean = true): Promise<Account> {
    const cleanUrl = url.trim();
    if (!cleanUrl) throw new Error('Inserisci un URL M3U valido.');

    const finalUrl = this.getProxyUrl(cleanUrl, useProxy);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    let text = '';
    try {
      const response = await fetch(finalUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`Errore caricamento M3U: HTTP ${response.status}`);
      }
      text = await response.text();
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(err.message || 'Impossibile scaricare la playlist M3U.');
    }

    if (!text || (!text.includes('#EXTM3U') && !text.includes('#EXTINF'))) {
      throw new Error('Il link fornito non contiene una playlist M3U valida (#EXTM3U mancante).');
    }

    const parsed = M3UParser.parse(text);

    let playlistName = (name || '').trim();
    if (!playlistName) {
      try {
        const u = new URL(cleanUrl);
        const filename = u.pathname.split('/').pop();
        playlistName = filename && filename.length > 2 ? filename : u.hostname;
      } catch {
        playlistName = 'Playlist M3U';
      }
    }

    const accountId = `m3u_${cleanUrl}`;
    const account: Account = {
      id: accountId,
      name: playlistName,
      accountType: 'm3u',
      m3uUrl: cleanUrl,
      host: cleanUrl,
      username: playlistName,
      useProxy,
      createdAt: Date.now()
    };

    // Cache categories & streams into StorageService
    await StorageService.cacheCategories(accountId, 'live', parsed.liveCategories);
    await StorageService.cacheCategories(accountId, 'vod', parsed.vodCategories);
    await StorageService.cacheCategories(accountId, 'series', parsed.seriesCategories);

    await StorageService.cacheStreams(accountId, 'live', 'all', parsed.liveStreams);
    await StorageService.cacheStreams(accountId, 'vod', 'all', parsed.vodStreams);
    await StorageService.cacheStreams(accountId, 'series', 'all', parsed.seriesStreams);

    // Cache per-category streams for instant filtering
    for (const cat of parsed.liveCategories) {
      const filtered = parsed.liveStreams.filter(s => s.category_id === cat.category_id);
      await StorageService.cacheStreams(accountId, 'live', cat.category_id, filtered);
    }
    for (const cat of parsed.vodCategories) {
      const filtered = parsed.vodStreams.filter(s => s.category_id === cat.category_id);
      await StorageService.cacheStreams(accountId, 'vod', cat.category_id, filtered);
    }
    for (const cat of parsed.seriesCategories) {
      const filtered = parsed.seriesStreams.filter(s => s.category_id === cat.category_id);
      await StorageService.cacheStreams(accountId, 'series', cat.category_id, filtered);
    }

    return account;
  }

  // --- CATEGORIES ---
  static async getCategories(account: Account, type: MediaType): Promise<Category[]> {
    if (account.accountType === 'm3u') {
      const cached = await StorageService.getCachedCategories(account.id, type);
      return cached || [];
    }

    const actionMap = {
      live: 'get_live_categories',
      vod: 'get_vod_categories',
      series: 'get_series_categories'
    };
    const url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password || '')}&action=${actionMap[type]}`;
    const data = await this.fetchJSON<any[]>(url, account.useProxy);
    return Array.isArray(data) ? data : [];
  }

  // --- STREAMS ---
  static async getStreams<T = any>(account: Account, type: MediaType, categoryId?: string): Promise<T[]> {
    if (account.accountType === 'm3u') {
      const targetCat = categoryId || 'all';
      const cached = await StorageService.getCachedStreams(account.id, type, targetCat);
      return (cached || []) as T[];
    }

    const actionMap = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series'
    };
    let url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password || '')}&action=${actionMap[type]}`;
    if (categoryId && categoryId !== 'all') {
      url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    const data = await this.fetchJSON<T[]>(url, account.useProxy);
    return Array.isArray(data) ? data : [];
  }

  static async getSeriesInfo(account: Account, seriesId: string | number): Promise<SeriesDetails> {
    if (account.accountType === 'm3u') {
      // In standalone M3U series, wrap series info from cached item
      const cached = await StorageService.getCachedStreams(account.id, 'series', 'all');
      const item = (cached || []).find((s: any) => s.series_id === seriesId);
      return {
        info: {
          name: item?.name || 'Serie',
          cover: item?.cover,
          plot: 'Riproduzione diretta da playlist M3U.',
          genre: item?.genre || 'Serie TV'
        },
        seasons: [{ id: 1, name: 'Stagione 1', season_number: 1 }],
        episodes: {
          '1': [{
            id: seriesId,
            episode_num: 1,
            title: item?.name || 'Episodio 1',
            direct_source: item?.direct_source
          }]
        }
      };
    }

    const url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password || '')}&action=get_series_info&series_id=${encodeURIComponent(String(seriesId))}`;
    const data = await this.fetchJSON<SeriesDetails>(url, account.useProxy);
    return data;
  }

  static buildStreamUrl(account: Account, item: any, type: MediaType, ext?: string): string {
    // Check if item contains 4K, UHD, HEVC, AC3, EAC3 or DTS flags in title, name, or metadata
    const itemMetaStr = `${item.name || ''} ${item.title || ''} ${item.container_extension || ''}`;
    const is4kOrHevc = /(4k|uhd|hevc|h265|h\.265|hdr|10bit|ac3|eac3|dts)/i.test(itemMetaStr);

    // If the stream object already carries a direct_source (e.g. from M3U playlist)
    if (item.direct_source) {
      if (Platform.OS === 'web') {
        if (type === 'vod' || type === 'series') {
          const isMp4 = item.direct_source.toLowerCase().includes('.mp4');
          const isDirect4k = is4kOrHevc || /(4k|uhd|hevc|h265|h\.265|hdr|10bit|ac3|eac3|dts)/i.test(item.direct_source);
          // If 4K, HEVC, AC3, or non-MP4: route to HLS remuxing to avoid MediaError Code 4
          if (isMp4 && !isDirect4k) {
            return this.getProxyUrl(item.direct_source, true);
          }
          return this.getHlsUrl(item.direct_source, item);
        }
        if (account.useProxy) {
          return this.getProxyUrl(item.direct_source, true);
        }
      }
      return item.direct_source;
    }

    const { host, username, password, useProxy } = account;
    let cleanHost = this.normalizeHost(host);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocalHost) {
        cleanHost = cleanHost.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, window.location.origin);
      }
    }
    const pass = password || '';
    const sid = item.stream_id || item.id;

    let targetUrl = '';
    if (type === 'live') {
      const extension = (ext || 'm3u8').replace(/^\./, '');
      targetUrl = `${cleanHost}/live/${username}/${pass}/${sid}.${extension}`;
    } else if (type === 'vod') {
      const extension = (item.container_extension || ext || 'mp4').replace(/^\./, '').toLowerCase();
      targetUrl = `${cleanHost}/movie/${username}/${pass}/${sid}.${extension}`;
    } else if (type === 'series') {
      const extension = (item.container_extension || ext || 'mp4').replace(/^\./, '').toLowerCase();
      targetUrl = `${cleanHost}/series/${username}/${pass}/${sid}.${extension}`;
    }

    if (Platform.OS === 'web') {
      if (type === 'vod' || type === 'series') {
        const fileExt = (item.container_extension || ext || '').replace(/^\./, '').toLowerCase();
        const isMp4 = fileExt === 'mp4' || targetUrl.toLowerCase().endsWith('.mp4');
        const isTarget4k = is4kOrHevc || /(4k|uhd|hevc|h265|h\.265|hdr|10bit|ac3|eac3|dts)/i.test(targetUrl);

        // If 4K, HEVC, AC3, or non-MP4: route to on-the-fly HLS pipeline to avoid MediaError Code 4
        if (isTarget4k || !isMp4) {
          return this.getHlsUrl(targetUrl, item);
        }
        return this.getProxyUrl(targetUrl, true);
      }

      const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      const isHttpTarget = targetUrl.startsWith('http://');

      if (useProxy || (isHttpsPage && isHttpTarget)) {
        return this.getProxyUrl(targetUrl, true);
      }
    }

    return targetUrl;
  }
}
