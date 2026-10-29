import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { QualityLevel } from '../../types';

interface QualitySelectionModalProps {
  visible: boolean;
  qualityLevels: QualityLevel[];
  activeQualityLevel: number; // -1 for Auto
  onSelectQualityLevel: (levelId: number) => void;
  onClose: () => void;
}

export const QualitySelectionModal: React.FC<QualitySelectionModalProps> = ({
  visible,
  qualityLevels,
  activeQualityLevel,
  onSelectQualityLevel,
  onClose
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="speedometer-outline" size={20} color={colors.primary} />
            <Text style={styles.title}>Qualità Video (ABR)</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {/* Automatic Adaptive Bitrate (ABR) Option */}
          <TouchableOpacity
            style={[styles.row, activeQualityLevel === -1 && styles.rowActive]}
            onPress={() => onSelectQualityLevel(-1)}
          >
            <Ionicons
              name={activeQualityLevel === -1 ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={activeQualityLevel === -1 ? colors.primary : colors.textMuted}
            />
            <View style={styles.details}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.label, activeQualityLevel === -1 && styles.labelActive]}>
                  Automatica (Consigliata)
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>ABR</Text>
                </View>
              </View>
              <Text style={styles.sub}>Si adatta in tempo reale alla velocità della tua connessione</Text>
            </View>
          </TouchableOpacity>

          {/* Quality Levels */}
          {qualityLevels.map((lvl) => {
            const isSelected = lvl.id === activeQualityLevel;
            return (
              <TouchableOpacity
                key={`quality_${lvl.id}`}
                style={[styles.row, isSelected && styles.rowActive]}
                onPress={() => onSelectQualityLevel(lvl.id)}
              >
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
                <View style={styles.details}>
                  <Text style={[styles.label, isSelected && styles.labelActive]}>
                    {lvl.label}
                  </Text>
                  {lvl.bitrate ? (
                    <Text style={styles.sub}>
                      ~{Math.round(lvl.bitrate / 1000)} kbps
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
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
    maxWidth: 420,
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
  listScroll: {
    maxHeight: 320
  },
  listContent: {
    padding: 12
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4
  },
  rowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  details: {
    marginLeft: 12,
    flex: 1
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500'
  },
  labelActive: {
    color: '#fff',
    fontWeight: '700'
  },
  sub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  badge: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '700'
  }
});

