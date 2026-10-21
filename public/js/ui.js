/**
 * IPTV Player V2 - UI Component Factory & Renderers
 * Generates cards, sidebars, modals, and toasts with safe fallbacks.
 */

export class UIManager {
  static showToast(title, msg, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '⚠️';
    else if (type === 'warning') icon = '⚡';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${msg}</div>
      </div>
      <div class="toast-close">✕</div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  // --- CARD GENERATORS FOR VIRTUAL GRID ---

  static createLiveCard(item, onPlay, onToggleFav, isFav, viewMode = 'grid') {
    const card = document.createElement('div');
    card.className = `channel-card ${viewMode === 'list' ? 'list-mode' : ''}`;

    const logoUrl = item.stream_icon || '';
    const name = item.name || 'Canale Sconosciuto';
    const streamId = item.stream_id || '';

    if (viewMode === 'list') {
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
            <div class="channel-logo-container" style="width:38px; height:38px;">
              ${logoUrl 
                ? `<img class="channel-logo-img" src="${logoUrl}" alt="${name}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'channel-fallback-logo\\'>TV</span>'">` 
                : '<span class="channel-fallback-logo">TV</span>'}
            </div>
            <div style="display:flex; flex-direction:column; overflow:hidden;">
              <span class="channel-name" style="font-size:13.5px;">${name}</span>
              <span style="font-size:11px; color:var(--text-dim);">ID: ${streamId}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Preferiti">
              ${isFav ? '★' : '☆'}
            </button>
            <button class="btn-primary" style="padding:6px 14px; font-size:12px; width:auto; border-radius:6px;">
              ▶ Guarda
            </button>
          </div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="channel-card-top">
          <div class="channel-logo-container">
            ${logoUrl 
              ? `<img class="channel-logo-img" src="${logoUrl}" alt="${name}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'channel-fallback-logo\\'>TV</span>'">` 
              : '<span class="channel-fallback-logo">TV</span>'}
          </div>
          <div class="channel-card-actions">
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Aggiungi ai preferiti">
              ${isFav ? '★' : '☆'}
            </button>
          </div>
        </div>
        <div class="channel-card-body">
          <div class="channel-name" title="${name}">${name}</div>
          <div class="channel-meta-row">
            <span class="channel-id-badge">#${streamId}</span>
            <span class="badge badge-live"><span class="live-pulse"></span> LIVE</span>
          </div>
        </div>
      `;
    }

    const favBtn = card.querySelector('.btn-card-fav');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleFav(item, 'live', favBtn);
    });

    card.addEventListener('click', () => {
      onPlay(item, 'live');
    });

    return card;
  }

  static createVodCard(item, onPlay, onToggleFav, isFav, onDetail, viewMode = 'grid') {
    const card = document.createElement('div');
    card.className = `movie-card ${viewMode === 'list' ? 'list-mode' : ''}`;

    const posterUrl = item.stream_icon || '';
    const name = item.name || 'Film';
    const rating = item.rating ? parseFloat(item.rating).toFixed(1) : (item.rating_5based ? (item.rating_5based * 2).toFixed(1) : null);
    const container = (item.container_extension || 'MP4').toUpperCase();

    card.innerHTML = `
      <div class="movie-poster-box">
        ${posterUrl 
          ? `<img class="movie-poster-img" src="${posterUrl}" loading="lazy" alt="${name}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'movie-poster-fallback\\'>🎬<span>${name}</span></div>'">` 
          : `<div class="movie-poster-fallback">🎬<span>${name}</span></div>`}
        <div class="movie-overlay-badges">
          <span class="badge badge-vod">${container}</span>
          ${rating ? `<span class="badge badge-rating">★ ${rating}</span>` : ''}
        </div>
      </div>
      <div class="movie-card-info">
        <div class="movie-title" title="${name}">${name}</div>
        <div class="movie-meta">
          <span>Film VOD</span>
          <button class="btn-card-fav ${isFav ? 'active' : ''}" style="width:24px;height:24px;font-size:12px;" title="Preferiti">
            ${isFav ? '★' : '☆'}
          </button>
        </div>
      </div>
    `;

    const favBtn = card.querySelector('.btn-card-fav');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleFav(item, 'vod', favBtn);
    });

    card.addEventListener('click', () => {
      onPlay(item, 'vod');
    });

    return card;
  }

  static createSeriesCard(item, onOpenSeries, onToggleFav, isFav, viewMode = 'grid') {
    const card = document.createElement('div');
    card.className = `series-card ${viewMode === 'list' ? 'list-mode' : ''}`;

    const posterUrl = item.cover || item.stream_icon || '';
    const name = item.name || 'Serie TV';
    const rating = item.rating ? parseFloat(item.rating).toFixed(1) : (item.rating_5based ? (item.rating_5based * 2).toFixed(1) : null);
    const genre = item.genre || 'Serie TV';

    card.innerHTML = `
      <div class="series-poster-box">
        ${posterUrl 
          ? `<img class="series-poster-img" src="${posterUrl}" loading="lazy" alt="${name}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'movie-poster-fallback\\'>🍿<span>${name}</span></div>'">` 
          : `<div class="movie-poster-fallback">🍿<span>${name}</span></div>`}
        <div class="movie-overlay-badges">
          <span class="badge badge-series">SERIE</span>
          ${rating ? `<span class="badge badge-rating">★ ${rating}</span>` : ''}
        </div>
      </div>
      <div class="series-card-info">
        <div class="series-title" title="${name}">${name}</div>
        <div class="series-meta">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${genre}</span>
          <button class="btn-card-fav ${isFav ? 'active' : ''}" style="width:24px;height:24px;font-size:12px;" title="Preferiti">
            ${isFav ? '★' : '☆'}
          </button>
        </div>
      </div>
    `;

    const favBtn = card.querySelector('.btn-card-fav');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleFav(item, 'series', favBtn);
    });

    card.addEventListener('click', () => {
      onOpenSeries(item);
    });

    return card;
  }

  // --- SERIES EPISODES MODAL ---
  static renderSeriesModal(series, seriesDetails, onPlayEpisode) {
    let overlay = document.getElementById('series-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'series-modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const info = seriesDetails.info || series;
    const seasons = seriesDetails.seasons || [];
    const episodesMap = seriesDetails.episodes || {};

    const name = info.name || series.name;
    const cover = info.cover || series.cover || '';
    const plot = info.plot || series.plot || 'Nessuna descrizione disponibile per questa serie TV.';
    const genre = info.genre || series.genre || 'Dramma / Avventura';
    const cast = info.cast || series.cast || '';
    const rating = info.rating || series.rating || '';

    overlay.innerHTML = `
      <div class="series-modal">
        <div class="series-hero">
          <div class="series-hero-poster">
            ${cover ? `<img src="${cover}" alt="${name}">` : '<div class="movie-poster-fallback">🍿</div>'}
          </div>
          <div class="series-hero-content">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h2 class="series-hero-title">${name}</h2>
              <div class="player-close-btn" id="series-modal-close">✕</div>
            </div>
            <div class="series-hero-meta">
              <span class="badge badge-series">SERIE TV</span>
              ${rating ? `<span class="badge badge-rating">★ ${rating}</span>` : ''}
              <span style="color:var(--text-dim); font-size:12px;">${genre}</span>
            </div>
            <p class="series-hero-plot">${plot}</p>
            ${cast ? `<div class="series-hero-cast"><strong>Cast:</strong> ${cast}</div>` : ''}
          </div>
        </div>

        <div class="season-tabs-bar" id="season-tabs-container">
          <!-- Season tabs -->
        </div>

        <div class="episodes-container" id="episodes-list-container">
          <!-- Episodes list -->
        </div>
      </div>
    `;

    overlay.classList.add('active');

    // Close handler
    const closeBtn = overlay.querySelector('#series-modal-close');
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    };

    const tabsContainer = overlay.querySelector('#season-tabs-container');
    const episodesContainer = overlay.querySelector('#episodes-list-container');

    // If no seasons array, inspect keys in episodesMap
    const seasonKeys = seasons.length > 0 
      ? seasons.map(s => String(s.season_number || s.id || 1)) 
      : Object.keys(episodesMap);

    if (seasonKeys.length === 0) {
      seasonKeys.push("1");
    }

    const renderEpisodesForSeason = (seasonNum) => {
      const episodes = episodesMap[seasonNum] || episodesMap[String(seasonNum)] || [];
      episodesContainer.innerHTML = '';

      if (episodes.length === 0) {
        episodesContainer.innerHTML = `
          <div class="empty-state" style="padding:40px 0;">
            <div class="empty-state-icon">📺</div>
            <div class="empty-state-title">Nessun episodio trovato</div>
            <div class="empty-state-desc">Non ci sono episodi registrati per questa stagione.</div>
          </div>
        `;
        return;
      }

      episodes.forEach((ep) => {
        const epEl = document.createElement('div');
        epEl.className = 'episode-card';
        const epNum = ep.episode_num || ep.id;
        const epTitle = ep.title || `Episodio ${epNum}`;
        const epPlot = ep.info?.plot || 'Guarda questo episodio';

        epEl.innerHTML = `
          <div class="episode-left">
            <div class="episode-num-badge">E${epNum}</div>
            <div class="episode-info-text">
              <span class="episode-title">${epTitle}</span>
              <span class="episode-plot">${epPlot}</span>
            </div>
          </div>
          <button class="episode-play-btn" title="Riproduci Episodio">▶</button>
        `;

        epEl.addEventListener('click', () => {
          onPlayEpisode(ep, `${name} - S${seasonNum}E${epNum}: ${epTitle}`);
        });

        episodesContainer.appendChild(epEl);
      });
    };

    // Render Season Tabs
    tabsContainer.innerHTML = '';
    seasonKeys.forEach((sNum, index) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `season-tab-btn ${index === 0 ? 'active' : ''}`;
      tabBtn.textContent = `Stagione ${sNum}`;

      tabBtn.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.season-tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        renderEpisodesForSeason(sNum);
      });

      tabsContainer.appendChild(tabBtn);
    });

    // Default select first season
    if (seasonKeys[0]) {
      renderEpisodesForSeason(seasonKeys[0]);
    }
  }

  // --- SAVED ACCOUNTS RENDERING ---
  static renderSavedAccountsList(container, accounts, onSelect, onDelete) {
    container.innerHTML = '';
    if (!accounts.length) {
      container.innerHTML = '<span style="color:var(--text-dim);font-size:12px;">Nessun profilo salvato.</span>';
      return;
    }

    accounts.forEach(acc => {
      const chip = document.createElement('div');
      chip.className = 'account-chip';

      chip.innerHTML = `
        <div class="account-chip-info">
          <div class="account-chip-icon">👤</div>
          <div class="account-chip-text">
            <span class="account-chip-user">${acc.username}</span>
            <span class="account-chip-host">${acc.host}</span>
          </div>
        </div>
        <button class="account-delete-btn" title="Elimina profilo">🗑️</button>
      `;

      chip.addEventListener('click', () => onSelect(acc));

      const delBtn = chip.querySelector('.account-delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(acc.id);
      });

      container.appendChild(chip);
    });
  }
}
