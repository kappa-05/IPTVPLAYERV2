import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { MediaTrack } from '../../types';

interface TrackSelectionModalProps {
  visible: boolean;
  audioTracks: MediaTrack[];
  subtitleTracks: MediaTrack[];
  activeAudioTrack: number;
  activeSubtitleTrack: number;
  onSelectAudioTrack: (id: number) => void;
  onSelectSubtitleTrack: (id: number) => void;
  onClose: () => void;
}

export const TrackSelectionModal: React.FC<TrackSelectionModalProps> = ({
  visible,
  audioTracks,
  subtitleTracks,
  activeAudioTrack,
  activeSubtitleTrack,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'audio' | 'subtitles'>('audio');

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      {/* Tap backdrop to dismiss */}
      <TouchableOpacity
        style={styles.backdropTap}
        activeOpacity={1}
        onPress={onClose}
      />

      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="options-outline" size={20} color={colors.primary} />
            <Text style={styles.title}>Audio & Sottotitoli</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'audio' && styles.tabBtnActive]}
            onPress={() => setActiveTab('audio')}
          >
            <Ionicons
              name="volume-medium-outline"
              size={16}
              color={activeTab === 'audio' ? '#fff' : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'audio' && styles.tabTextActive]}>
              Audio ({audioTracks.length || 1})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'subtitles' && styles.tabBtnActive]}
            onPress={() => setActiveTab('subtitles')}
          >
            <Ionicons
              name="chatbox-outline"
              size={16}
              color={activeTab === 'subtitles' ? '#fff' : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'subtitles' && styles.tabTextActive]}>
              Sottotitoli ({subtitleTracks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* List Content */}
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {activeTab === 'audio' ? (
            audioTracks.length === 0 ? (
              <View style={styles.trackRowActive}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.trackLabelActive}>Traccia Principale (Stereo / Predefinita)</Text>
                  <Text style={styles.trackSub}>Audio originale del flusso</Text>
                </View>
              </View>
            ) : (
              audioTracks.map((tr) => {
                const isSelected = tr.active || tr.id === activeAudioTrack;
                return (
                  <TouchableOpacity
                    key={`audio_track_${tr.id}`}
                    style={[styles.trackRow, isSelected && styles.trackRowActive]}
                    onPress={() => onSelectAudioTrack(tr.id)}
                  >
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.trackDetails}>
                      <Text style={[styles.trackLabel, isSelected && styles.trackLabelActive]}>
                        {tr.label}
                      </Text>
                      {tr.language ? (
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagText}>{tr.language.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          ) : (
            <>
              {/* Off / None Option */}
              <TouchableOpacity
                style={[styles.trackRow, activeSubtitleTrack === -1 && styles.trackRowActive]}
                onPress={() => onSelectSubtitleTrack(-1)}
              >
                <Ionicons
                  name={activeSubtitleTrack === -1 ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={activeSubtitleTrack === -1 ? colors.primary : colors.textMuted}
                />
                <View style={styles.trackDetails}>
                  <Text style={[styles.trackLabel, activeSubtitleTrack === -1 && styles.trackLabelActive]}>
                    Disattivati (Nessun sottotitolo)
                  </Text>
                </View>
              </TouchableOpacity>

              {subtitleTracks.map((sub) => {
                const isSelected = sub.active || sub.id === activeSubtitleTrack;
                return (
                  <TouchableOpacity
                    key={`sub_track_${sub.id}`}
                    style={[styles.trackRow, isSelected && styles.trackRowActive]}
                    onPress={() => onSelectSubtitleTrack(sub.id)}
                  >
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.trackDetails}>
                      <Text style={[styles.trackLabel, isSelected && styles.trackLabelActive]}>
                        {sub.label}
                      </Text>
                      {sub.language ? (
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagText}>{sub.language.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3, 5, 8, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 60,
    padding: 20
  },
  backdropTap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#121724',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.7,
    shadowRadius: 36,
    elevation: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabsRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.32)'
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10
  },
  tabBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)'
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700'
  },
  listScroll: {
    maxHeight: 300
  },
  listContent: {
    padding: 12
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4
  },
  trackRowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  trackDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 12
  },
  trackLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1
  },
  trackLabelActive: {
    color: '#fff',
    fontWeight: '700'
  },
  trackSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8
  },
  tagText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '700'
  }
});

