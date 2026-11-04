import React from 'react';
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

interface KeyboardShortcutsModalProps {
  visible: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'Spazio / K', desc: 'Riproduci / Metti in pausa' },
  { key: '← / →', desc: 'Indietro / Avanti di 10 secondi' },
  { key: '↑ / ↓', desc: 'Aumenta / Diminuisci volume (±5%)' },
  { key: 'Rotella Mouse', desc: 'Regola volume rapidamente' },
  { key: 'Clic Video', desc: 'Riproduci / Pausa immediata' },
  { key: 'Doppio Clic / F', desc: 'Schermo intero' },
  { key: 'M', desc: 'Attiva / Disattiva muto' },
  { key: 'P', desc: 'Picture-in-Picture (Finestra mobile)' },
  { key: 'C', desc: 'Cicla le tracce dei sottotitoli' },
  { key: '0 - 9', desc: 'Salta rapidamente dal 0% al 90%' },
  { key: 'Esc', desc: 'Esci da schermo intero o chiudi player' },
  { key: '? / H', desc: 'Mostra / Nascondi questa guida scorciatoie' }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  visible,
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
            <Ionicons name="keypad-outline" size={20} color={colors.primary} />
            <Text style={styles.title}>Scorciatoie da Tastiera PC</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* List of shortcuts */}
        <ScrollView style={styles.listContent}>
          <Text style={styles.hintText}>
            Usa i controlli rapidi da tastiera per un'esperienza fluida su PC e browser desktop:
          </Text>

          <View style={styles.shortcutsTable}>
            {SHORTCUTS.map((item, idx) => (
              <View
                key={`sc_${idx}`}
                style={[styles.row, idx % 2 === 1 && styles.rowAlt]}
              >
                <View style={styles.keyBadge}>
                  <Text style={styles.keyText}>{item.key}</Text>
                </View>
                <Text style={styles.descText}>{item.desc}</Text>
              </View>
            ))}
          </View>
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
    backgroundColor: 'rgba(3, 5, 8, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 70,
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
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#121724',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.8,
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
    padding: 20
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18
  },
  shortcutsTable: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  rowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.015)'
  },
  keyBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 110,
    alignItems: 'center'
  },
  keyText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined
  },
  descText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 14,
    flex: 1
  }
});

