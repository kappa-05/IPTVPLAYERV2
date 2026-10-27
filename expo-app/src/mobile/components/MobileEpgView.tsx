import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Account, Category, EPGChannelSchedule, LiveStream } from '../../types';

interface MobileEpgViewProps {
  account: Account;
  channels: LiveStream[];
  categories: Category[];
  epgMap: Record<string, EPGChannelSchedule>;
  onLoadEpg: (channel: LiveStream) => Promise<EPGChannelSchedule | null>;
  onPlayChannel: (channel: LiveStream) => void;
}

export const MobileEpgView: React.FC<MobileEpgViewProps> = ({
  account,
  channels,
  categories,
  epgMap,
  onLoadEpg,
  onPlayChannel
}) => {
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Filter channels
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchCat = selectedCatId === 'all' || String(ch.category_id) === selectedCatId;
      const matchSearch = !search.trim() || ch.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCatId, search]);

  // Set default selected channel
  useEffect(() => {
    if (!selectedChannel && filteredChannels.length > 0) {
      selectChannel(filteredChannels[0]);
    } else if (selectedChannel && !filteredChannels.some(c => String(c.stream_id) === String(selectedChannel.stream_id))) {
      if (filteredChannels.length > 0) {
        selectChannel(filteredChannels[0]);
      } else {
        setSelectedChannel(null);
      }
    }
  }, [filteredChannels]);

  const selectChannel = async (ch: LiveStream) => {
    setSelectedChannel(ch);
    const sid = String(ch.stream_id);
    if (!epgMap[sid]) {
      setLoadingSchedule(true);
      try {
        await onLoadEpg(ch);
      } finally {
        setLoadingSchedule(false);
      }
    }
  };

  const currentSchedule: EPGChannelSchedule | null = selectedChannel
    ? epgMap[String(selectedChannel.stream_id)] || null
    : null;

  return (
    <View style={styles.container}>
      {/* Category Filter Pills */}
      <View style={styles.catBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          <TouchableOpacity
            style={[styles.catPill, selectedCatId === 'all' && styles.catPillActive]}
            onPress={() => setSelectedCatId('all')}
          >
            <Text style={[styles.catPillText, selectedCatId === 'all' && styles.catPillTextActive]}>
              Tutti ({channels.length})
            </Text>
          </TouchableOpacity>

          {categories.map(cat => (
            <TouchableOpacity
              key={cat.category_id}
              style={[styles.catPill, selectedCatId === cat.category_id && styles.catPillActive]}
              onPress={() => setSelectedCatId(cat.category_id)}
            >
              <Text style={[styles.catPillText, selectedCatId === cat.category_id && styles.catPillTextActive]}>
                {cat.category_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Horizontal Channel Carousel */}
      <View style={styles.channelStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelScroll}>
          {filteredChannels.slice(0, 50).map(ch => {
            const sid = String(ch.stream_id);
            const isSelected = selectedChannel ? String(selectedChannel.stream_id) === sid : false;

            return (
              <TouchableOpacity
                key={sid}
                style={[styles.channelChip, isSelected && styles.channelChipActive]}
                onPress={() => selectChannel(ch)}
                activeOpacity={0.7}
              >
                <View style={styles.chipLogoWrapper}>
                  {ch.stream_icon ? (
                    <Image source={{ uri: ch.stream_icon }} style={styles.chipLogo} resizeMode="contain" />
                  ) : (
                    <Ionicons name="tv-outline" size={14} color={colors.textSecondary} />
                  )}
                </View>
                <Text style={[styles.chipName, isSelected && styles.chipNameActive]} numberOfLines={1}>
                  {ch.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected Channel Banner */}
      {selectedChannel && (
        <View style={styles.selectedBanner}>
          <View style={styles.bannerLeft}>
            <View style={styles.bannerLogoWrapper}>
              {selectedChannel.stream_icon ? (
                <Image source={{ uri: selectedChannel.stream_icon }} style={styles.bannerLogo} resizeMode="contain" />
              ) : (
                <Ionicons name="tv-outline" size={20} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerChannelName} numberOfLines={1}>
                {selectedChannel.name}
              </Text>
              <Text style={styles.bannerMeta}>
                {currentSchedule ? `${currentSchedule.listings.length} eventi in programma` : 'Guida TV'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.watchNowBtn}
            onPress={() => onPlayChannel(selectedChannel)}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={styles.watchNowText}>Guarda</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Programs List */}
      {loadingSchedule && !currentSchedule ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Caricamento programmazione...</Text>
        </View>
      ) : currentSchedule && currentSchedule.listings.length > 0 ? (
        <ScrollView style={styles.programsScroll} showsVerticalScrollIndicator={false}>
          {currentSchedule.listings.map((prog, index) => {
            const isNow = prog.nowPlaying;

            return (
              <TouchableOpacity
                key={String(prog.id || index)}
                style={[styles.programCard, isNow && styles.programCardNow]}
                onPress={() => selectedChannel && onPlayChannel(selectedChannel)}
                activeOpacity={0.7}
              >
                {/* Time Box */}
                <View style={styles.timeBox}>
                  <Text style={[styles.timeStart, isNow && styles.timeStartNow]}>
                    {prog.start}
                  </Text>
                  <Text style={styles.timeEnd}>{prog.end}</Text>
                </View>

                {/* Info */}
                <View style={styles.programDetails}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.programTitle, isNow && styles.programTitleNow]} numberOfLines={1}>
                      {prog.title}
                    </Text>
                    {isNow && (
                      <View style={styles.badgeNow}>
                        <View style={styles.dotNow} />
                        <Text style={styles.textNow}>ORA</Text>
                      </View>
                    )}
                  </View>

                  {isNow && prog.progressPercent !== undefined && (
                    <View style={styles.progressRow}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: `${prog.progressPercent}%` }]} />
                      </View>
                      <Text style={styles.progressPercentText}>{prog.progressPercent}%</Text>
                    </View>
                  )}

                  {prog.description ? (
                    <Text style={styles.programDesc} numberOfLines={2}>
                      {prog.description}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.centerContainer}>
          <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nessun palinsesto disponibile</Text>
          <Text style={styles.emptySub}>Il fornitore non ha pubblicato dati EPG per questo canale.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  catBar: {
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 6
  },
  catScroll: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center'
  },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  catPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: colors.primary
  },
  catPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  catPillTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  channelStrip: {
    backgroundColor: '#0c0f17',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  channelScroll: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center'
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160
  },
  channelChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.primary
  },
  chipLogoWrapper: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  chipLogo: {
    width: 18,
    height: 18
  },
  chipName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  chipNameActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10
  },
  bannerLogoWrapper: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  bannerLogo: {
    width: 32,
    height: 32
  },
  bannerInfo: {
    flex: 1
  },
  bannerChannelName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  bannerMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1
  },
  watchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  watchNowText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  programsScroll: {
    flex: 1,
    padding: 12
  },
  programCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
    gap: 10
  },
  programCardNow: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: 'rgba(59, 130, 246, 0.08)'
  },
  timeBox: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  timeStart: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  timeStartNow: {
    color: colors.primary
  },
  timeEnd: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2
  },
  programDetails: {
    flex: 1
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6
  },
  programTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  programTitleNow: {
    color: '#fff',
    fontWeight: '700'
  },
  badgeNow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentGreen,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3
  },
  dotNow: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#052e16'
  },
  textNow: {
    color: '#052e16',
    fontSize: 9,
    fontWeight: '800'
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 1.5,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.accentGreen
  },
  progressPercentText: {
    color: colors.accentGreen,
    fontSize: 9,
    fontWeight: '700'
  },
  programDesc: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 10
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 12
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260
  }
});
