
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '../theme/colors';
import {
  Account,
  MediaType,
  SeriesDetails,
  SeriesEpisode,
  SeriesItem,
  VodStream
} from '../types';
import { XtreamAPI } from '../services/api';

interface ContentDetailsScreenProps {
  account: Account | null;
  vodItem?: VodStream | null;
  seriesItem?: SeriesItem | null;
  isFavorite: boolean;
  resumeTime?: number;
  resumePercent?: number;
  onClose: () => void;
  onToggleFavorite: (item: any, type: MediaType) => void;
  onPlayVod: (item: VodStream, initialSeekTime?: number) => void;
  onPlayEpisode: (
    episode: SeriesEpisode,
    seasonNum: number | string,
    seriesName: string,
    cover?: string,
    seriesId?: string | number
  ) => void;
}

const getText = (value: any): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
};

export const ContentDetailsScreen: React.FC<ContentDetailsScreenProps> = ({
  account,
  vodItem,
  seriesItem,
  isFavorite,
  resumeTime,
  resumePercent,
  onClose,
  onToggleFavorite,
  onPlayVod,
  onPlayEpisode
}) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const isSeries = Boolean(seriesItem);
  const selectedItem = seriesItem || vodItem;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vodDetails, setVodDetails] = useState<any>(null);
  const [seriesDetails, setSeriesDetails] = useState<SeriesDetails | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | string>(1);

  const contentId = isSeries
    ? String(seriesItem?.series_id || '')
    : String(vodItem?.stream_id || '');

  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      if (!account || !selectedItem) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setVodDetails(null);
      setSeriesDetails(null);

      try {
        if (isSeries && seriesItem) {
          const result = await XtreamAPI.getSeriesInfo(
            account,
            seriesItem.series_id
          );

          if (!cancelled) {
            setSeriesDetails(result);

            if (result?.seasons?.length) {
              setSelectedSeason(
                result.seasons[0].season_number ||
                result.seasons[0].id ||
                1
              );
            }
          }
        } else if (vodItem) {
          const result = await XtreamAPI.getVodInfo(
            account,
            vodItem.stream_id
          );

          if (!cancelled) {
            setVodDetails(result);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message || 'Impossibile caricare i dettagli del contenuto.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [account, contentId, isSeries]);

  const info = useMemo(() => {
    if (isSeries && seriesItem) {
      return {
        name: seriesDetails?.info?.name || seriesItem.name,
        cover: seriesDetails?.info?.cover || seriesItem.cover,
        backdrop: undefined,
        plot: seriesDetails?.info?.plot || seriesItem.plot,
        genre: seriesDetails?.info?.genre || seriesItem.genre,
        rating: seriesDetails?.info?.rating || seriesItem.rating,
        director: seriesDetails?.info?.director || seriesItem.director,
        cast: seriesDetails?.info?.cast || seriesItem.cast,
        releaseDate: seriesItem.releaseDate
      };
    }

    const movieInfo = vodDetails?.info || {};
    const movieData = vodDetails?.movie_data || {};

    return {
      name: movieInfo.name || movieData.name || vodItem?.name,
      cover:
        movieInfo.movie_image ||
        movieInfo.cover_big ||
        movieInfo.stream_icon ||
        movieData.stream_icon ||
        vodItem?.stream_icon,
      backdrop:
        movieInfo.backdrop_path ||
        movieInfo.backdrop ||
        movieData.backdrop_path ||
        movieData.backdrop,
      plot: movieInfo.plot || movieInfo.description,
      genre: movieInfo.genre,
      rating: movieInfo.rating || movieInfo.rating_5based || vodItem?.rating,
      director: movieInfo.director,
      cast: movieInfo.cast,
      releaseDate:
        movieInfo.releaseDate ||
        movieInfo.releasedate ||
        movieInfo.release_date,
      duration: movieInfo.duration
    };
  }, [isSeries, seriesItem, seriesDetails, vodItem, vodDetails]);

  const episodes =
    seriesDetails?.episodes?.[String(selectedSeason)] || [];

  const rawBackdrop = info.backdrop;
  const backdropImage = Array.isArray(rawBackdrop)
    ? rawBackdrop[0]
    : rawBackdrop;

  const handlePlay = () => {
    if (vodItem) {
      onPlayVod(vodItem);
    }
  };

  const handleFavorite = () => {
    if (selectedItem) {
      onToggleFavorite(selectedItem, isSeries ? 'series' : 'vod');
    }
  };

  if (!selectedItem) return null;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { minHeight: isMobile ? 620 : Math.max(680, height * 0.88) }]}>
          {backdropImage ? (
            <ImageBackground
              source={{ uri: backdropImage }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={isMobile ? 1 : 0}
            />
          ) : null}

          <LinearGradient
            colors={[
              'rgba(8,8,8,0.22)',
              'rgba(8,8,8,0.62)',
              'rgba(8,8,8,0.94)',
              colors.background
            ]}
            locations={[0, 0.38, 0.76, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.topBar}>
            <Pressable
              style={styles.iconButton}
              onPress={onClose}
              accessibilityLabel="Torna indietro"
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>

            <Text style={styles.brand}>STREAMIX</Text>
          </View>

          <View style={[styles.heroContent, isMobile && styles.heroContentMobile]}>
            <View style={[styles.posterColumn, isMobile && styles.posterColumnMobile]}>
              {info.cover ? (
                <Image
                  source={{ uri: info.cover }}
                  style={styles.poster}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.poster, styles.posterFallback]}>
                  <Ionicons
                    name={isSeries ? 'tv-outline' : 'film-outline'}
                    size={48}
                    color={colors.textMuted}
                  />
                </View>
              )}
            </View>

            <View style={styles.detailsColumn}>
              <Text style={styles.contentType}>
                {isSeries ? 'SERIE TV' : 'FILM'}
              </Text>

              <Text style={[styles.title, isMobile && styles.titleMobile]}>
                {info.name || selectedItem.name}
              </Text>

              <View style={styles.metadataRow}>
                {info.releaseDate ? (
                  <Text style={styles.metadataText}>
                    {String(info.releaseDate).slice(0, 4)}
                  </Text>
                ) : null}

                {!isSeries && info.duration ? (
                  <View style={styles.rating}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.metadataText}>{info.duration}</Text>
                  </View>
                ) : null}

                {info.genre ? (
                  <Text style={styles.metadataText}>{info.genre}</Text>
                ) : null}

                {info.rating ? (
                  <View style={styles.rating}>
                    <Ionicons
                      name="star"
                      size={14}
                      color={colors.accentAmber}
                    />
                    <Text style={styles.ratingText}>
                      {String(info.rating).slice(0, 4)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {info.plot ? (
                <Text style={styles.plot} numberOfLines={isMobile ? 7 : 9}>
                  {info.plot}
                </Text>
              ) : (
                <Text style={styles.noDescription}>
                  Nessuna descrizione disponibile.
                </Text>
              )}

              {!isSeries ? (
                <View style={styles.actions}>
                  {resumeTime !== undefined && resumeTime > 15 ? (
                    <>
                      <Pressable
                        style={styles.playButton}
                        onPress={() => {
                          if (vodItem) onPlayVod(vodItem, resumeTime);
                        }}
                      >
                        <Ionicons name="play" size={19} color="#fff" />
                        <Text style={styles.playButtonText}>Riprendi</Text>
                        <View style={styles.resumeProgressTrack}>
                          <View
                            style={[
                              styles.resumeProgressFill,
                              {
                                width: `${Math.max(0, Math.min(100, resumePercent ?? 0))}%`
                              }
                            ]}
                          />
                        </View>
                      </Pressable>

                      <Pressable
                        style={[styles.secondaryButton, { marginTop: 0 }]}
                        onPress={() => {
                          if (vodItem) onPlayVod(vodItem, 0);
                        }}
                      >
                        <Ionicons name="refresh" size={19} color="#fff" />
                        <Text style={styles.secondaryButtonText}>Ricomincia</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={styles.playButton}
                      onPress={handlePlay}
                    >
                      <Ionicons name="play" size={19} color="#fff" />
                      <Text style={styles.playButtonText}>Riproduci</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.secondaryButton, { marginTop: 0 }]}
                    onPress={handleFavorite}
                  >
                    <Ionicons
                      name={isFavorite ? 'star' : 'star-outline'}
                      size={20}
                      color={isFavorite ? colors.accentAmber : '#fff'}
                    />
                    <Text style={styles.secondaryButtonText}>
                      {isFavorite ? 'Nei preferiti' : 'Aggiungi ai preferiti'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {isSeries ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleFavorite}
                >
                  <Ionicons
                    name={isFavorite ? 'star' : 'star-outline'}
                    size={20}
                    color={isFavorite ? colors.accentAmber : '#fff'}
                  />
                  <Text style={styles.secondaryButtonText}>
                    {isFavorite ? 'Nei preferiti' : 'Aggiungi ai preferiti'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.statusContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.statusText}>
                Caricamento dettagli...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.statusContainer}>
              <Ionicons
                name="alert-circle-outline"
                size={32}
                color={colors.accentRed}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <>
              {(info.director || info.cast || info.duration) ? (
                <View style={styles.credits}>
                  {info.director ? (
                    <View style={styles.creditRow}>
                      <Text style={styles.creditLabel}>Regia</Text>
                      <Text style={styles.creditValue}>{info.director}</Text>
                    </View>
                  ) : null}

                  {info.cast ? (
                    <View style={styles.creditRow}>
                      <Text style={styles.creditLabel}>Cast</Text>
                      <Text style={styles.creditValue}>{info.cast}</Text>
                    </View>
                  ) : null}

                  {info.duration ? (
                    <View style={styles.creditRow}>
                      <Text style={styles.creditLabel}>Durata</Text>
                      <Text style={styles.creditValue}>{info.duration}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isSeries ? (
                <View style={styles.episodesContainer}>
                  <Text style={styles.sectionTitle}>Episodi</Text>

                  {seriesDetails?.seasons?.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.seasonList}
                    >
                      {seriesDetails.seasons.map((season) => {
                        const seasonNumber =
                          season.season_number || season.id;

                        const active =
                          String(selectedSeason) === String(seasonNumber);

                        return (
                          <Pressable
                            key={String(season.id)}
                            style={[
                              styles.seasonButton,
                              active && styles.seasonButtonActive
                            ]}
                            onPress={() => setSelectedSeason(seasonNumber)}
                          >
                            <Text
                              style={[
                                styles.seasonText,
                                active && styles.seasonTextActive
                              ]}
                            >
                              {season.name || `Stagione ${seasonNumber}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}

                  {episodes.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Nessun episodio disponibile.
                    </Text>
                  ) : (
                    episodes.map((episode) => (
                      <Pressable
                        key={String(episode.id || episode.episode_num)}
                        style={styles.episode}
                        onPress={() =>
                          onPlayEpisode(
                            episode,
                            selectedSeason,
                            info.name || seriesItem?.name || 'Serie',
                            info.cover,
                            seriesItem?.series_id
                          )
                        }
                      >
                        <View style={styles.episodePlay}>
                          <Ionicons
                            name="play"
                            size={16}
                            color={colors.primary}
                          />
                        </View>

                        <View style={styles.episodeInfo}>
                          <Text style={styles.episodeTitle} numberOfLines={1}>
                            {episode.episode_num}. {episode.title}
                          </Text>
                          {episode.info?.duration ? (
                            <Text style={styles.episodeDuration}>
                              {episode.info.duration}
                            </Text>
                          ) : null}
                        </View>

                        <Ionicons
                          name="play-circle-outline"
                          size={24}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    backgroundColor: colors.background
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  hero: {
    width: '100%',
    justifyContent: 'space-between',
    position: 'relative',
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden'
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  topBar: {
    height: 72,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(30,30,30,0.85)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  brand: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3
  },
  heroContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
    gap: 54,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center'
  },
  heroContentMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 24
  },
  posterColumn: {
    width: 280,
    alignItems: 'center'
  },
  posterColumnMobile: {
    width: '100%'
  },
  poster: {
    width: 250,
    height: 375,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.38)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 18
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  detailsColumn: {
    flex: 1,
    maxWidth: 680
  },
  contentType: {
    color: colors.primaryHover,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12
  },
  title: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 56,
    letterSpacing: -1,
    marginBottom: 20
  },
  titleMobile: {
    fontSize: 29,
    lineHeight: 36,
    textAlign: 'center'
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18
  },
  metadataText: {
    color: colors.textSecondary,
    fontSize: 13
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  ratingText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  plot: {
    color: '#dedee2',
    fontSize: 15,
    lineHeight: 26,
    maxWidth: 680
  },
  noDescription: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic'
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 32
  },
  playButton: {
    minHeight: 52,
    width: 220,
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  resumeProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.24)'
  },
  resumeProgressFill: {
    height: 4,
    backgroundColor: '#ffffff'
  },
  secondaryButton: {
    minHeight: 52,
    width: 220,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 17,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(15,15,15,0.88)',
    alignSelf: 'flex-start',
    marginTop: 16
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600'
  },
  body: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 38,
    paddingBottom: 80
  },
  statusContainer: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13
  },
  errorText: {
    color: colors.accentRed,
    fontSize: 14,
    textAlign: 'center'
  },
  credits: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12
  },
  creditRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  creditLabel: {
    width: 80,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  creditValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  episodesContainer: {
    paddingTop: 28
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 22
  },
  seasonList: {
    gap: 9,
    paddingBottom: 18
  },
  seasonButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  seasonButtonActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary
  },
  seasonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  seasonTextActive: {
    color: colors.textPrimary
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 20
  },
  episode: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  episodePlay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  episodeInfo: {
    flex: 1,
    gap: 5
  },
  episodeTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  episodeDuration: {
    color: colors.textMuted,
    fontSize: 12
  }
});
