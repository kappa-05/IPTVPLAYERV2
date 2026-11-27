import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  formatPlayerDiagnostics,
  PlayerDiagnostics,
  sanitizePlayerDiagnosticMessage,
} from '../../services/PlayerDiagnosticsService';

interface PlayerDiagnosticsModalProps {
  visible: boolean;
  diagnostics: PlayerDiagnostics;
  onClose: () => void;
}

const formatMilliseconds = (milliseconds: number | null): string => {
  if (milliseconds === null) return '—';
  return `${(milliseconds / 1000).toFixed(2)} sec`;
};

const formatElapsedMilliseconds = (milliseconds: number): string =>
  `${(milliseconds / 1000).toFixed(1)} sec`;

export const PlayerDiagnosticsModal: React.FC<PlayerDiagnosticsModalProps> = ({
  visible,
  diagnostics,
  onClose,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'unavailable'>('idle');
  const canCopy = Platform.OS === 'web' && typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);
  const report = useMemo(() => formatPlayerDiagnostics(diagnostics), [diagnostics]);

  const copyReport = useCallback(async () => {
    if (!canCopy) {
      setCopyStatus('unavailable');
      return;
    }

    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('unavailable');
    }
  }, [canCopy, report]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="pulse-outline" size={20} color={colors.primary} />
            <Text style={styles.title}>Diagnostica player</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi diagnostica">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.hint}>
            Dati tecnici della sessione corrente. Il report non include indirizzi del flusso né credenziali.
          </Text>

          <View style={styles.metrics}>
            <Metric label="Motore" value={diagnostics.engine} />
            <Metric label="Stato" value={diagnostics.status} />
            <Metric label="Avvio" value={formatMilliseconds(diagnostics.startupTimeMs)} />
            <Metric label="Buffering" value={`${diagnostics.bufferingEvents} eventi`} />
            <Metric label="Tempo buffering" value={formatElapsedMilliseconds(diagnostics.bufferingTimeMs)} />
            <Metric label="Fallback" value={`${diagnostics.fallbackAttempts} cambi`} />
          </View>

          <Text style={styles.sectionTitle}>Errori registrati</Text>
          {diagnostics.errors.length > 0 ? diagnostics.errors.map((error, index) => (
            <View key={`${error}-${index}`} style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#fca5a5" />
              <Text style={styles.errorText}>{sanitizePlayerDiagnosticMessage(error)}</Text>
            </View>
          )) : (
            <Text style={styles.emptyText}>Nessun errore registrato in questa sessione.</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.copyBtn, !canCopy && styles.copyBtnDisabled]}
            onPress={copyReport}
            accessibilityLabel="Copia report diagnostico"
          >
            <Ionicons name="copy-outline" size={17} color="#fff" />
            <Text style={styles.copyText}>Copia report</Text>
          </TouchableOpacity>
          {copyStatus === 'copied' && <Text style={styles.copyFeedback}>Copiato</Text>}
          {copyStatus === 'unavailable' && <Text style={styles.copyFeedback}>Copia non disponibile</Text>}
        </View>
      </View>
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(3, 5, 8, 0.82)', justifyContent: 'center', alignItems: 'center', zIndex: 70, padding: 20 },
  backdropTap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { width: '100%', maxWidth: 520, maxHeight: '85%', backgroundColor: '#121724', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.8, shadowRadius: 36, elevation: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)', justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20 },
  contentContainer: { paddingVertical: 20 },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', minWidth: 180, backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)' },
  metricLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 4 },
  metricValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  errorText: { color: '#fecaca', fontSize: 12, lineHeight: 17, flex: 1 },
  emptyText: { color: colors.textSecondary, fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  copyBtnDisabled: { opacity: 0.55 },
  copyText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  copyFeedback: { color: colors.textSecondary, fontSize: 12 },
});
