/**
 * IPTV Player V2 - Xtream Codes API Client
 * High-performance, resilient client for Xtream Codes servers
 * with automatic CORS proxy wrapping, timeout handling, and smart error recovery.
 */

export class XtreamAPI {
  static normalizeHost(host) {
    let clean = (host || '').trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    // Remove trailing slash
    return clean.replace(/\/+$/, '');
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

  static async fetchJSON(url, useProxy = true, timeoutMs = 12000) {
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
        throw new Error(`Errore HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout richiesta (${timeoutMs / 1000}s). Il server non risponde.`);
      }
      throw err;
    }
  }

  /**
   * Authenticate with Xtream Codes server
   */
  static async login(host, username, password, useProxy = true) {
    const cleanHost = this.normalizeHost(host);
    const url = `${cleanHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    const data = await this.fetchJSON(url, useProxy);

    if (!data || !data.user_info) {
      throw new Error('Risposta del server non valida. Verifica URL e credenziali.');
    }

    const { user_info, server_info } = data;

    if (user_info.auth !== 1) {
      const statusMsg = user_info.status ? ` (Stato: ${user_info.status})` : '';
      throw new Error(`Autenticazione fallita: Credenziali errate o account non attivo${statusMsg}.`);
    }

    // Generate unique account ID
    const accountId = `${encodeURIComponent(cleanHost)}_${encodeURIComponent(username)}`;

    return {
      accountId,
      host: cleanHost,
      username,
      password,
      useProxy,
      userInfo: user_info,
      serverInfo: server_info,
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
}
