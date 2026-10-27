import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Account, Category, EPGChannelSchedule, EPGProgram, LiveStream } from '../types';

interface EpgGuideViewProps {
  account: Account;
  channels: LiveStream[];
  categories: Category[];
  epgMap: Record<string, EPGChannelSchedule>;
  onLoadEpg: (channel: LiveStream) => Promise<EPGChannelSchedule | null>;
  onPlayChannel: (channel: LiveStream) => void;
}

export const EpgGuideView: React.FC<EpgGuideViewProps> = ({
  account,
  channels,
  categories,
  epgMap,
  onLoadEpg,
  onPlayChannel
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Filter channels by category and search term
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchCat = selectedCategoryId === 'all' || String(ch.category_id) === selectedCategoryId;
      const matchSearch = channelSearch.trim() === '' || ch.name.toLowerCase().includes(channelSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCategoryId, channelSearch]);

  // Set default selected channel
  useEffect(() => {
    if (!selectedChannel && filteredChannels.length > 0) {
      handleSelectChannel(filteredChannels[0]);
    } else if (selectedChannel && !filteredChannels.some(c => String(c.stream_id) === String(selectedChannel.stream_id))) {
      if (filteredChannels.length > 0) {
        handleSelectChannel(filteredChannels[0]);
      } else {
        setSelectedChannel(null);
      }
    }
  }, [filteredChannels]);

  const handleSelectChannel = async (channel: LiveStream) => {
    setSelectedChannel(channel);
    const sid = String(channel.stream_id);
    if (!epgMap[sid]) {
      setLoadingSchedule(true);
      try {
        await onLoadEpg(channel);
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
      {/* Category Filter Bar */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <TouchableOpacity
            style={[styles.catPill, selectedCategoryId === 'all' && styles.catPillActive]}
            onPress={() => setSelectedCategoryId('all')}
          >
            <Text style={[styles.catPillText, selectedCategoryId === 'all' && styles.catPillTextActive]}>
              Tutti ({channels.length})
            </Text>
          </TouchableOpacity>

          {categories.map(cat => (
            <TouchableOpacity
              key={cat.category_id}
              style={[styles.catPill, selectedCategoryId === cat.category_id && styles.catPillActive]}
              onPress={() => setSelectedCategoryId(cat.category_id)}
            >
              <Text
                style={[
                  styles.catPillText,
                  selectedCategoryId === cat.category_id && styles.catPillTextActive
                ]}
              >
                {cat.category_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main Split View: Left Channel List, Right Guide Schedule */}
      <View style={[styles.mainLayout, isMobile && styles.mainLayoutMobile]}>
        {/* Left Column: Channels List */}
        <View style={[styles.channelColumn, isMobile && styles.channelColumnMobile]}>
          {/* Channel Search Input */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca canale..."
              placeholderTextColor={colors.textMuted}
              value={channelSearch}
              onChangeText={setChannelSearch}
            />
            {channelSearch.length > 0 && (
              <TouchableOpacity onPress={() => setChannelSearch('')}>
                <Ionicons name="close-circle" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Channel Vertical Scroll */}
          <ScrollView style={styles.channelScroll} showsVerticalScrollIndicator={false}>
            {filteredChannels.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nessun canale trovato</Text>
              </View>
            ) : (
              filteredChannels.map(ch => {
                const sid = String(ch.stream_id);
                const isSelected = selectedChannel ? String(selectedChannel.stream_id) === sid : false;
                const sched = epgMap[sid];
                const nowProg = sched?.current;

                return (
                  <TouchableOpacity
                    key={sid}
                    style={[styles.channelItem, isSelected && styles.channelItemActive]}
                    onPress={() => handleSelectChannel(ch)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.chLogoWrapper}>
                      {ch.stream_icon ? (
                        <Image
                          source={{ uri: ch.stream_icon }}
                          style={styles.chLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <Ionicons name="tv-outline" size={18} color={colors.textSecondary} />
                      )}
                    </View>

                    <View style={styles.chTextContainer}>
                      <Text
                        style={[styles.chName, isSelected && styles.chNameActive]}
                        numberOfLines={1}
                      >
                        {ch.name}
                      </Text>
                      <Text style={styles.chProgSnippet} numberOfLines={1}>
                        {nowProg ? nowProg.title : 'Programma in corso'}
                      </Text>
                    </View>

                    {isSelected && (
                      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Right Column: Detailed Program Schedule for Selected Channel */}
        <View style={styles.scheduleColumn}>
          {selectedChannel ? (
            <View style={styles.scheduleWrapper}>
              {/* Channel Header Banner */}
              <View style={styles.scheduleHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.largeLogoWrapper}>
                    {selectedChannel.stream_icon ? (
                      <Image
                        source={{ uri: selectedChannel.stream_icon }}
                        style={styles.largeLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons name="tv-outline" size={26} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={styles.headerChannelName} numberOfLines={1}>
                      {selectedChannel.name}
                    </Text>
                    <View style={styles.headerMetaRow}>
                      <View style={styles.liveBadge}>
                        <View style={styles.liveRedDot} />
                        <Text style={styles.liveBadgeText}>DIRETTA TV</Text>
                      </View>
                      {currentSchedule && (
                        <Text style={styles.metaProgCount}>
                          {currentSchedule.listings.length} eventi in palinsesto
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Direct Play Button */}
                <TouchableOpacity
                  style={styles.playNowBtn}
                  onPress={() => onPlayChannel(selectedChannel)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={15} color="#fff" />
                  <Text style={styles.playNowBtnText}>Guarda Ora</Text>
                </TouchableOpacity>
              </View>

              {/* Programs List */}
              {loadingSchedule && !currentSchedule ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Caricamento guida TV in corso...</Text>
                </View>
              ) : currentSchedule && currentSchedule.listings.length > 0 ? (
                <ScrollView style={styles.programListScroll} showsVerticalScrollIndicator={false}>
                  {currentSchedule.listings.map((prog, index) => {
                    const isNow = prog.nowPlaying;

                    return (
                      <View
                        key={String(prog.id || index)}
                        style={[styles.programCard, isNow && styles.programCardNow]}
                      >
                        <View style={styles.timeBox}>
                          <Text style={[styles.timeStart, isNow && styles.timeStartNow]}>
                            {prog.start}
                          </Text>
                          <Text style={styles.timeEnd}>{prog.end}</Text>
                        </View>

                        <View style={styles.progDetails}>
                          <View style={styles.progTitleRow}>
                            <Text
                              style={[styles.progTitle, isNow && styles.progTitleNow]}
                              numberOfLines={1}
                            >
                              {prog.title}
                            </Text>
                            {isNow && (
                              <View style={styles.inOndaBadge}>
                                <Text style={styles.inOndaText}>ORA IN ONDA</Text>
                              </View>
                            )}
                          </View>

                          {/* Progress Bar for Current Program */}
                          {isNow && prog.progressPercent !== undefined && (
                            <View style={styles.progressRow}>
                              <View style={styles.progressTrack}>
                                <View
                                  style={[
                                    styles.progressBar,
                                    { width: `${prog.progressPercent}%` }
                                  ]}
                                />
                              </View>
                              <Text style={styles.progressPctText}>
                                {prog.progressPercent}%
                              </Text>
                            </View>
                          )}

                          {prog.description ? (
                            <Text
                              style={[styles.progDesc, isNow && styles.progDescNow]}
                              numberOfLines={isNow ? 3 : 2}
                            >
                              {prog.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.emptySchedule}>
                  <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyScheduleText}>
                    Nessun programma disponibile per questo canale
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noChannelSelected}>
              <Ionicons name="tv-outline" size={40} color={colors.textMuted} />
              <Text style={styles.noChannelText}>Seleziona un canale per visualizzare la guida TV</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  categoryBar: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary
  },
  categoryScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  catPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.primary
  },
  catPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  catPillTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row'
  },
  mainLayoutMobile: {
    flexDirection: 'column'
  },
  channelColumn: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    display: 'flex',
    flexDirection: 'column'
  },
  channelColumnMobile: {
    width: '100%',
    maxHeight: 220,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    margin: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    padding: 0
  },
  channelScroll: {
    flex: 1,
    paddingHorizontal: 12
  },
  emptyState: {
    padding: 24,
    alignItems: 'center'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  channelItemActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.08)'
  },
  chLogoWrapper: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  chLogo: {
    width: 30,
    height: 30
  },
  chTextContainer: {
    flex: 1
  },
  chName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600'
  },
  chNameActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  chProgSnippet: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  scheduleColumn: {
    flex: 1,
    backgroundColor: colors.background
  },
  scheduleWrapper: {
    flex: 1
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12
  },
  largeLogoWrapper: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  largeLogo: {
    width: 38,
    height: 38
  },
  headerInfo: {
    flex: 1
  },
  headerChannelName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3
  },
  liveRedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accentRed
  },
  liveBadgeText: {
    color: colors.accentRed,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  metaProgCount: {
    color: colors.textMuted,
    fontSize: 11
  },
  playNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6
  },
  playNowBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  loadingContainer: {
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
  programListScroll: {
    flex: 1,
    padding: 16
  },
  programCard: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8
  },
  programCardNow: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: 'rgba(59, 130, 246, 0.07)'
  },
  timeBox: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  timeStart: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  timeStartNow: {
    color: colors.primary
  },
  timeEnd: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  progDetails: {
    flex: 1
  },
  progTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4
  },
  progTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  progTitleNow: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  inOndaBadge: {
    backgroundColor: colors.accentGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3
  },
  inOndaText: {
    color: '#052e16',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.accentGreen
  },
  progressPctText: {
    color: colors.accentGreen,
    fontSize: 10,
    fontWeight: '700'
  },
  progDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  progDescNow: {
    color: colors.textSecondary
  },
  emptySchedule: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12
  },
  emptyScheduleText: {
    color: colors.textMuted,
    fontSize: 13
  },
  noChannelSelected: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12
  },
  noChannelText: {
    color: colors.textMuted,
    fontSize: 13
  }
});
