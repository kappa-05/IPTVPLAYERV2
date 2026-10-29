import { Category, LiveStream, MediaType, VodStream, SeriesItem } from '../types';

export interface ParsedM3U {
  liveCategories: Category[];
  vodCategories: Category[];
  seriesCategories: Category[];
  liveStreams: LiveStream[];
  vodStreams: VodStream[];
  seriesStreams: SeriesItem[];
}

export class M3UParser {
  static parse(content: string): ParsedM3U {
    const lines = content.split(/\r?\n/);
    const liveStreams: LiveStream[] = [];
    const vodStreams: VodStream[] = [];
    const seriesStreams: SeriesItem[] = [];

    const liveCatMap = new Map<string, string>();
    const vodCatMap = new Map<string, string>();
    const seriesCatMap = new Map<string, string>();

    let currentMeta: {
      name: string;
      tvgId?: string;
      tvgName?: string;
      logo?: string;
      group?: string;
    } | null = null;

    let streamIndex = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentMeta = this.parseExtInf(line);
      } else if (!line.startsWith('#') && currentMeta) {
        // Stream URL line
        const streamUrl = line;
        const mediaType = this.detectMediaType(currentMeta.group || '', streamUrl);
        const categoryName = currentMeta.group || 'Generale';
        const categoryId = this.slugify(categoryName);
        const name = currentMeta.name || currentMeta.tvgName || `Canale ${streamIndex}`;

        if (mediaType === 'vod') {
          if (!vodCatMap.has(categoryId)) {
            vodCatMap.set(categoryId, categoryName);
          }
          vodStreams.push({
            num: streamIndex,
            stream_id: `m3u_${streamIndex}`,
            name,
            stream_icon: currentMeta.logo,
            category_id: categoryId,
            direct_source: streamUrl,
            container_extension: this.extractExtension(streamUrl)
          });
        } else if (mediaType === 'series') {
          if (!seriesCatMap.has(categoryId)) {
            seriesCatMap.set(categoryId, categoryName);
          }
          seriesStreams.push({
            num: streamIndex,
            series_id: `m3u_s_${streamIndex}`,
            name,
            cover: currentMeta.logo,
            category_id: categoryId,
            genre: categoryName
          });
        } else {
          // Default: Live stream
          if (!liveCatMap.has(categoryId)) {
            liveCatMap.set(categoryId, categoryName);
          }
          liveStreams.push({
            num: streamIndex,
            stream_id: `m3u_${streamIndex}`,
            name,
            stream_icon: currentMeta.logo,
            epg_channel_id: currentMeta.tvgId || currentMeta.tvgName,
            category_id: categoryId,
            direct_source: streamUrl
          });
        }

        streamIndex++;
        currentMeta = null;
      }
    }

    const liveCategories: Category[] = Array.from(liveCatMap.entries()).map(([id, name]) => ({
      category_id: id,
      category_name: name
    }));

    const vodCategories: Category[] = Array.from(vodCatMap.entries()).map(([id, name]) => ({
      category_id: id,
      category_name: name
    }));

    const seriesCategories: Category[] = Array.from(seriesCatMap.entries()).map(([id, name]) => ({
      category_id: id,
      category_name: name
    }));

    return {
      liveCategories,
      vodCategories,
      seriesCategories,
      liveStreams,
      vodStreams,
      seriesStreams
    };
  }

  private static parseExtInf(line: string) {
    // #EXTINF:-1 tvg-id="Rai1.it" tvg-name="Rai 1 HD" tvg-logo="http://..." group-title="Nazionali",Rai 1 HD
    const commaIdx = line.lastIndexOf(',');
    const title = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : '';

    const tvgIdMatch = line.match(/tvg-id=["'](.*?)["']/i);
    const tvgNameMatch = line.match(/tvg-name=["'](.*?)["']/i);
    const logoMatch = line.match(/tvg-logo=["'](.*?)["']/i);
    const groupMatch = line.match(/group-title=["'](.*?)["']/i);

    return {
      name: title,
      tvgId: tvgIdMatch ? tvgIdMatch[1] : undefined,
      tvgName: tvgNameMatch ? tvgNameMatch[1] : undefined,
      logo: logoMatch ? logoMatch[1] : undefined,
      group: groupMatch ? groupMatch[1] : undefined
    };
  }

  private static detectMediaType(group: string, url: string, name: string = ''): MediaType {
    const g = (group || '').toLowerCase();
    const u = (url || '').toLowerCase();
    const n = (name || '').toLowerCase();

    // 1. Definite Series Patterns in title, group or URL
    const seriesPattern = /(?:s\d{1,2}\s*[ex]\s*\d{1,2}|\b\d{1,2}x\d{1,2}\b|\bstagione\s*\d+|\bseason\s*\d+|\bepisod[io]\s*\d+|\bep\s*\d+)/i;
    const seriesKeywords = /(serie|series|serial|tv-show|stagione|season|fiction|sitcom|anime|dramacool)/i;

    if (
      seriesPattern.test(n) ||
      seriesPattern.test(g) ||
      seriesKeywords.test(g) ||
      u.includes('/series/') ||
      u.includes('series_id')
    ) {
      return 'series';
    }

    // 2. Definite Movie / VOD
    if (
      g.includes('movie') ||
      g.includes('film') ||
      g.includes('vod') ||
      g.includes('cinema') ||
      u.includes('/movie/') ||
      u.endsWith('.mp4') ||
      u.endsWith('.mkv') ||
      u.endsWith('.avi')
    ) {
      return 'vod';
    }

    return 'live';
  }

  private static extractExtension(url: string): string {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('.');
      if (parts.length > 1) {
        return parts.pop() || 'mp4';
      }
    } catch {}
    return 'mp4';
  }

  private static slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'cat_gen';
  }
}
