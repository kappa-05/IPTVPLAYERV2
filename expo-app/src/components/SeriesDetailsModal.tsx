import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Account, SeriesDetails, SeriesEpisode, SeriesItem } from '../types';
import { XtreamAPI } from '../services/api';

interface SeriesDetailsModalProps {
  visible: boolean;
  seriesItem: SeriesItem | null;
  account: Account | null;
  onClose: () => void;
  onPlayEpisode: (episode: SeriesEpisode, seasonNum: number | string, seriesName: string, cover?: string) => void;
}

export const SeriesDetailsModal: React.FC<SeriesDetailsModalProps> = ({
  visible,
  seriesItem,
  account,
  onClose,
  onPlayEpisode
}) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | string>(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && seriesItem && account) {
      loadSeriesDetails();
    } else {
      setDetails(null);
      setLoading(true);
      setError(null);
    }
  }, [visible, seriesItem]);

  const loadSeriesDetails = async () => {
    if (!seriesItem || !account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await XtreamAPI.getSeriesInfo(account, seriesItem.series_id);
      setDetails(data);
      if (data?.seasons && data.seasons.length > 0) {
        setSelectedSeason(data.seasons[0].season_number || 1);
      } else {
        setSelectedSeason(1);
      }
    } catch (e: any) {
      setError(e.message || 'Impossibile caricare i dettagli della serie');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !seriesItem) return null;

  const episodes = details?.episodes?.[String(selectedSeason)] || [];
  const info = details?.info || {
    name: seriesItem.name,
    cover: seriesItem.cover,
    plot: seriesItem.plot,
    genre: seriesItem.genre,
    rating: String(seriesItem.rating || '')
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, isMobile ? styles.mobileCard : { maxHeight: height * 0.9 }]}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Caricamento serie...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.accentRed} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSeriesDetails}>
                <Text style={styles.retryBtnText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
                {info.cover ? (
                  <Image source={{ uri: info.cover }} style={styles.coverImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.coverImage, styles.coverFallback]}>
                    <Ionicons name="albums-outline" size={36} color={colors.textMuted} />
                  </View>
                )}

                <View style={styles.headerInfo}>
                  <Text style={styles.seriesTitle}>{info.name || seriesItem.name}</Text>
                  
                  <View style={styles.badgeRow}>
                    {info.genre ? (
                      <View style={styles.genreTag}>
                        <Text style={styles.genreTagText}>{info.genre}</Text>
                      </View>
                    ) : null}
                    {info.rating ? (
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={11} color={colors.accentAmber} />
                        <Text style={styles.ratingText}>{String(info.rating).slice(0, 3)}</Text>
                      </View>
                    ) : null}
                  </View>

                  {info.plot ? (
                    <Text style={styles.plotText} numberOfLines={isMobile ? 4 : 6}>
                      {info.plot}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Seasons Selector */}
              {details?.seasons && details.seasons.length > 0 && (
                <View style={styles.seasonsSection}>
                  <Text style={styles.sectionHeading}>Stagioni</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonsScroll}>
                    {details.seasons.map(s => {
                      const sNum = s.season_number || s.id;
                      const isSelected = String(selectedSeason) === String(sNum);
                      return (
                        <TouchableOpacity
                          key={String(s.id || sNum)}
                          style={[styles.seasonChip, isSelected && styles.seasonChipActive]}
                          onPress={() => setSelectedSeason(sNum)}
                        >
                          <Text style={[styles.seasonChipText, isSelected && styles.seasonChipTextActive]}>
                            {s.name || `Stagione ${sNum}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Episodes List */}
              <View style={styles.episodesSection}>
                <Text style={styles.sectionHeading}>
                  Episodi ({episodes.length})
                </Text>

                {episodes.length === 0 ? (
                  <Text style={styles.noEpisodesText}>Nessun episodio disponibile.</Text>
                ) : (
                  episodes.map(ep => {
                    return (
                      <TouchableOpacity
                        key={String(ep.id || ep.episode_num)}
                        style={styles.episodeRow}
                        onPress={() => onPlayEpisode(ep, selectedSeason, info.name, info.cover)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.epPlayCircle}>
                          <Ionicons name="play" size={14} color={colors.primary} />
                        </View>
                        <View style={styles.epContent}>
                          <Text style={styles.epTitle} numberOfLines={1}>
                            {ep.episode_num}. {ep.title || `Episodio ${ep.episode_num}`}
                          </Text>
                          {ep.info?.duration ? (
                            <Text style={styles.epDuration}>{ep.info.duration}</Text>
                          ) : null}
                        </View>
                        <View style={styles.playBadge}>
                          <Text style={styles.playBadgeText}>Riproduci</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    position: 'relative',
    overflow: 'hidden'
  },
  mobileCard: {
    maxHeight: '94%'
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  centerContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 10,
    fontSize: 13
  },
  errorText: {
    color: colors.accentRed,
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center'
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  contentScroll: {
    padding: 20
  },
  headerRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 18
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'center'
  },
  coverImage: {
    width: 130,
    height: 195,
    borderRadius: 6,
    backgroundColor: colors.surface
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerInfo: {
    flex: 1
  },
  seriesTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10
  },
  genreTag: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  genreTagText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  ratingText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700'
  },
  plotText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  seasonsSection: {
    marginBottom: 14
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  seasonsScroll: {
    gap: 6
  },
  seasonChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  seasonChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: 'rgba(59, 130, 246, 0.4)'
  },
  seasonChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500'
  },
  seasonChipTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  episodesSection: {
    marginTop: 6
  },
  noEpisodesText: {
    color: colors.textMuted,
    fontSize: 12
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 6,
    gap: 12
  },
  epPlayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  epContent: {
    flex: 1
  },
  epTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500'
  },
  epDuration: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  playBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4
  },
  playBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700'
  }
});
