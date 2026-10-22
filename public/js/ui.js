/**
 * IPTV Player V2 - UI Component Factory & Renderers
 * Clean, Modern Professional Components (Zero Emojis, Crisp SVGs, Safe Fallbacks).
 */

import { WatchHistoryManager } from './history.js?v=3.0';

const ICONS = {
  starOutline: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
  starFilled: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="#fbbf24" stroke-width="2" fill="#fbbf24" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  user: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  trash: '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  movie: '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="2" y="2" width="20" height="20" rx="2"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>',
  series: '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="2" y="7" width="20" height="15" rx="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>',
  success: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  error: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#ef4444" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  warning: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#f59e0b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  info: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#3b82f6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
};

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

    let iconSvg = ICONS.info;
    if (type === 'success') iconSvg = ICONS.success;
    else if (type === 'error') iconSvg = ICONS.error;
    else if (type === 'warning') iconSvg = ICONS.warning;

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${msg}</div>
      </div>
      <div class="toast-close">${ICONS.close}</div>
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

  static escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- CARD GENERATORS FOR VIRTUAL GRID ---

  static createLiveCard(item, onPlay, onToggleFav, isFav, viewMode = 'grid') {
    const card = document.createElement('div');
    card.className = `channel-card ${viewMode === 'list' ? 'list-mode' : ''}`;

    const logoUrl = item.stream_icon || '';
    const name = item.name || 'Canale Sconosciuto';
    const streamId = item.stream_id || '';
    const safeName = UIManager.escapeHtml(name);

    if (viewMode === 'list') {
      card.innerHTML = `
        <div class="list-item-row">
          <div class="list-item-left">
            <div class="channel-logo-container" style="width:28px; height:28px; min-width:28px; padding:2px; border-radius:3px; flex-shrink:0;">
              ${logoUrl 
                ? `<img class="channel-logo-img" src="${logoUrl}" alt="" />
                   <span class="channel-fallback-logo" style="display:none;">TV</span>` 
                : '<span class="channel-fallback-logo">TV</span>'}
            </div>
            <div class="list-item-text">
              <div class="list-item-title-row">
                <span class="channel-name" title="${safeName}">${safeName}</span>
                <span class="badge badge-live" style="font-size:9px; padding:1px 5px;"><span class="live-pulse"></span> LIVE</span>
              </div>
              <span class="list-item-sub">ID: ${streamId}</span>
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Preferiti">
              ${isFav ? ICONS.starFilled : ICONS.starOutline}
            </button>
            <button class="btn-primary btn-list-action">Guarda</button>
          </div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="channel-card-top">
          <div class="channel-logo-container">
            ${logoUrl 
              ? `<img class="channel-logo-img" src="${logoUrl}" alt="" />
                 <span class="channel-fallback-logo" style="display:none;">TV</span>` 
              : '<span class="channel-fallback-logo">TV</span>'}
          </div>
          <div class="channel-card-actions">
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Aggiungi ai preferiti">
              ${isFav ? ICONS.starFilled : ICONS.starOutline}
            </button>
          </div>
        </div>
        <div class="channel-card-body">
          <div class="channel-name" title="${safeName}">${safeName}</div>
          <div class="channel-meta-row">
            <span class="channel-id-badge">#${streamId}</span>
            <span class="badge badge-live"><span class="live-pulse"></span> LIVE</span>
          </div>
        </div>
      `;
    }

    const img = card.querySelector('.channel-logo-img');
    if (img) {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const fallback = card.querySelector('.channel-fallback-logo');
        if (fallback) fallback.style.display = 'flex';
      });
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

  static createVodCard(item, onPlay, onToggleFav, isFav, onDetail, viewMode = 'grid', accountId = null) {
    const card = document.createElement('div');
    card.className = `movie-card ${viewMode === 'list' ? 'list-mode' : ''}`;

    const posterUrl = item.stream_icon || '';
    const name = item.name || 'Film';
    const rating = item.rating ? parseFloat(item.rating).toFixed(1) : (item.rating_5based ? (item.rating_5based * 2).toFixed(1) : null);
    const container = (item.container_extension || 'MP4').toUpperCase();
    const safeName = UIManager.escapeHtml(name);

    const itemId = `vod_${item.stream_id || item.id}`;
    const progress = accountId ? WatchHistoryManager.getProgress(accountId, itemId) : null;
    const isCompleted = accountId ? WatchHistoryManager.isCompleted(accountId, itemId) : false;
    const progressPct = progress ? progress.percent : 0;
    const remText = progress ? WatchHistoryManager.formatRemaining(progress.duration, progress.currentTime) : '';

    if (viewMode === 'list') {
      card.innerHTML = `
        <div class="list-item-row">
          <div class="list-item-left">
            <div class="list-poster-thumb">
              ${posterUrl 
                ? `<img class="list-poster-img" src="${posterUrl}" loading="lazy" alt="" />
                   <div class="list-poster-fallback" style="display:none;">${ICONS.movie}</div>` 
                : `<div class="list-poster-fallback">${ICONS.movie}</div>`}
              ${progressPct > 2 ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width:${progressPct}%;"></div></div>` : ''}
            </div>
            <div class="list-item-text">
              <div class="list-item-title-row">
                <span class="movie-title" title="${safeName}">${safeName}</span>
                <span class="badge badge-vod">${container}</span>
                ${rating ? `<span class="badge badge-rating">${rating}</span>` : ''}
                ${isCompleted ? `<span class="badge badge-watched">VISTO</span>` : ''}
              </div>
              <span class="list-item-sub">${remText || 'Film VOD'}</span>
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn-card-vlc" title="Riproduci con VLC Media Player">VLC</button>
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Preferiti">
              ${isFav ? ICONS.starFilled : ICONS.starOutline}
            </button>
            <button class="btn-primary btn-list-action">Guarda</button>
          </div>
        </div>
      `;

      const img = card.querySelector('.list-poster-img');
      if (img) {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fallback = card.querySelector('.list-poster-fallback');
          if (fallback) fallback.style.display = 'flex';
        });
      }
    } else {
      card.innerHTML = `
        <div class="movie-poster-box">
          ${posterUrl 
            ? `<img class="movie-poster-img" src="${posterUrl}" loading="lazy" alt="" />
               <div class="movie-poster-fallback" style="display:none;">${ICONS.movie}<span>${safeName}</span></div>` 
            : `<div class="movie-poster-fallback">${ICONS.movie}<span>${safeName}</span></div>`}
          <div class="movie-overlay-badges">
            <span class="badge badge-vod">${container}</span>
            ${rating ? `<span class="badge badge-rating">${rating}</span>` : ''}
            ${isCompleted ? `<span class="badge badge-watched">VISTO</span>` : ''}
          </div>
          ${progressPct > 2 ? `
            <div class="card-progress-bar">
              <div class="card-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
          ` : ''}
        </div>
        <div class="movie-card-info">
          <div class="movie-title" title="${safeName}">${safeName}</div>
          <div class="movie-meta">
            <span>${remText || 'Film VOD'}</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button class="btn-card-vlc" title="Riproduci con VLC Media Player">VLC</button>
              <button class="btn-card-fav ${isFav ? 'active' : ''}" style="width:26px;height:26px;border-radius:4px;" title="Preferiti">
                ${isFav ? ICONS.starFilled : ICONS.starOutline}
              </button>
            </div>
          </div>
        </div>
      `;

      const img = card.querySelector('.movie-poster-img');
      if (img) {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fallback = card.querySelector('.movie-poster-fallback');
          if (fallback) fallback.style.display = 'flex';
        });
      }
    }

    const favBtn = card.querySelector('.btn-card-fav');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggleFav(item, 'vod', favBtn);
      });
    }

    const vlcBtn = card.querySelector('.btn-card-vlc');
    if (vlcBtn && onDetail) {
      vlcBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDetail(item);
      });
    }

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
    const safeName = UIManager.escapeHtml(name);
    const safeGenre = UIManager.escapeHtml(genre);

    if (viewMode === 'list') {
      card.innerHTML = `
        <div class="list-item-row">
          <div class="list-item-left">
            <div class="list-poster-thumb">
              ${posterUrl 
                ? `<img class="list-poster-img" src="${posterUrl}" loading="lazy" alt="" />
                   <div class="list-poster-fallback" style="display:none;">${ICONS.series}</div>` 
                : `<div class="list-poster-fallback">${ICONS.series}</div>`}
            </div>
            <div class="list-item-text">
              <div class="list-item-title-row">
                <span class="series-title" title="${safeName}">${safeName}</span>
                <span class="badge badge-series">SERIE</span>
                ${rating ? `<span class="badge badge-rating">${rating}</span>` : ''}
              </div>
              <span class="list-item-sub">${safeGenre}</span>
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn-card-fav ${isFav ? 'active' : ''}" title="Preferiti">
              ${isFav ? ICONS.starFilled : ICONS.starOutline}
            </button>
            <button class="btn-primary btn-list-action">Episodi</button>
          </div>
        </div>
      `;

      const img = card.querySelector('.list-poster-img');
      if (img) {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fallback = card.querySelector('.list-poster-fallback');
          if (fallback) fallback.style.display = 'flex';
        });
      }
    } else {
      card.innerHTML = `
        <div class="series-poster-box">
          ${posterUrl 
            ? `<img class="series-poster-img" src="${posterUrl}" loading="lazy" alt="" />
               <div class="movie-poster-fallback" style="display:none;">${ICONS.series}<span>${safeName}</span></div>` 
            : `<div class="movie-poster-fallback">${ICONS.series}<span>${safeName}</span></div>`}
          <div class="movie-overlay-badges">
            <span class="badge badge-series">SERIE</span>
            ${rating ? `<span class="badge badge-rating">${rating}</span>` : ''}
          </div>
        </div>
        <div class="series-card-info">
          <div class="series-title" title="${safeName}">${safeName}</div>
          <div class="series-meta">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${safeGenre}</span>
            <button class="btn-card-fav ${isFav ? 'active' : ''}" style="width:26px;height:26px;border-radius:4px;" title="Preferiti">
              ${isFav ? ICONS.starFilled : ICONS.starOutline}
            </button>
          </div>
        </div>
      `;

      const img = card.querySelector('.series-poster-img');
      if (img) {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fallback = card.querySelector('.movie-poster-fallback');
          if (fallback) fallback.style.display = 'flex';
        });
      }
    }

    const favBtn = card.querySelector('.btn-card-fav');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggleFav(item, 'series', favBtn);
      });
    }

    card.addEventListener('click', () => {
      onOpenSeries(item);
    });

    return card;
  }

  /**
   * Normalizes seasons metadata and episodes across various Xtream Codes panel formats.
   */
  static normalizeSeriesData(seriesDetails = {}) {
    const seasonsMetaMap = new Map();
    const episodesMap = new Map();

    if (!seriesDetails || typeof seriesDetails !== 'object') {
      return { seasonsMetaMap, episodesMap, seasonKeys: ['1'] };
    }

    // 1. Normalize Seasons Metadata
    const rawSeasons = seriesDetails.seasons;
    if (Array.isArray(rawSeasons)) {
      rawSeasons.forEach((s, idx) => {
        if (!s) return;
        let sNum = null;
        if (s.season_number !== undefined && s.season_number !== null) {
          sNum = String(s.season_number);
        } else if (s.id !== undefined && s.id !== null && !isNaN(Number(s.id))) {
          sNum = String(s.id);
        } else {
          sNum = String(idx + 1);
        }
        seasonsMetaMap.set(sNum, s);
      });
    } else if (rawSeasons && typeof rawSeasons === 'object') {
      Object.entries(rawSeasons).forEach(([k, s]) => {
        if (!s) return;
        let sNum = String(k);
        const match = sNum.match(/\d+/);
        if (match) {
          sNum = String(parseInt(match[0], 10));
        }
        if (typeof s === 'object' && s.season_number !== undefined && s.season_number !== null) {
          sNum = String(s.season_number);
        }
        seasonsMetaMap.set(sNum, typeof s === 'object' ? s : { name: `Stagione ${sNum}` });
      });
    }

    // 2. Normalize Episodes Data
    const rawEpisodes = seriesDetails.episodes;
    if (Array.isArray(rawEpisodes)) {
      rawEpisodes.forEach((ep) => {
        if (!ep) return;
        let sNum = '1';
        if (ep.season !== undefined && ep.season !== null && String(ep.season).trim() !== '') {
          const m = String(ep.season).match(/\d+/);
          sNum = m ? String(parseInt(m[0], 10)) : String(ep.season);
        } else if (ep.season_num !== undefined && ep.season_num !== null) {
          const m = String(ep.season_num).match(/\d+/);
          sNum = m ? String(parseInt(m[0], 10)) : String(ep.season_num);
        }
        if (!episodesMap.has(sNum)) {
          episodesMap.set(sNum, []);
        }
        episodesMap.get(sNum).push(ep);
      });
    } else if (rawEpisodes && typeof rawEpisodes === 'object') {
      Object.entries(rawEpisodes).forEach(([rawKey, bucket]) => {
        let bucketList = [];
        if (Array.isArray(bucket)) {
          bucketList = bucket;
        } else if (bucket && typeof bucket === 'object') {
          bucketList = Object.values(bucket);
        }

        let defaultSeasonNum = String(rawKey);
        const m = defaultSeasonNum.match(/\d+/);
        if (m) {
          defaultSeasonNum = String(parseInt(m[0], 10));
        }

        bucketList.forEach((ep) => {
          if (!ep) return;
          let epSeason = defaultSeasonNum;
          if (ep.season !== undefined && ep.season !== null && String(ep.season).trim() !== '') {
            const epMatch = String(ep.season).match(/\d+/);
            if (epMatch) {
              epSeason = String(parseInt(epMatch[0], 10));
            }
          }
          if (!episodesMap.has(epSeason)) {
            episodesMap.set(epSeason, []);
          }
          episodesMap.get(epSeason).push(ep);
        });
      });
    }

    // 3. Union ALL season keys from both episodesMap and seasonsMetaMap
    const allKeysSet = new Set([
      ...episodesMap.keys(),
      ...seasonsMetaMap.keys()
    ]);

    const seasonKeys = Array.from(allKeysSet).filter(k => k && k.trim() !== '').sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });

    if (seasonKeys.length === 0) {
      seasonKeys.push('1');
    }

    return { seasonsMetaMap, episodesMap, seasonKeys };
  }

  // --- SERIES EPISODES MODAL ---
  static renderSeriesModal(series, seriesDetails, onPlayEpisode, accountId = null) {
    let overlay = document.getElementById('series-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'series-modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const { seasonsMetaMap, episodesMap: normEpisodesMap, seasonKeys } = this.normalizeSeriesData(seriesDetails);

    const info = (seriesDetails && seriesDetails.info) || series || {};
    const name = info.name || series.name || 'Serie TV';
    const cover = info.cover || series.cover || series.stream_icon || '';
    const plot = info.plot || series.plot || 'Nessuna descrizione disponibile per questa serie TV.';
    const genre = info.genre || series.genre || 'Dramma / Serie TV';
    const cast = info.cast || series.cast || '';
    const rating = info.rating ? parseFloat(info.rating).toFixed(1) : (series.rating ? parseFloat(series.rating).toFixed(1) : '');

    const activeSeasonsCount = seasonKeys.filter(k => (normEpisodesMap.get(k) || []).length > 0).length || seasonKeys.length;
    const totalEpisodesCount = Array.from(normEpisodesMap.values()).reduce((acc, list) => acc + list.length, 0);

    const safeName = UIManager.escapeHtml(name);
    const safeGenre = UIManager.escapeHtml(genre);
    const safePlot = UIManager.escapeHtml(plot);
    const safeCast = UIManager.escapeHtml(cast);

    overlay.innerHTML = `
      <div class="series-modal">
        <div class="series-hero">
          <div class="series-hero-poster">
            ${cover 
              ? `<img src="${cover}" alt="" />
                 <div class="movie-poster-fallback" style="display:none;">${ICONS.series}<span>${safeName}</span></div>` 
              : `<div class="movie-poster-fallback">${ICONS.series}<span>${safeName}</span></div>`}
          </div>
          <div class="series-hero-content">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h2 class="series-hero-title">${safeName}</h2>
              <div class="player-close-btn" id="series-modal-close" title="Chiudi">${ICONS.close}</div>
            </div>
            <div class="series-hero-meta">
              <span class="badge badge-series">SERIE TV</span>
              ${rating ? `<span class="badge badge-rating">${rating}</span>` : ''}
              <span class="badge badge-season-count">${activeSeasonsCount} ${activeSeasonsCount === 1 ? 'Stagione' : 'Stagioni'}</span>
              ${totalEpisodesCount > 0 ? `<span class="badge badge-episodes-total">${totalEpisodesCount} ep. totali</span>` : ''}
              <span style="color:var(--text-dim); font-size:12px;">${safeGenre}</span>
            </div>
            <p class="series-hero-plot">${safePlot}</p>
            ${safeCast ? `<div class="series-hero-cast"><strong>Cast:</strong> ${safeCast}</div>` : ''}
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

    const heroImg = overlay.querySelector('.series-hero-poster img');
    if (heroImg) {
      heroImg.addEventListener('error', () => {
        heroImg.style.display = 'none';
        const fb = overlay.querySelector('.series-hero-poster .movie-poster-fallback');
        if (fb) fb.style.display = 'flex';
      });
    }

    overlay.classList.add('active');

    // Close handler
    const closeBtn = overlay.querySelector('#series-modal-close');
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    };

    const tabsContainer = overlay.querySelector('#season-tabs-container');
    const episodesContainer = overlay.querySelector('#episodes-list-container');

    const renderEpisodesForSeason = (seasonNum) => {
      const episodes = (normEpisodesMap.get(String(seasonNum)) || []).slice();
      episodesContainer.innerHTML = '';

      if (episodes.length === 0) {
        episodesContainer.innerHTML = `
          <div class="empty-state" style="padding:40px 0;">
            <div class="empty-state-icon">${ICONS.series}</div>
            <div class="empty-state-title">Nessun episodio trovato</div>
            <div class="empty-state-desc">Non ci sono episodi registrati per la Stagione ${seasonNum}.</div>
          </div>
        `;
        return;
      }

      // Sort episodes numerically ascending
      episodes.sort((a, b) => {
        const aNum = parseInt(a.episode_num ?? a.num ?? a.id ?? 0, 10);
        const bNum = parseInt(b.episode_num ?? b.num ?? b.id ?? 0, 10);
        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
          return aNum - bNum;
        }
        return String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true });
      });

      episodes.forEach((ep) => {
        const epEl = document.createElement('div');
        epEl.className = 'episode-card';
        const epNum = ep.episode_num !== undefined ? ep.episode_num : (ep.num || ep.id || 1);
        const epTitle = ep.title || `Episodio ${epNum}`;
        const epPlot = ep.info?.plot || ep.plot || 'Guarda questo episodio';
        const epDuration = ep.info?.duration || (ep.info?.duration_secs ? `${Math.floor(ep.info.duration_secs / 60)} min` : '');
        const epExt = ep.container_extension || '';
        const thumbUrl = ep.info?.movie_image || ep.movie_image || ep.cover || '';

        const epKey = `episode_${ep.id || ep.stream_id}`;
        const progress = accountId ? WatchHistoryManager.getProgress(accountId, epKey) : null;
        const isCompleted = accountId ? WatchHistoryManager.isCompleted(accountId, epKey) : false;
        const progressPct = progress ? progress.percent : 0;
        const remText = progress ? WatchHistoryManager.formatRemaining(progress.duration, progress.currentTime) : '';

        epEl.innerHTML = `
          <div class="episode-left">
            ${thumbUrl ? `
              <div class="episode-thumb-box">
                <img src="${thumbUrl}" alt="E${epNum}" onerror="this.parentElement.style.display='none'; this.parentElement.nextElementSibling.style.display='flex';">
              </div>
              <div class="episode-num-badge" style="display:none;">E${epNum}</div>
            ` : `
              <div class="episode-num-badge">E${epNum}</div>
            `}
            <div class="episode-info-text">
              <div class="episode-title-row">
                <span class="episode-title">${epTitle}</span>
                ${isCompleted ? '<span class="badge badge-watched">VISTO</span>' : ''}
                ${progressPct > 2 && !isCompleted ? `<span class="episode-chip" style="color:#60a5fa;border-color:rgba(37,99,235,0.4);">${remText || (progressPct + '%')}</span>` : ''}
                ${epDuration ? `<span class="episode-chip">${epDuration}</span>` : ''}
                ${epExt ? `<span class="episode-chip">${epExt.toUpperCase()}</span>` : ''}
              </div>
              <span class="episode-plot">${epPlot}</span>
            </div>
          </div>
          <button class="episode-play-btn" title="Riproduci Episodio">${ICONS.play}</button>
          ${progressPct > 2 && !isCompleted ? `
            <div class="episode-card-progress">
              <div class="episode-card-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
          ` : ''}
        `;

        epEl.addEventListener('click', () => {
          onPlayEpisode(ep, `${name} - S${seasonNum}E${epNum}: ${epTitle}`);
        });

        episodesContainer.appendChild(epEl);
      });
    };

    let defaultSeason = seasonKeys.find(k => k === '1' && (normEpisodesMap.get(k) || []).length > 0);
    if (!defaultSeason) {
      defaultSeason = seasonKeys.find(k => (normEpisodesMap.get(k) || []).length > 0) || seasonKeys[0];
    }

    tabsContainer.innerHTML = '';
    seasonKeys.forEach((sNum) => {
      const meta = seasonsMetaMap.get(sNum);
      const eps = normEpisodesMap.get(sNum) || [];
      const count = eps.length;

      let label = `Stagione ${sNum}`;
      if (sNum === '0') {
        label = (meta && meta.name) ? meta.name : 'Speciali';
      } else if (meta && meta.name) {
        label = meta.name;
      }

      const tabBtn = document.createElement('button');
      tabBtn.className = `season-tab-btn ${sNum === defaultSeason ? 'active' : ''}`;
      tabBtn.setAttribute('data-season', sNum);

      tabBtn.innerHTML = `
        <span class="season-tab-title">${label}</span>
        <span class="season-ep-count-badge">${count} ep</span>
      `;

      tabBtn.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.season-tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        renderEpisodesForSeason(sNum);
      });

      tabsContainer.appendChild(tabBtn);
    });

    if (defaultSeason) {
      renderEpisodesForSeason(defaultSeason);
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
          <div class="account-chip-icon">${ICONS.user}</div>
          <div class="account-chip-text">
            <span class="account-chip-user">${acc.username}</span>
            <span class="account-chip-host">${acc.host}</span>
          </div>
        </div>
        <button class="account-delete-btn" title="Elimina profilo">${ICONS.trash}</button>
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

  // --- CONTINUE WATCHING CARD GENERATOR ---
  static createContinueWatchingCard(entry, onPlay, onRemove) {
    const card = document.createElement('div');
    card.className = 'cw-card';
    const safeTitle = UIManager.escapeHtml(entry.title);
    const safeSub = UIManager.escapeHtml(entry.subTitle);
    const remText = WatchHistoryManager.formatRemaining(entry.duration, entry.currentTime);

    card.innerHTML = `
      <div class="cw-poster-box">
        ${entry.poster 
          ? `<img class="cw-poster-img" src="${entry.poster}" alt="" />
             <div class="cw-poster-fallback" style="display:none;">${entry.type === 'series' ? ICONS.series : ICONS.movie}</div>`
          : `<div class="cw-poster-fallback">${entry.type === 'series' ? ICONS.series : ICONS.movie}</div>`}
        <button class="cw-dismiss-btn" title="Rimuovi da Continua a guardare">
          ${ICONS.close}
        </button>
        <div class="cw-play-overlay">
          <div class="cw-play-icon">${ICONS.play}</div>
        </div>
        <div class="cw-progress-bar">
          <div class="cw-progress-fill" style="width: ${entry.percent}%;"></div>
        </div>
      </div>
      <div class="cw-info">
        <div class="cw-title" title="${safeTitle}">${safeTitle}</div>
        <div class="cw-meta-row">
          <span class="cw-sub">${safeSub}</span>
          <span class="cw-rem">${remText || (entry.percent + '%')}</span>
        </div>
      </div>
    `;

    const img = card.querySelector('.cw-poster-img');
    if (img) {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const fb = card.querySelector('.cw-poster-fallback');
        if (fb) fb.style.display = 'flex';
      });
    }

    const dismissBtn = card.querySelector('.cw-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(entry);
      });
    }

    card.addEventListener('click', () => {
      onPlay(entry);
    });

    return card;
  }
}

