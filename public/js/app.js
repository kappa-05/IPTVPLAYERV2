/**
 * IPTV Player V2 - Main Application Orchestrator
 * Connects API, IndexedDB cache, VirtualGrid rendering engine, UI, and VideoPlayer.
 */

import { XtreamAPI } from './api.js';
import { dbManager } from './db.js';
import { VirtualGrid } from './virtualGrid.js';
import { VideoPlayer } from './player.js';
import { UIManager } from './ui.js';

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

    // Remove error highlight as soon as the user starts typing
    [hostInput, userInput, passInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => inp.classList.remove('input-error'));
      }
    });

    // Auto-extract credentials if user pastes a full Xtream / M3U link with credentials
    if (hostInput) {
      const checkAndExtractUrl = () => {
        const val = hostInput.value.trim();
        if (val.includes('username=') && val.includes('password=')) {
          try {
            const urlObj = new URL(val.startsWith('http') ? val : `http://${val}`);
            const u = urlObj.searchParams.get('username');
            const p = urlObj.searchParams.get('password');
            if (u && p) {
              if (userInput) userInput.value = u;
              if (passInput) passInput.value = p;
              let pathname = (urlObj.pathname || '').replace(/\/(get\.php|player_api\.php)$/, '').replace(/\/+$/, '');
              hostInput.value = `${urlObj.protocol}//${urlObj.host}${pathname}`;
              UIManager.showToast('Credenziali Rilevate', 'Username e Password estratti automaticamente dal link!', 'success');
            }
          } catch (_) {}
        }
      };
      hostInput.addEventListener('input', checkAndExtractUrl);
      hostInput.addEventListener('paste', () => setTimeout(checkAndExtractUrl, 50));
    }

    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const pInput = document.getElementById('login-password');
        if (pInput) {
          if (pInput.type === 'password') {
            pInput.type = 'text';
            togglePassBtn.textContent = '🔒';
          } else {
            pInput.type = 'password';
            togglePassBtn.textContent = '👁️';
          }
        }
      });
    }

    if (demoBtn) {
      demoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const origin = window.location.origin;
        if (hostInput) hostInput.value = `${origin}/api/demo`;
        if (userInput) userInput.value = 'vip_user_2026';
        if (passInput) passInput.value = 'password123';
        if (proxyToggle) proxyToggle.checked = false; // Demo is local
        [hostInput, userInput, passInput].forEach(inp => inp?.classList.remove('input-error'));
        UIManager.showToast('Profilo Demo Caricato', 'Accesso automatico in corso...', 'info');
        await this.handleLogin();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
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

    const hostInput = document.getElementById('login-host');
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const host = hostInput ? hostInput.value.trim() : '';
    const username = userInput ? userInput.value.trim() : '';
    const password = passInput ? passInput.value.trim() : '';
    const useProxy = document.getElementById('proxy-toggle')?.checked ?? true;
    const submitBtn = document.getElementById('login-submit-btn');

    // Reset previous errors
    [hostInput, userInput, passInput].forEach(inp => inp?.classList.remove('input-error'));

    if (!host) {
      hostInput?.classList.add('input-error');
      hostInput?.focus();
      UIManager.showToast('Server URL Mancante', 'Inserisci l\'indirizzo del tuo server Xtream Codes.', 'warning');
      return;
    }

    if (!username) {
      userInput?.classList.add('input-error');
      userInput?.focus();
      UIManager.showToast('Username Mancante', 'Inserisci il nome utente del tuo account.', 'warning');
      return;
    }

    if (!password) {
      passInput?.classList.add('input-error');
      passInput?.focus();
      UIManager.showToast('Password Mancante', 'Inserisci la password del tuo account.', 'warning');
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

      UIManager.showToast('Accesso Riuscito!', `Benvenuto ${username}. Caricamento playlist super ottimizzato...`, 'success');

      // 3. Switch to Dashboard
      this.showDashboard();

      // 4. Bootstrap playlist categories in parallel
      await this.loadCategories();

    } catch (err) {
      console.error('Login error:', err);
      UIManager.showToast('Errore di Accesso', err.message || 'Impossibile connettersi al server Xtream Codes.', 'error', 6000);
    } finally {
      this.isLoggingIn = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>⚡ Accedi alla Playlist</span>';
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
        <span class="category-item-name">⭐ Tutti i Preferiti</span>
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
      <span class="category-item-name">✨ Tutti i Contenuti</span>
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
        viewMode
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
      });
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

      if (res.isFavorite) {
        this.favoritesMap.set(streamId, true);
        btnEl.classList.add('active');
        btnEl.textContent = '★';
        UIManager.showToast('Aggiunto ai Preferiti', item.name, 'success', 2000);
      } else {
        this.favoritesMap.delete(streamId);
        btnEl.classList.remove('active');
        btnEl.textContent = '☆';
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

// Instantiate on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new IPTVApp();
});
