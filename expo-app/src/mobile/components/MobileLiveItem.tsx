import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { EPGChannelSchedule, LiveStream } from '../../types';

interface MobileLiveItemProps {
  channel: LiveStream;
  isFavorite: boolean;
  epgSchedule?: EPGChannelSchedule | null;
  onPress: (channel: LiveStream) => void;
  onToggleFavorite: (channel: LiveStream) => void;
  onOpenEpg?: (channel: LiveStream) => void;
}

export const MobileLiveItem: React.FC<MobileLiveItemProps> = ({
  channel,
  isFavorite,
  epgSchedule,
  onPress,
  onToggleFavorite,
  onOpenEpg
}) => {
  const [imageError, setImageError] = useState(false);
  const iconUrl = (!imageError && channel.stream_icon) ? channel.stream_icon : null;
  const currentProg = epgSchedule?.current;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={() => onPress(channel)}
    >
      {/* Channel Logo */}
      <View style={styles.logoWrapper}>
        {iconUrl ? (
          <Image
            source={{ uri: iconUrl }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <Ionicons name="tv-outline" size={20} color={colors.textSecondary} />
        )}
      </View>

      {/* Channel Details */}
      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
        </View>

        {currentProg ? (
          <View style={styles.epgInfo}>
            <View style={styles.epgTitleRow}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>IN ONDA</Text>
              </View>
              <Text style={styles.epgTitle} numberOfLines={1}>
                {currentProg.title}
              </Text>
            </View>

            <View style={styles.timeTrackRow}>
              <Text style={styles.epgTime}>
                {currentProg.start} - {currentProg.end}
              </Text>
              {currentProg.progressPercent !== undefined && (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${currentProg.progressPercent}%` }]} />
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.fallbackMeta}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>DIRETTA</Text>
            </View>
            <Text style={styles.streamNum} numberOfLines={1}>
              {channel.stream_id ? `ID #${channel.stream_id}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Actions: EPG + Star */}
      <View style={styles.actions}>
        {onOpenEpg && (
          <TouchableOpacity
            style={styles.actionBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={(e) => {
              // @ts-ignore
              e?.stopPropagation?.();
              onOpenEpg(channel);
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            // @ts-ignore
            e?.stopPropagation?.();
            onToggleFavorite(channel);
          }}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={isFavorite ? colors.accentAmber : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
    marginHorizontal: 12
  },
  logoWrapper: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12
  },
  logo: {
    width: 36,
    height: 36
  },
  details: {
    flex: 1,
    justifyContent: 'center'
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3
  },
  channelName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  epgInfo: {
    gap: 3
  },
  epgTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentRed
  },
  liveText: {
    color: colors.accentRed,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  epgTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1
  },
  timeTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 1
  },
  epgTime: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500'
  },
  progressTrack: {
    flex: 1,
    maxWidth: 90,
    height: 3,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 1.5,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary
  },
  fallbackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  streamNum: {
    color: colors.textMuted,
    fontSize: 11
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6
  }
});
