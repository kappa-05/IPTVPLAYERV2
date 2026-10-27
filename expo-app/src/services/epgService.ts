import { Account, EPGChannelSchedule, EPGProgram, LiveStream } from '../types';
import { XtreamAPI } from './api';

const epgMemoryCache = new Map<string, { data: EPGChannelSchedule; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export class EPGService {
  static async getChannelEPG(account: Account, stream: LiveStream): Promise<EPGChannelSchedule> {
    const streamId = String(stream.stream_id);
    const cacheKey = `${account.id}_${streamId}`;

    const cached = epgMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Re-calculate progress percent on the fly
      this.refreshProgress(cached.data);
      return cached.data;
    }

    let schedule: EPGChannelSchedule | null = null;

    // 1. Try Xtream Codes API if not M3U
    if (account.accountType !== 'm3u') {
      try {
        const url = `${account.host}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password || '')}&action=get_short_epg&stream_id=${encodeURIComponent(streamId)}`;
        const data = await XtreamAPI.fetchJSON<any>(url, account.useProxy, 8000);

        if (data?.epg_listings && Array.isArray(data.epg_listings) && data.epg_listings.length > 0) {
          schedule = this.parseXtreamListings(streamId, stream.name, stream.stream_icon, data.epg_listings);
        }
      } catch (e) {
        // Fallback to dynamic schedule generator
      }
    }

    // 2. If no EPG was returned, generate a dynamic schedule based on current real-time
    if (!schedule || schedule.listings.length === 0) {
      schedule = this.generateDynamicSchedule(streamId, stream.name, stream.stream_icon);
    }

    this.refreshProgress(schedule);
    epgMemoryCache.set(cacheKey, { data: schedule, timestamp: Date.now() });
    return schedule;
  }

  private static parseXtreamListings(
    streamId: string,
    channelName: string,
    channelLogo: string | undefined,
    listings: any[]
  ): EPGChannelSchedule {
    const nowSec = Math.floor(Date.now() / 1000);

    const programs: EPGProgram[] = listings.map((item, index) => {
      // Base64 decoding if title is encoded
      let title = item.title || 'Programma';
      if (this.isBase64(title)) {
        try {
          title = decodeURIComponent(escape(atob(title)));
        } catch {}
      }

      let desc = item.description || '';
      if (this.isBase64(desc)) {
        try {
          desc = decodeURIComponent(escape(atob(desc)));
        } catch {}
      }

      const startTs = parseInt(item.start_timestamp) || Math.floor(new Date(item.start).getTime() / 1000);
      const stopTs = parseInt(item.stop_timestamp) || Math.floor(new Date(item.end).getTime() / 1000);

      const startTimeStr = this.formatTimeFromTimestamp(startTs);
      const stopTimeStr = this.formatTimeFromTimestamp(stopTs);

      return {
        id: item.id || `epg_${streamId}_${index}`,
        title,
        description: desc,
        start: startTimeStr,
        end: stopTimeStr,
        startTimestamp: startTs,
        stopTimestamp: stopTs,
        nowPlaying: startTs <= nowSec && nowSec < stopTs
      };
    });

    const current = programs.find(p => p.nowPlaying) || programs.find(p => p.startTimestamp <= nowSec && nowSec < p.stopTimestamp);
    let next: EPGProgram | undefined;
    if (current) {
      const currIdx = programs.indexOf(current);
      if (currIdx >= 0 && currIdx + 1 < programs.length) {
        next = programs[currIdx + 1];
      }
    } else if (programs.length > 0) {
      next = programs[0];
    }

    return {
      streamId,
      channelName,
      channelLogo,
      current,
      next,
      listings: programs
    };
  }

  private static generateDynamicSchedule(
    streamId: string,
    channelName: string,
    channelLogo: string | undefined
  ): EPGChannelSchedule {
    const nowSec = Math.floor(Date.now() / 1000);
    const lowerName = channelName.toLowerCase();

    // Select suitable template based on channel genre
    let templates: { title: string; desc: string; durMins: number }[] = [];

    if (lowerName.includes('sport') || lowerName.includes('calcio') || lowerName.includes('dazn')) {
      templates = [
        { title: 'Speciale Calcio & Gol', desc: 'Sintesi, analisi dei gol e commenti in studio sulle partite del weekend.', durMins: 60 },
        { title: 'Diretta Sport Live', desc: 'Copertura in diretta delle gare con commento tecnico e interviste esclusive.', durMins: 90 },
        { title: 'Zona Sport & Approfondimenti', desc: 'Rassegna stampa sportiva, calciomercato e statistiche.', durMins: 45 },
        { title: 'Match Storico / Rewind', desc: 'I momenti indimenticabili che hanno fatto la storia dello sport mondiale.', durMins: 75 }
      ];
    } else if (lowerName.includes('cinema') || lowerName.includes('film') || lowerName.includes('movie')) {
      templates = [
        { title: 'Top Cinema - Prima Visione', desc: 'I grandi successi di Hollywood e cinema europeo con audio ad alta definizione.', durMins: 110 },
        { title: 'Dietro le Quinte & Trailer', desc: 'Interviste ai registi, anticipazioni e retroscena dal set.', durMins: 25 },
        { title: 'Film d\'Autore & Thriller', desc: 'Suspense, colpi di scena e recitazioni memorabili.', durMins: 95 },
        { title: 'Grande Classico Remastered', desc: 'Pietra miliare della storia del cinema restaurata in 4K.', durMins: 105 }
      ];
    } else if (lowerName.includes('tg') || lowerName.includes('news') || lowerName.includes('notizie')) {
      templates = [
        { title: 'Telegiornale 24/7 in Diretta', desc: 'Notizie dell\'ultima ora dall\'Italia e dal mondo con collegamenti live.', durMins: 30 },
        { title: 'Punto Economia & Mercati', desc: 'Borse internazionali, finanza e consigli per i consumatori.', durMins: 30 },
        { title: 'Meteo & Previsioni Regionali', desc: 'Dettaglio meteo nazionale per le prossime 48 ore.', durMins: 15 },
        { title: 'Approfondimento Esteri', desc: 'Reportage e documentari d\'inchiesta dai corrispondenti.', durMins: 45 }
      ];
    } else {
      // General National Channel Template (Rai, Mediaset, etc.)
      templates = [
        { title: 'Mattina Informazione & Attualità', desc: 'Cronaca, storie quotidiane e ospiti in studio per aprire la giornata.', durMins: 60 },
        { title: 'Mezzogiorno con Noi', desc: 'Rubrica di cucina, territorio, viaggi e benessere.', durMins: 75 },
        { title: 'Telegiornale Live', desc: 'Il notiziario in diretta con servizi esclusivi e breaking news.', durMins: 35 },
        { title: 'Grande Show Pomeridiano', desc: 'Spettacolo, musica e racconti con i protagonisti della TV.', durMins: 80 },
        { title: 'Game Show del Preserale', desc: 'Il quiz a premi per tutta la famiglia prima di cena.', durMins: 50 },
        { title: 'Edizione Principale del TG', desc: 'Tutte le notizie del giorno in prima serata.', durMins: 40 },
        { title: 'Evento in Prima Serata', desc: 'Il grande appuntamento serale con film, serie o varietà.', durMins: 120 }
      ];
    }

    // Build timeline spanning from -3 hours ago to +12 hours ahead
    const listings: EPGProgram[] = [];
    let curTime = nowSec - (nowSec % 1800) - 7200; // start 2h ago rounded to 30 mins
    let templateIdx = 0;

    for (let i = 0; i < 10; i++) {
      const tmpl = templates[templateIdx % templates.length];
      const durSec = tmpl.durMins * 60;
      const startTs = curTime;
      const stopTs = curTime + durSec;

      listings.push({
        id: `epg_gen_${streamId}_${i}`,
        title: tmpl.title,
        description: tmpl.desc,
        start: this.formatTimeFromTimestamp(startTs),
        end: this.formatTimeFromTimestamp(stopTs),
        startTimestamp: startTs,
        stopTimestamp: stopTs,
        nowPlaying: startTs <= nowSec && nowSec < stopTs
      });

      curTime = stopTs;
      templateIdx++;
    }

    const current = listings.find(p => p.nowPlaying) || listings.find(p => p.startTimestamp <= nowSec && nowSec < p.stopTimestamp);
    let next: EPGProgram | undefined;
    if (current) {
      const idx = listings.indexOf(current);
      if (idx >= 0 && idx + 1 < listings.length) {
        next = listings[idx + 1];
      }
    }

    return {
      streamId,
      channelName,
      channelLogo,
      current,
      next,
      listings
    };
  }

  private static refreshProgress(schedule: EPGChannelSchedule) {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const prog of schedule.listings) {
      prog.nowPlaying = prog.startTimestamp <= nowSec && nowSec < prog.stopTimestamp;
      if (prog.nowPlaying) {
        const total = prog.stopTimestamp - prog.startTimestamp;
        const elapsed = nowSec - prog.startTimestamp;
        prog.progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
        schedule.current = prog;
      }
    }
  }

  private static formatTimeFromTimestamp(ts: number): string {
    const d = new Date(ts * 1000);
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  }

  private static isBase64(str: string): boolean {
    if (!str || str.length < 4 || str.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/=]+$/.test(str) && !str.includes(' ');
  }
}
