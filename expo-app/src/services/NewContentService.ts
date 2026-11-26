import { StorageService } from './storage';
import { Account, SeriesItem, VodStream } from '../types';

export type NewContentType = 'vod' | 'series';

export interface NewContentItem {
  id: string;
  type: NewContentType;
  title: string;
  poster: string;
  categoryId: string;
  detectedAt: number;
  providerAdded?: string;
}

interface NewContentState {
  version: 1;
  initializedAt: number;
  seen: {
    vod: string[];
    series: string[];
  };
  items: NewContentItem[];
}

const RETENTION_DAYS = 30;
const MAX_NEW_ITEMS = 1000;

const hash = (value: string): string => {
  let result = 2166136261;

  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }

  return (result >>> 0).toString(36);
};

const parseProviderAdded = (value?: string): number | null => {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const timestamp = numeric < 1000000000000 ? numeric * 1000 : numeric;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const getContentId = (
  item: VodStream | SeriesItem,
  type: NewContentType,
  account: Account
): string => {
  const source = String(item.direct_source || '').trim();

  if (account.accountType === 'm3u' && source) {
    return `m3u_${hash(source)}`;
  }

  const id = type === 'vod'
    ? (item as VodStream).stream_id
    : (item as SeriesItem).series_id;

  if (id !== undefined && id !== null && String(id).trim()) {
    return String(id);
  }

  return source ? `url_${hash(source)}` : '';
};

export const matchesNewContentItem = (
  entry: NewContentItem,
  item: VodStream | SeriesItem
): boolean => {
  const itemId = entry.type === 'vod'
    ? (item as VodStream).stream_id
    : (item as SeriesItem).series_id;

  if (itemId !== undefined && itemId !== null && String(itemId) === entry.id) {
    return true;
  }

  const source = String(item.direct_source || '').trim();
  if (!source) return false;

  return entry.id === `m3u_${hash(source)}` ||
    entry.id === `url_${hash(source)}`;
};

const sanitizeItems = (items: any[]): NewContentItem[] =>
  (items || []).map(({ rawItem, ...item }) => item as NewContentItem);

const toNewContent = (
  item: VodStream | SeriesItem,
  type: NewContentType,
  id: string,
  detectedAt: number
): NewContentItem => {
  const vod = type === 'vod' ? item as VodStream : null;
  const series = type === 'series' ? item as SeriesItem : null;

  return {
    id,
    type,
    title: item.name || 'Senza titolo',
    poster: vod?.stream_icon || series?.cover || '',
    categoryId: item.category_id || '',
    detectedAt,
    providerAdded: vod?.added
  };
};

export const NewContentService = {
  async updateCatalog(
    account: Account,
    vodItems: VodStream[],
    seriesItems: SeriesItem[],
    detectNew: boolean
  ): Promise<NewContentItem[]> {
    const now = Date.now();
    const state = await StorageService.getNewContentState(account.id) as NewContentState | null;

    // Remove raw stream URLs from legacy persisted entries.
    const safeItems = sanitizeItems(state?.items || []);

    if (state && !detectNew) {
      if ((state.items || []).some((item: any) => item.rawItem)) {
        await StorageService.saveNewContentState(account.id, {
          ...state,
          items: safeItems
        });
      }
      return safeItems;
    }

    const catalog = {
      vod: (vodItems || []).map(item => ({
        item,
        id: getContentId(item, 'vod', account)
      })).filter(entry => entry.id),
      series: (seriesItems || []).map(item => ({
        item,
        id: getContentId(item, 'series', account)
      })).filter(entry => entry.id)
    };

    if (!state || state.version !== 1) {
      const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;

      // On first initialization, show only Xtream movies with a valid
      // provider-added date inside the retention window.
      const initialRecentMovies = account.accountType === 'm3u'
        ? []
        : catalog.vod.flatMap(entry => {
            const addedAt = parseProviderAdded(entry.item.added);
            if (addedAt === null || addedAt < cutoff || addedAt > now) return [];
            return [toNewContent(entry.item, 'vod', entry.id, addedAt)];
          });

      const initialState: NewContentState = {
        version: 1,
        initializedAt: now,
        seen: {
          vod: catalog.vod.map(entry => entry.id),
          series: catalog.series.map(entry => entry.id)
        },
        items: initialRecentMovies
      };

      await StorageService.saveNewContentState(account.id, initialState);
      return initialRecentMovies;
    }

    const seenVod = new Set(state.seen?.vod || []);
    const seenSeries = new Set(state.seen?.series || []);
    const newItems: NewContentItem[] = [];
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const updateType = <T extends VodStream | SeriesItem>(
      entries: { item: T; id: string }[],
      seen: Set<string>,
      type: NewContentType
    ) => {
      for (const entry of entries) {
        if (!seen.has(entry.id)) {
          if (detectNew) {
            newItems.push(toNewContent(entry.item, type, entry.id, now));
          }
          seen.add(entry.id);
        }

        // Xtream VOD has an authoritative provider-added timestamp.
        // Use it to backfill recent movies without marking the whole catalog new.
        if (type === 'vod' && account.accountType !== 'm3u') {
          const addedAt = parseProviderAdded((entry.item as VodStream).added);
          if (addedAt !== null && addedAt >= cutoff && addedAt <= now) {
            const alreadyListed =
              safeItems.some(item => item.type === 'vod' && item.id === entry.id) ||
              newItems.some(item => item.type === 'vod' && item.id === entry.id);

            if (!alreadyListed) {
              newItems.push(toNewContent(entry.item, 'vod', entry.id, addedAt));
            }
          }
        }
      }
    };

    updateType(catalog.vod, seenVod, 'vod');
    updateType(catalog.series, seenSeries, 'series');

    const retainedItems = [
      ...safeItems,
      ...newItems
    ]
      .filter(item => item.detectedAt >= cutoff)
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, MAX_NEW_ITEMS);

    const updatedState: NewContentState = {
      version: 1,
      initializedAt: state.initializedAt || now,
      seen: {
        vod: Array.from(seenVod),
        series: Array.from(seenSeries)
      },
      items: retainedItems
    };

    await StorageService.saveNewContentState(account.id, updatedState);
    return retainedItems;
  },

  async getRecent(accountId: string): Promise<NewContentItem[]> {
    const state = await StorageService.getNewContentState(accountId) as NewContentState | null;
    if (!state || !Array.isArray(state.items)) return [];

    const safeItems = sanitizeItems(state.items);
    if (state.items.some((item: any) => item.rawItem)) {
      await StorageService.saveNewContentState(accountId, {
        ...state,
        items: safeItems
      });
    }

    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    return safeItems
      .filter(item => item.detectedAt >= cutoff)
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }
};
