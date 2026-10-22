/**
 * IPTV Player V2 - Main Application Orchestrator
 * Connects API, IndexedDB cache, VirtualGrid rendering engine, UI, and VideoPlayer.
 */

import { XtreamAPI } from './api.js?v=3.0';
import { dbManager } from './db.js?v=3.0';
import { VirtualGrid } from './virtualGrid.js?v=3.0';
import { VideoPlayer } from './player.js?v=3.0';
import { UIManager } from './ui.js?v=3.0';
import { WatchHistoryManager } from './history.js?v=3.0';

class IPTVApp {
  constructor() {
    this.currentAccount = null;
    this.currentMode = 'live'; // 'live' | 'vod' | 'series' | 'favorites'
    this.currentCategoryId = 'all';
    this.currentCategoryName = 'Tutti i Canali';

    this.categories = {
      live: [],
      vod: [],
      series: []
    };

    this.activeStreams = [];
    this.filteredStreams = [];
    this.favoritesMap = new Map();

    this.searchQuery = '';
    this.sortMode = 'default'; // 'default' | 'name-asc' | 'name-desc' | 'rating'
    this.viewMode = 'grid'; // 'grid' | 'list'

    this.virtualGrid = null;
    this.player = null;

    this.init();
  }

  async init() {
    // 1. Initialize Player
    this.player = new VideoPlayer();
    this.player.onClose = () => {
      this.renderContinueWatching();
      this.virtualGrid?.refresh();
    };

    // 2. Initialize Virtual Grid
    const gridContainer = document.getElementById('virtual-scroll-container');
    if (gridContainer) {
      this.virtualGrid = new VirtualGrid({
        container: gridContainer,
        cardType: 'live',
        viewMode: 'grid',
        renderItem: (item, index, cardType, viewMode) => this.renderStreamCard(item, index, cardType, viewMode)
      });
    }

    // 3. Bind UI Events
    this.bindLoginEvents();
    this.bindDashboardEvents();

    // 4. Load Saved Accounts
    await this.loadSavedAccounts();

    // 5. Check if previously logged in
    const lastAccountId = localStorage.getItem('iptv_last_account');
    if (lastAccountId) {
      const accounts = await dbManager.getAccounts();
      const lastAcc = accounts.find(a => a.id === lastAccountId);
      if (lastAcc) {
        this.fillLoginForm(lastAcc);
      }
    }
  }

  // =========================================================================
  // AUTHENTICATION & LOGIN FLOW
  // =========================================================================

  bindLoginEvents() {
    const loginForm = document.getElementById('login-form');
    const submitBtn = document.getElementById('login-submit-btn');
    const demoBtn = document.getElementById('demo-account-btn');
    const proxyToggle = document.getElementById('proxy-toggle');
    const togglePassBtn = document.getElementById('toggle-password-btn');
    const hostInput = document.getElementById('login-host');
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const inlineErr = document.getElementById('login-inline-error');

    // Remove error highlight and inline banner as soon as user interacts
    const clearErrors = () => {
      [hostInput, userInput, passInput].forEach(inp => inp?.classList.remove('input-error'));
      if (inlineErr) {
        inlineErr.style.display = 'none';
        inlineErr.textContent = '';
      }
    };

    [hostInput, userInput, passInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', clearErrors);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleLogin();
          }
        });
      }
    });

    // Auto-extract credentials if user pastes a full Xtream / M3U link with credentials
    if (hostInput) {
      const checkAndExtractUrl = () => this.autoExtractCredentials(true);
      hostInput.addEventListener('input', checkAndExtractUrl);
      hostInput.addEventListener('paste', () => setTimeout(checkAndExtractUrl, 50));
    }

    const EYE_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const pInput = document.getElementById('login-password');
        if (pInput) {
          if (pInput.type === 'password') {
            pInput.type = 'text';
            togglePassBtn.innerHTML = EYE_OFF;
          } else {
            pInput.type = 'password';
            togglePassBtn.innerHTML = EYE_OPEN;
          }
        }
      });
    }

    if (demoBtn) {
      demoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        clearErrors();
        const origin = window.location.origin;
        if (hostInput) hostInput.value = `${origin}/api/demo`;
        if (userInput) userInput.value = 'vip_user_2026';
        if (passInput) passInput.value = 'password123';
        if (proxyToggle) proxyToggle.checked = false; // Demo is local
        UIManager.showToast('Profilo Demo Caricato', 'Accesso automatico in corso...', 'info');
        await this.handleLogin();
      });
    }

    let isSubmitting = false;
    const onFormSubmit = async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isSubmitting || this.isLoggingIn) return;
      isSubmitting = true;
      try {
        await this.handleLogin();
      } finally {
        setTimeout(() => { isSubmitting = false; }, 300);
      }
    };

    if (submitBtn) {
      submitBtn.addEventListener('click', onFormSubmit);
    }

    if (loginForm) {
      loginForm.addEventListener('submit', onFormSubmit);
    }
  }

  /**
   * Intelligently parses and extracts host, username, and password from
   * any pasted M3U link, stream link, or query string.
   */
  extractCredentials(val) {
    if (!val || typeof val !== 'string') return null;
    const clean = val.trim();
    if (!clean) return null;

    // Pattern 1: URL with query parameters (username=..., password=... or user=..., pass=... or u=..., p=...)
    const lower = clean.toLowerCase();
    const hasQueryUser = lower.includes('username=') || lower.includes('user=') || lower.includes('?u=') || lower.includes('&u=');
    const hasQueryPass = lower.includes('password=') || lower.includes('pass=') || lower.includes('&p=') || lower.includes('?p=');

    if (hasQueryUser && hasQueryPass) {
      try {
        const urlObj = new URL(clean.startsWith('http://') || clean.startsWith('https://') ? clean : `http://${clean}`);
        const u = urlObj.searchParams.get('username') || urlObj.searchParams.get('user') || urlObj.searchParams.get('u');
        const p = urlObj.searchParams.get('password') || urlObj.searchParams.get('pass') || urlObj.searchParams.get('p');
        if (u && p) {
          let pathname = (urlObj.pathname || '').replace(/\/(get\.php|player_api\.php|xmltv\.php)$/i, '').replace(/\/+$/, '');
          return {
            host: `${urlObj.protocol}//${urlObj.host}${pathname}`,
            username: u,
            password: p
          };
        }
      } catch (_) {}
    }

    // Pattern 2: Stream link with path components: http://host:port/live/username/password/123.ts (or /movie/..., /series/...)
    const streamMatch = clean.match(/^(https?:\/\/[^\/]+)\/(?:live|movie|series)\/([^\/]+)\/([^\/]+)(?:\/.*)?$/i);
    if (streamMatch) {
      return {
        host: streamMatch[1],
        username: streamMatch[2],
        password: streamMatch[3]
      };
    }

    return null;
  }

  autoExtractCredentials(showToast = true) {
    const hostInput = document.getElementById('login-host');
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    if (!hostInput) return;

    const extracted = this.extractCredentials(hostInput.value);
    if (extracted) {
      if (userInput) userInput.value = extracted.username;
      if (passInput) passInput.value = extracted.password;
      hostInput.value = extracted.host;
      if (showToast) {
        UIManager.showToast('Credenziali Rilevate', 'Username, Password e Server estratti automaticamente dal link!', 'success');
      }
      const inlineErr = document.getElementById('login-inline-error');
      if (inlineErr) {
        inlineErr.style.display = 'none';
        inlineErr.textContent = '';
      }
    }
  }

  async loadSavedAccounts() {
    try {
      const accounts = await dbManager.getAccounts();
      const container = document.getElementById('saved-accounts-list');
      if (container) {
        UIManager.renderSavedAccountsList(
          container,
          accounts,
          (selectedAcc) => {
            this.fillLoginForm(selectedAcc);
            UIManager.showToast('Profilo Selezionato', `Profilo ${selectedAcc.username} pronto per l'accesso`, 'info');
          },
          async (accId) => {
            await dbManager.deleteAccount(accId);
            UIManager.showToast('Profilo Rimosso', 'Account eliminato con successo', 'warning');
            await this.loadSavedAccounts();
          }
        );
      }
    } catch (err) {
      console.warn('Error loading saved accounts:', err);
    }
  }

  fillLoginForm(account) {
    document.getElementById('login-host').value = account.host || '';
    document.getElementById('login-username').value = account.username || '';
    document.getElementById('login-password').value = account.password || '';
    const proxyToggle = document.getElementById('proxy-toggle');
    if (proxyToggle) proxyToggle.checked = account.useProxy !== false;
  }

  async handleLogin() {
    if (this.isLoggingIn) return;

    // Automatically extract credentials if full link was entered
    this.autoExtractCredentials(false);

    const hostInput = document.getElementById('login-host');
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const inlineErr = document.getElementById('login-inline-error');
    const submitBtn = document.getElementById('login-submit-btn');

    let host = hostInput ? hostInput.value.trim() : '';
    let username = userInput ? userInput.value.trim() : '';
    let password = passInput ? passInput.value.trim() : '';
    const useProxy = document.getElementById('proxy-toggle')?.checked ?? true;

    // Reset previous errors
    [hostInput, userInput, passInput].forEach(inp => inp?.classList.remove('input-error'));
    if (inlineErr) {
      inlineErr.style.display = 'none';
      inlineErr.textContent = '';
    }

    const showLoginError = (title, msg) => {
      UIManager.showToast(title, msg, 'warning');
      if (inlineErr) {
        inlineErr.textContent = msg;
        inlineErr.style.display = 'flex';
      }
    };

    if (!host) {
      hostInput?.classList.add('input-error');
      hostInput?.focus();
      showLoginError('Server URL Mancante', 'Inserisci l\'indirizzo del tuo server Xtream Codes (es. http://server.com:8080).');
      return;
    }

    if (!username) {
      userInput?.classList.add('input-error');
      userInput?.focus();
      showLoginError('Username Mancante', 'Inserisci il nome utente del tuo account IPTV.');
      return;
    }

    if (!password) {
      passInput?.classList.add('input-error');
      passInput?.focus();
      showLoginError('Password Mancante', 'Inserisci la password del tuo account IPTV.');
      return;
    }

    this.isLoggingIn = true;
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> Connessione in corso...';
      }

      UIManager.showToast('Connessione Xtream', 'Verifica credenziali e stato account...', 'info');

      // 1. Authenticate with server
      const account = await XtreamAPI.login(host, username, password, useProxy);
      account.id = account.accountId;
      this.currentAccount = account;

      // 2. Save account in IndexedDB
      await dbManager.saveAccount(account);
      localStorage.setItem('iptv_last_account', account.id);
      await this.loadSavedAccounts();

      UIManager.showToast('Accesso Riuscito!', `Benvenuto ${username}. Caricamento playlist in corso...`, 'success');

      // 3. Switch to Dashboard
      this.showDashboard();

      // 4. Bootstrap playlist categories in parallel
      await this.loadCategories();

    } catch (err) {
      console.error('Login error:', err);
      const errMsg = err.message || 'Impossibile connettersi al server Xtream Codes. Verifica URL, credenziali e connessione.';
      UIManager.showToast('Errore di Accesso', errMsg, 'error', 7000);
      if (inlineErr) {
        inlineErr.textContent = errMsg;
        inlineErr.style.display = 'flex';
      }
    } finally {
      this.isLoggingIn = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Accedi alla Playlist</span>';
      }
    }
  }

  showDashboard() {
    document.getElementById('login-view').style.display = 'none';
    const dash = document.getElementById('dashboard-view');
    dash.style.display = 'flex';
    dash.classList.add('fade-in');

    // Update account badge
    const uEl = document.getElementById('header-account-user');
    const expEl = document.getElementById('header-account-exp');
    if (uEl) uEl.textContent = this.currentAccount.username;
    if (expEl && this.currentAccount.userInfo?.exp_date) {
      const expDate = new Date(parseInt(this.currentAccount.userInfo.exp_date) * 1000);
      expEl.textContent = `Scade: ${expDate.toLocaleDateString()}`;
    }

    // Render continue watching section
    this.renderContinueWatching();
  }

  logout() {
    this.currentAccount = null;
    this.activeStreams = [];
    this.filteredStreams = [];
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'flex';
    this.loadSavedAccounts();
    UIManager.showToast('Disconnesso', 'Sessione terminata con successo.', 'info');
  }

  // =========================================================================
  // SUPER OPTIMIZED PLAYLIST LOADING & CACHING
  // =========================================================================

  async loadCategories(forceRefresh = false) {
    if (!this.currentAccount) return;
    const accId = this.currentAccount.id;

    try {
      this.setSidebarLoading(true);

      // Fast parallel loading of all 3 categories (Live, VOD, Series)
      const fetchOrCacheCategory = async (type) => {
        if (!forceRefresh) {
          const cached = await dbManager.getCachedCategories(accId, type);
          if (cached && cached.length) return cached;
        }
        const fresh = await XtreamAPI.getCategories(this.currentAccount, type);
        await dbManager.cacheCategories(accId, type, fresh);
        return fresh;
      };

      const [liveCats, vodCats, seriesCats] = await Promise.all([
        fetchOrCacheCategory('live'),
        fetchOrCacheCategory('vod'),
        fetchOrCacheCategory('series')
      ]);

      this.categories.live = liveCats;
      this.categories.vod = vodCats;
      this.categories.series = seriesCats;

      // Update badge counts on top nav tabs
      const liveBadge = document.getElementById('nav-count-live');
      const vodBadge = document.getElementById('nav-count-vod');
      const seriesBadge = document.getElementById('nav-count-series');

      if (liveBadge) liveBadge.textContent = liveCats.length ? `${liveCats.length} cat` : '0';
      if (vodBadge) vodBadge.textContent = vodCats.length ? `${vodCats.length} cat` : '0';
      if (seriesBadge) seriesBadge.textContent = seriesCats.length ? `${seriesCats.length} cat` : '0';

      // Load favorites map
      await this.refreshFavoritesMap();

      // Render categories sidebar for the current active mode
      this.renderSidebarCategories();

      // Auto load first category or all streams
      const firstCat = this.categories[this.currentMode]?.[0];
      if (firstCat) {
        await this.selectCategory(firstCat.category_id, firstCat.category_name);
      } else {
        await this.selectCategory('all', 'Tutti i Canali');
      }

    } catch (err) {
      console.error('Error loading categories:', err);
      UIManager.showToast('Errore Playlist', 'Impossibile caricare le categorie: ' + err.message, 'error');
    } finally {
      this.setSidebarLoading(false);
    }
  }

  async refreshFavoritesMap() {
    if (!this.currentAccount) return;
    const favs = await dbManager.getFavorites(this.currentAccount.id);
    this.favoritesMap.clear();
    favs.forEach(f => {
      const id = f.stream_id || f.series_id;
      this.favoritesMap.set(String(id), true);
    });

    const favBadge = document.getElementById('nav-count-fav');
    if (favBadge) favBadge.textContent = String(favs.length);
  }

  renderSidebarCategories() {
    const container = document.getElementById('categories-list');
    if (!container) return;
    container.innerHTML = '';

    if (this.currentMode === 'favorites') {
      const allFavItem = document.createElement('div');
      allFavItem.className = 'category-item active';
      allFavItem.innerHTML = `
        <span class="category-item-name">Tutti i Preferiti</span>
        <span class="category-item-count">${this.favoritesMap.size}</span>
      `;
      container.appendChild(allFavItem);
      return;
    }

    const cats = this.categories[this.currentMode] || [];
    const filterText = (document.getElementById('category-search-input')?.value || '').toLowerCase();

    // "Tutti" item
    const allItem = document.createElement('div');
    allItem.className = `category-item ${this.currentCategoryId === 'all' ? 'active' : ''}`;
    allItem.innerHTML = `
      <span class="category-item-name">Tutti i Contenuti</span>
      <span class="category-item-count">All</span>
    `;
    allItem.addEventListener('click', () => {
      this.selectCategory('all', 'Tutti i Contenuti');
    });
    container.appendChild(allItem);

    const filteredCats = cats.filter(c => (c.category_name || '').toLowerCase().includes(filterText));

    filteredCats.forEach(cat => {
      const item = document.createElement('div');
      const isSelected = String(this.currentCategoryId) === String(cat.category_id);
      item.className = `category-item ${isSelected ? 'active' : ''}`;
      item.innerHTML = `
        <span class="category-item-name" title="${cat.category_name}">${cat.category_name}</span>
      `;
      item.addEventListener('click', () => {
        this.selectCategory(cat.category_id, cat.category_name);
      });
      container.appendChild(item);
    });
  }

  async selectCategory(catId, catName) {
    this.currentCategoryId = catId;
    this.currentCategoryName = catName;

    // Update active style in sidebar
    const items = document.querySelectorAll('#categories-list .category-item');
    items.forEach(el => el.classList.remove('active'));

    // Update Toolbar Header
    const titleEl = document.getElementById('active-category-title');
    const badgeEl = document.getElementById('active-category-count');
    if (titleEl) titleEl.textContent = catName;
    if (badgeEl) badgeEl.textContent = 'Caricamento...';

    // Clear search
    this.searchQuery = '';
    const searchInput = document.getElementById('stream-search-input');
    if (searchInput) searchInput.value = '';

    await this.loadStreamsForActiveCategory();
  }

  async loadStreamsForActiveCategory(forceRefresh = false) {
    if (!this.currentAccount) return;

    if (this.currentMode === 'favorites') {
      const favs = await dbManager.getFavorites(this.currentAccount.id);
      this.activeStreams = favs;
      this.applyFilterAndSort();
      return;
    }

    const accId = this.currentAccount.id;
    const type = this.currentMode;
    const catId = this.currentCategoryId;

    try {
      this.setGridLoading(true);

      let streams = null;
      if (!forceRefresh) {
        // 1. Check IndexedDB Cache first (Super optimized!)
        streams = await dbManager.getCachedStreams(accId, type, catId);
      }

      if (!streams) {
        // 2. Fetch from Xtream API
        streams = await XtreamAPI.getStreams(this.currentAccount, type, catId);
        // Cache into IndexedDB
        await dbManager.cacheStreams(accId, type, catId, streams);
      }

      this.activeStreams = streams || [];
      this.applyFilterAndSort();

    } catch (err) {
      console.error('Error fetching streams:', err);
      UIManager.showToast('Errore Flussi', 'Impossibile scaricare i flussi: ' + err.message, 'error');
      this.activeStreams = [];
      this.applyFilterAndSort();
    } finally {
      this.setGridLoading(false);
    }
  }

  // =========================================================================
  // FILTERING, SEARCHING & SORTING
  // =========================================================================

  applyFilterAndSort() {
    let list = [...this.activeStreams];

    // Filter by search query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(item => {
        const name = (item.name || item.title || '').toLowerCase();
        const id = String(item.stream_id || item.series_id || '');
        return name.includes(q) || id.includes(q);
      });
    }

    // Sort
    if (this.sortMode === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (this.sortMode === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (this.sortMode === 'rating') {
      list.sort((a, b) => (parseFloat(b.rating || 0) - parseFloat(a.rating || 0)));
    }

    this.filteredStreams = list;

    // Update Counter Badge
    const badgeEl = document.getElementById('active-category-count');
    if (badgeEl) badgeEl.textContent = `${list.length} contenuti`;

    // Render into VirtualGrid
    if (this.virtualGrid) {
      const cardType = this.currentMode === 'favorites' ? 'live' : this.currentMode;
      this.virtualGrid.setCardType(cardType);
      this.virtualGrid.setItems(this.filteredStreams);
    }

    // Handle Empty State
    const emptyState = document.getElementById('empty-state-view');
    if (emptyState) {
      emptyState.style.display = list.length === 0 ? 'flex' : 'none';
    }
  }

  renderStreamCard(item, index, cardType, viewMode) {
    const streamId = item.stream_id || item.series_id;
    const isFav = this.favoritesMap.has(String(streamId));

    if (cardType === 'live') {
      return UIManager.createLiveCard(
        item,
        (selected) => this.playStream(selected, 'live'),
        (selected, type, favBtn) => this.toggleFavorite(selected, type, favBtn),
        isFav,
        viewMode
      );
    } else if (cardType === 'vod') {
      return UIManager.createVodCard(
        item,
        (selected) => this.playStream(selected, 'vod'),
        (selected, type, favBtn) => this.toggleFavorite(selected, type, favBtn),
        isFav,
        (selected) => this.playStreamVlc(selected, 'vod'),
        viewMode,
        this.currentAccount?.id
      );
    } else if (cardType === 'series') {
      return UIManager.createSeriesCard(
        item,
        (selected) => this.openSeries(selected),
        (selected, type, favBtn) => this.toggleFavorite(selected, type, favBtn),
        isFav,
        viewMode
      );
    }

    return document.createElement('div');
  }

  // =========================================================================
  // ACTIONS: PLAYBACK, SERIES MODAL & FAVORITES
  // =========================================================================

  playStream(item, type) {
    if (!this.currentAccount) return;
    const streamUrl = XtreamAPI.buildStreamUrl(this.currentAccount, item, type);
    const title = item.name || 'Stream IPTV';
    this.player.play(streamUrl, title, type, item, this.currentAccount);
  }

  playStreamVlc(item, type) {
    if (!this.currentAccount) return;
    const streamUrl = XtreamAPI.buildStreamUrl(this.currentAccount, item, type);
    UIManager.showToast('VLC Media Player', `Avvio di "${item.name}" in VLC...`, 'info', 2500);
    XtreamAPI.openVLC(streamUrl).then(res => {
      if (res.success) {
        UIManager.showToast('VLC Avviato', `Riproduzione di "${item.name}" avviata in VLC.`, 'success', 3500);
      } else {
        UIManager.showToast('Errore VLC', res.error || 'Impossibile avviare VLC.', 'error', 3500);
      }
    });
  }

  async openSeries(series) {
    if (!this.currentAccount) return;
    try {
      UIManager.showToast('Serie TV', `Caricamento stagioni di "${series.name}"...`, 'info', 2000);
      const seriesDetails = await XtreamAPI.getSeriesInfo(this.currentAccount, series.series_id);
      UIManager.renderSeriesModal(series, seriesDetails, (ep, epTitle) => {
        const streamUrl = XtreamAPI.buildStreamUrl(this.currentAccount, ep, 'series_episode');
        this.player.play(streamUrl, epTitle, 'series', ep, this.currentAccount);
      }, this.currentAccount?.id);
    } catch (err) {
      console.error('Error opening series details:', err);
      UIManager.showToast('Errore Serie', 'Impossibile caricare gli episodi: ' + err.message, 'error');
    }
  }

  async toggleFavorite(item, type, btnEl) {
    if (!this.currentAccount) return;
    try {
      const res = await dbManager.toggleFavorite(this.currentAccount.id, type, item);
      const streamId = String(item.stream_id || item.series_id);

      const starOutline = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
      const starFilled = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="#fbbf24" stroke-width="2" fill="#fbbf24" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

      if (res.isFavorite) {
        this.favoritesMap.set(streamId, true);
        btnEl.classList.add('active');
        btnEl.innerHTML = starFilled;
        UIManager.showToast('Aggiunto ai Preferiti', item.name, 'success', 2000);
      } else {
        this.favoritesMap.delete(streamId);
        btnEl.classList.remove('active');
        btnEl.innerHTML = starOutline;
        UIManager.showToast('Rimosso dai Preferiti', item.name, 'info', 2000);
      }

      await this.refreshFavoritesMap();

      if (this.currentMode === 'favorites') {
        this.applyFilterAndSort();
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  }

  // =========================================================================
  // CONTINUE WATCHING (RESUME PLAYBACK)
  // =========================================================================

  renderContinueWatching() {
    const section = document.getElementById('continue-watching-section');
    const list = document.getElementById('continue-watching-list');
    const badge = document.getElementById('continue-watching-badge');
    if (!section || !list) return;

    if (!this.currentAccount || this.currentMode === 'live') {
      section.style.display = 'none';
      return;
    }

    const history = WatchHistoryManager.getHistory(this.currentAccount.id);
    if (!history || history.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    if (badge) badge.textContent = String(history.length);
    list.innerHTML = '';

    history.forEach(entry => {
      const card = UIManager.createContinueWatchingCard(
        entry,
        (selected) => this.playFromHistory(selected),
        (selected) => {
          WatchHistoryManager.removeItem(this.currentAccount.id, selected.id);
          this.renderContinueWatching();
          this.virtualGrid?.refresh();
        }
      );
      list.appendChild(card);
    });
  }

  playFromHistory(entry) {
    if (!this.currentAccount || !entry || !entry.item) return;
    if (entry.type === 'series') {
      const streamUrl = XtreamAPI.buildStreamUrl(this.currentAccount, entry.item, 'series_episode');
      this.player.play(streamUrl, entry.title, 'series', entry.item, this.currentAccount);
    } else {
      this.playStream(entry.item, 'vod');
    }
  }

  // =========================================================================
  // DASHBOARD EVENT HANDLERS
  // =========================================================================

  bindDashboardEvents() {
    // Mode Switcher Tabs
    const tabs = document.querySelectorAll('.nav-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        const mode = tab.dataset.mode;
        if (mode === this.currentMode) return;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentMode = mode;

        this.renderSidebarCategories();
        this.renderContinueWatching();

        const firstCat = this.categories[mode]?.[0];
        if (firstCat && mode !== 'favorites') {
          await this.selectCategory(firstCat.category_id, firstCat.category_name);
        } else {
          await this.selectCategory('all', mode === 'favorites' ? 'Preferiti' : 'Tutti i Contenuti');
        }
      });
    });

    // Realtime Search (Debounced 150ms)
    const searchInput = document.getElementById('stream-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    let searchDebounce = null;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        this.searchQuery = val;
        if (searchClear) {
          searchClear.classList.toggle('visible', !!val);
        }
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          this.applyFilterAndSort();
        }, 150);
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        this.searchQuery = '';
        searchClear.classList.remove('visible');
        this.applyFilterAndSort();
      });
    }

    // Category Sidebar filter search
    const catSearch = document.getElementById('category-search-input');
    if (catSearch) {
      catSearch.addEventListener('input', () => {
        this.renderSidebarCategories();
      });
    }

    // Sort Dropdown
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortMode = e.target.value;
        this.applyFilterAndSort();
      });
    }

    // View Mode Toggle (Grid vs List)
    const viewGridBtn = document.getElementById('view-grid-btn');
    const viewListBtn = document.getElementById('view-list-btn');

    if (viewGridBtn && viewListBtn) {
      viewGridBtn.addEventListener('click', () => {
        this.viewMode = 'grid';
        viewGridBtn.classList.add('active');
        viewListBtn.classList.remove('active');
        this.virtualGrid.setViewMode('grid');
      });

      viewListBtn.addEventListener('click', () => {
        this.viewMode = 'list';
        viewListBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        this.virtualGrid.setViewMode('list');
      });
    }

    // Clear Continue Watching History
    const clearHistBtn = document.getElementById('btn-clear-history');
    if (clearHistBtn) {
      clearHistBtn.addEventListener('click', () => {
        if (this.currentAccount) {
          WatchHistoryManager.clearHistory(this.currentAccount.id);
          this.renderContinueWatching();
          this.virtualGrid?.refresh();
          UIManager.showToast('Cronologia Svuotata', 'Tutti i progressi di visione sono stati cancellati.', 'info', 2500);
        }
      });
    }

    // Refresh Cache Button
    const refreshBtn = document.getElementById('btn-refresh-cache');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (!this.currentAccount) return;
        UIManager.showToast('Aggiornamento Playlist', 'Svuotamento cache e risincronizzazione con il server...', 'info');
        await dbManager.clearAccountCaches(this.currentAccount.id);
        await this.loadCategories(true);
        UIManager.showToast('Playlist Aggiornata', 'Dati ricaricati con successo dal server!', 'success');
      });
    }

    // Logout Button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  setSidebarLoading(isLoading) {
    const list = document.getElementById('categories-list');
    if (!list) return;
    if (isLoading) {
      list.innerHTML = `
        <div class="skeleton skeleton-category"></div>
        <div class="skeleton skeleton-category"></div>
        <div class="skeleton skeleton-category"></div>
        <div class="skeleton skeleton-category"></div>
        <div class="skeleton skeleton-category"></div>
      `;
    }
  }

  setGridLoading(isLoading) {
    const container = document.getElementById('virtual-scroll-container');
    if (!container) return;
    const emptyState = document.getElementById('empty-state-view');
    if (emptyState) emptyState.style.display = 'none';

    if (isLoading && this.virtualGrid) {
      this.virtualGrid.setItems([]);
    }
  }
}

// Reliable instant bootstrap
function bootstrapApp() {
  if (!(window.iptvApp instanceof IPTVApp)) {
    window.iptvApp = new IPTVApp();
    window.app = window.iptvApp;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
