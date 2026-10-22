/**
 * IPTV Player V2 - Xtream Codes API Client
 * High-performance, resilient client for Xtream Codes servers
 * with automatic CORS proxy wrapping, timeout handling, and smart error recovery.
 */

export class XtreamAPI {
  static normalizeHost(host) {
    let clean = (host || '').trim();
    if (!clean) return '';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    try {
      const parsed = new URL(clean);
      let pathname = parsed.pathname || '';
      // Strip any API, script, or portal suffix like /player_api.php, /get.php, /c, /portal
      pathname = pathname.replace(/\/(player_api\.php|get\.php|xmltv\.php|c|portal|stalker|client_area)$/i, '');
      pathname = pathname.replace(/\/+$/, '');
      return `${parsed.protocol}//${parsed.host}${pathname}`;
    } catch {
      return clean.replace(/\/+$/, '');
    }
  }

  static getProxyUrl(targetUrl, useProxy = true) {
    if (!useProxy) return targetUrl;
    // When served by server.py (locally or on cloud like Render/Railway), use the internal proxy
    const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStaticHost) {
      return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    // Fallback public CORS proxy if running statically without server.py
    return `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  }

  static async fetchJSON(url, useProxy = true, timeoutMs = 15000) {
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
        let errorDetail = `Errore HTTP ${response.status}: ${response.statusText || 'Errore del server'}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorDetail = errData.error;
          } else if (errData && errData.message) {
            errorDetail = errData.message;
          }
        } catch (_) {
          // Response is not JSON
        }
        throw new Error(errorDetail);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error('Risposta del server non in formato JSON valido. Verifica che l\'indirizzo sia un server Xtream Codes.');
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout richiesta (${timeoutMs / 1000}s). Il server IPTV non risponde.`);
      }
      throw err;
    }
  }

  /**
   * Authenticate with Xtream Codes server
   */
  static async login(host, username, password, useProxy = true) {
    const cleanHost = this.normalizeHost(host);
    if (!cleanHost) throw new Error('Indirizzo Server URL non valido.');

    const buildUrl = (h) => `${h}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const primaryUrl = buildUrl(cleanHost);

    let data = null;
    let primaryErr = null;

    try {
      data = await this.fetchJSON(primaryUrl, useProxy);
    } catch (err) {
      primaryErr = err;
      // Smart protocol fallback: if http failed, try https; if https failed, try http!
      let altHost = null;
      if (cleanHost.startsWith('http://')) {
        altHost = cleanHost.replace('http://', 'https://');
      } else if (cleanHost.startsWith('https://')) {
        altHost = cleanHost.replace('https://', 'http://');
      }

      if (altHost) {
        try {
          const altUrl = buildUrl(altHost);
          data = await this.fetchJSON(altUrl, useProxy);
          return this.validateAndFormatAccount(data, altHost, username, password, useProxy);
        } catch (_) {
          // Alt failed as well, propagate original error
          throw primaryErr;
        }
      }
      throw primaryErr;
    }

    return this.validateAndFormatAccount(data, cleanHost, username, password, useProxy);
  }

  static validateAndFormatAccount(data, host, username, password, useProxy) {
    if (!data || typeof data !== 'object') {
      throw new Error('Risposta del server non valida. Verifica URL e credenziali.');
    }

    const userInfo = data.user_info || data.userInfo;
    const serverInfo = data.server_info || data.serverInfo || {};

    if (!userInfo) {
      if (data.message) {
        throw new Error(data.message);
      }
      throw new Error('Il server non ha restituito dati utente (user_info mancante). Verifica che sia un server Xtream Codes.');
    }

    const isAuth = userInfo.auth === 1 || 
                   userInfo.auth === '1' || 
                   userInfo.auth === true || 
                   (typeof userInfo.status === 'string' && userInfo.status.toLowerCase() === 'active');

    if (!isAuth) {
      const status = (userInfo.status || '').toLowerCase();
      if (status === 'expired') {
        const expDate = userInfo.exp_date ? new Date(parseInt(userInfo.exp_date) * 1000).toLocaleDateString() : '';
        throw new Error(`Account IPTV scaduto${expDate ? ' in data ' + expDate : ''}. Contatta il tuo fornitore per rinnovare la playlist.`);
      }
      if (status === 'disabled' || status === 'banned') {
        throw new Error('Account IPTV disattivato o bloccato dal fornitore.');
      }
      throw new Error('Autenticazione fallita: Username o Password errati.');
    }

    const accountId = `${encodeURIComponent(host)}_${encodeURIComponent(username)}`;

    return {
      accountId,
      id: accountId,
      host,
      username,
      password,
      useProxy,
      userInfo,
      serverInfo,
      lastLogin: Date.now()
    };
  }

  /**
   * Fetch Category List (Live, VOD, or Series)
   */
  static async getCategories(account, type) {
    let action = '';
    if (type === 'live') action = 'get_live_categories';
    else if (type === 'vod') action = 'get_vod_categories';
    else if (type === 'series') action = 'get_series_categories';
    else throw new Error(`Tipo categoria non valido: ${type}`);

    const url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}&action=${action}`;
    const data = await this.fetchJSON(url, account.useProxy);

    if (!Array.isArray(data)) {
      return [];
    }
    return data;
  }

  /**
   * Fetch Streams by Type and optional Category ID
   * Loading per-category is drastically faster than loading 50,000 items at once!
   */
  static async getStreams(account, type, categoryId = null) {
    let action = '';
    if (type === 'live') action = 'get_live_streams';
    else if (type === 'vod') action = 'get_vod_streams';
    else if (type === 'series') action = 'get_series';
    else throw new Error(`Tipo stream non valido: ${type}`);

    let url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}&action=${action}`;
    if (categoryId && categoryId !== 'all') {
      url += `&category_id=${encodeURIComponent(categoryId)}`;
    }

    const data = await this.fetchJSON(url, account.useProxy, 20000);

    if (!Array.isArray(data)) {
      return [];
    }
    return data;
  }

  /**
   * Fetch TV Series Seasons and Episodes details
   */
  static async getSeriesInfo(account, seriesId) {
    const url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`;
    const data = await this.fetchJSON(url, account.useProxy);
    return data;
  }

  /**
   * Construct playable video stream URL
   * @param {Object} account - Active user account
   * @param {Object} item - Channel or VOD item
   * @param {string} type - 'live' | 'vod' | 'series_episode' | 'series'
   * @param {string} format - 'm3u8' | 'ts' | 'raw'
   */
  static buildStreamUrl(account, item, type, format = 'm3u8') {
    if (!account || !item) return '';

    // If item has direct_source (e.g. demo streams), use it directly
    if (item.direct_source) {
      return item.direct_source;
    }

    const host = account.host;
    const user = encodeURIComponent(account.username);
    const pass = encodeURIComponent(account.password);

    if (type === 'live') {
      const streamId = item.stream_id;
      if (format === 'ts') {
        return `${host}/live/${user}/${pass}/${streamId}.ts`;
      } else if (format === 'raw') {
        return `${host}/${user}/${pass}/${streamId}`;
      }
      return `${host}/live/${user}/${pass}/${streamId}.m3u8`;
    }

    if (type === 'vod') {
      const streamId = item.stream_id;
      const ext = item.container_extension || 'mp4';
      return `${host}/movie/${user}/${pass}/${streamId}.${ext}`;
    }

    if (type === 'series_episode' || type === 'series') {
      const streamId = item.id || item.stream_id;
      const ext = item.container_extension || 'mp4';
      return `${host}/series/${user}/${pass}/${streamId}.${ext}`;
    }

    return '';
  }

  /**
   * Launch external stream directly in VLC Media Player
   */
  static async openVLC(streamUrl) {
    try {
      const res = await fetch(`/api/open_vlc?url=${encodeURIComponent(streamUrl)}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Failed to open VLC:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Query system capabilities (VLC & FFmpeg presence)
   */
  static async checkTools() {
    try {
      const res = await fetch('/api/tools');
      return await res.json();
    } catch (err) {
      return { vlc_available: false, ffmpeg_available: false };
    }
  }
}

