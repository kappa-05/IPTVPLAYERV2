export type MediaType = 'live' | 'vod' | 'series';
export type NavTab = MediaType | 'favorites' | 'epg';

export interface Account {
  id: string;
  name?: string;
  accountType?: 'xtream' | 'm3u';
  m3uUrl?: string;
  host: string;
  username: string;
  password?: string;
  useProxy: boolean;
  expDate?: string;
  isTrial?: string | boolean;
  activeCons?: string | number;
  maxCons?: string | number;
  status?: string;
  createdAt: number;
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id?: number | string;
}

export interface LiveStream {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number | string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id?: string;
  direct_source?: string;
  custom_sid?: string;
  tv_archive?: number;
}

export interface VodStream {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number | string;
  stream_icon?: string;
  rating?: string | number;
  rating_5based?: number;
  added?: string;
  category_id?: string;
  container_extension?: string;
  direct_source?: string;
}

export interface SeriesItem {
  num?: number;
  name: string;
  series_id: number | string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string | number;
  rating_5based?: number;
  category_id?: string;
}

export interface SeriesSeason {
  id: number | string;
  name: string;
  season_number: number;
  episode_count?: number;
  air_date?: string;
}

export interface SeriesEpisode {
  id: string | number;
  episode_num: number | string;
  title: string;
  container_extension?: string;
  info?: {
    duration?: string;
    plot?: string;
    video?: any;
    audio?: any;
  };
  direct_source?: string;
}

export interface SeriesDetails {
  info: {
    name: string;
    cover?: string;
    plot?: string;
    genre?: string;
    rating?: string;
    director?: string;
    cast?: string;
  };
  seasons: SeriesSeason[];
  episodes: Record<string, SeriesEpisode[]>;
}

export interface FavoriteItem {
  favId: string;
  accountId: string;
  type: MediaType;
  streamId: string | number;
  title: string;
  icon?: string;
  categoryId?: string;
  rawItem: any;
}

export interface WatchHistoryItem {
  id: string;
  accountId: string;
  type: 'vod' | 'series';
  title: string;
  subTitle?: string;
  seriesName?: string;
  seasonNum?: number | string;
  episodeNum?: number | string;
  poster?: string;
  currentTime: number;
  duration: number;
  percent: number;
  updatedAt: number;
  rawItem?: any;
}

export interface PlayingStream {
  streamId: string | number;
  title: string;
  type: MediaType;
  streamUrl: string;
  subTitle?: string;
  poster?: string;
  extension?: string;
  rawItem?: any;
  epgSchedule?: EPGChannelSchedule | null;
}

export interface EPGProgram {
  id: string | number;
  title: string;
  description?: string;
  start: string;
  end: string;
  startTimestamp: number;
  stopTimestamp: number;
  progressPercent?: number;
  nowPlaying?: boolean;
}

export interface EPGChannelSchedule {
  streamId: string | number;
  channelName: string;
  channelLogo?: string;
  current?: EPGProgram;
  next?: EPGProgram;
  listings: EPGProgram[];
}
