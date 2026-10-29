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
import { PlaybackSpeed } from '../../types';

interface SpeedSelectionModalProps {
  visible: boolean;
  activeSpeed: PlaybackSpeed;
  onSelectSpeed: (speed: PlaybackSpeed) => void;
  onClose: () => void;
}

const SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const SpeedSelectionModal: React.FC<SpeedSelectionModalProps> = ({
  visible,
  activeSpeed,
  onSelectSpeed,
  onClose
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="play-forward-outline" size={20} color={colors.primary} />
            <Text style={styles.title}>Velocità di Riproduzione</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.listContent}>
          {SPEEDS.map((sp) => {
            const isSelected = sp === activeSpeed;
            return (
              <TouchableOpacity
                key={`speed_${sp}`}
                style={[styles.row, isSelected && styles.rowActive]}
                onPress={() => onSelectSpeed(sp)}
              >
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.label, isSelected && styles.labelActive]}>
                  {sp === 1.0 ? 'Normale (1.0x)' : `${sp}x`}
                </Text>
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
    maxWidth: 360,
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
  label: {
    marginLeft: 12,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500'
  },
  labelActive: {
    color: '#fff',
    fontWeight: '700'
  }
});

