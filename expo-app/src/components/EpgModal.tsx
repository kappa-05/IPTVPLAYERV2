import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { EPGChannelSchedule, EPGProgram } from '../types';

interface EpgModalProps {
  visible: boolean;
  schedule: EPGChannelSchedule | null;
  onClose: () => void;
  onPlayChannel: () => void;
}

export const EpgModal: React.FC<EpgModalProps> = ({
  visible,
  schedule,
  onClose,
  onPlayChannel
}) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  if (!visible || !schedule) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, isMobile ? styles.mobileCard : { maxHeight: height * 0.9 }]}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Channel Header Banner */}
          <View style={styles.channelHeader}>
            <View style={styles.channelHeaderLeft}>
              {schedule.channelLogo ? (
                <Image
                  source={{ uri: schedule.channelLogo }}
                  style={styles.channelLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.channelLogoFallback}>
                  <Ionicons name="tv-outline" size={24} color={colors.textSecondary} />
                </View>
              )}

              <View style={styles.channelInfo}>
                <Text style={styles.channelTitle} numberOfLines={1}>
                  {schedule.channelName}
                </Text>
                <View style={styles.liveMetaRow}>
                  <View style={styles.badgeLive}>
                    <View style={styles.liveRedDot} />
                    <Text style={styles.badgeLiveText}>GUIDA TV</Text>
                  </View>
                  <Text style={styles.programCountText}>
                    {schedule.listings.length} programmi
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.watchNowBtn}
              onPress={() => {
                onClose();
                onPlayChannel();
              }}
            >
              <Ionicons name="play" size={15} color="#fff" />
              <Text style={styles.watchNowBtnText}>Guarda Ora</Text>
            </TouchableOpacity>
          </View>

          {/* Program Listings */}
          <ScrollView style={styles.scheduleScroll} showsVerticalScrollIndicator={false}>
            {schedule.listings.map((prog, index) => {
              const isNow = prog.nowPlaying;

              return (
                <View
                  key={String(prog.id || index)}
                  style={[styles.programRow, isNow && styles.programRowNow]}
                >
                  {/* Time Column */}
                  <View style={styles.timeCol}>
                    <Text style={[styles.timeText, isNow && styles.timeTextNow]}>
                      {prog.start}
                    </Text>
                    <Text style={styles.timeEndText}>
                      {prog.end}
                    </Text>
                  </View>

                  {/* Content Column */}
                  <View style={styles.programContent}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.programTitle, isNow && styles.programTitleNow]} numberOfLines={1}>
                        {prog.title}
                      </Text>
                      {isNow && (
                        <View style={styles.nowBadge}>
                          <Text style={styles.nowBadgeText}>IN ONDA</Text>
                        </View>
                      )}
                    </View>

                    {/* Progress Bar for Current Program */}
                    {isNow && prog.progressPercent !== undefined && (
                      <View style={styles.progressContainer}>
                        <View style={styles.progressTrack}>
                          <View
                            style={[styles.progressBar, { width: `${prog.progressPercent}%` }]}
                          />
                        </View>
                        <Text style={styles.progressLabel}>
                          {prog.progressPercent}% completato
                        </Text>
                      </View>
                    )}

                    {prog.description ? (
                      <Text
                        style={[styles.programDesc, isNow && styles.programDescNow]}
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
    maxWidth: 680,
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
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  channelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10
  },
  channelLogo: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: colors.surface
  },
  channelLogoFallback: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  channelInfo: {
    flex: 1
  },
  channelTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  liveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3
  },
  liveRedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary
  },
  badgeLiveText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  programCountText: {
    color: colors.textMuted,
    fontSize: 11
  },
  watchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  watchNowBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  scheduleScroll: {
    padding: 16
  },
  programRow: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: 6
  },
  programRowNow: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderWidth: 1,
    borderBottomWidth: 1,
    marginVertical: 4
  },
  timeCol: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  timeTextNow: {
    color: colors.primary
  },
  timeEndText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  programContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4
  },
  programTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  programTitleNow: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  nowBadge: {
    backgroundColor: colors.accentGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3
  },
  nowBadgeText: {
    color: '#052e16',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 5
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
  progressLabel: {
    color: colors.accentGreen,
    fontSize: 10,
    fontWeight: '700'
  },
  programDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  programDescNow: {
    color: colors.textSecondary
  }
});
