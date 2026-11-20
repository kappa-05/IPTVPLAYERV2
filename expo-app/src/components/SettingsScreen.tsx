import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Account } from '../types';

type DeviceMode = 'auto' | 'mobile' | 'desktop';

interface SettingsScreenProps {
  account: Account | null;
  deviceMode: DeviceMode;
  onSetDeviceMode: (mode: DeviceMode) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onOpenInstallPwa?: () => void;
}

const modeOptions: { value: DeviceMode; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'auto', label: 'Automatica', description: 'Adatta l’interfaccia alle dimensioni dello schermo', icon: 'phone-landscape-outline' },
  { value: 'desktop', label: 'Desktop', description: 'Utilizza sempre l’interfaccia per PC', icon: 'desktop-outline' },
  { value: 'mobile', label: 'Mobile', description: 'Utilizza sempre l’interfaccia compatta', icon: 'phone-portrait-outline' }
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  account,
  deviceMode,
  onSetDeviceMode,
  onOpenLogin,
  onLogout,
  onRefresh,
  onOpenInstallPwa
}) => (
  <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>PERSONALIZZAZIONE</Text>
      <Text style={styles.title}>Impostazioni</Text>
      <Text style={styles.subtitle}>Gestisci l’aspetto e le preferenze di Streamix.</Text>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons name="desktop-outline" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Aspetto e visualizzazione</Text>
      </View>
      <Text style={styles.helper}>Scegli quale interfaccia utilizzare. La preferenza viene salvata su questo dispositivo.</Text>
      <View style={styles.options}>
        {modeOptions.map((option) => {
          const selected = deviceMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onSetDeviceMode(option.value)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                <Ionicons name={option.icon} size={19} color={selected ? colors.primary : colors.textSecondary} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons name="person-circle-outline" size={19} color={colors.primary} />
        <Text style={styles.sectionTitle}>Account e playlist</Text>
      </View>
      <View style={styles.accountCard}>
        <View style={styles.accountIcon}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
        <View style={styles.accountInfo}>
          <Text style={styles.accountName}>{account ? (account.username || account.name || 'Account collegato') : 'Nessun account collegato'}</Text>
          <Text style={styles.accountMeta}>{account ? `${account.accountType === 'm3u' ? 'Playlist M3U' : 'Xtream'} · ${account.host || 'Playlist locale'}` : 'Accedi per caricare i tuoi contenuti'}</Text>
        </View>
        <View style={[styles.statusDot, account ? styles.statusOn : styles.statusOff]} />
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={onOpenLogin} activeOpacity={0.75}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.actionText}>{account ? 'Cambia account o playlist' : 'Aggiungi account o playlist'}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </TouchableOpacity>
      {account && (
        <TouchableOpacity style={styles.actionButton} onPress={onLogout} activeOpacity={0.75}>
          <Ionicons name="log-out-outline" size={18} color={colors.accentRed} />
          <Text style={[styles.actionText, { color: colors.accentRed }]}>Disconnetti account</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons name="refresh-circle-outline" size={19} color={colors.primary} />
        <Text style={styles.sectionTitle}>Gestione contenuti</Text>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={onRefresh} activeOpacity={0.75} disabled={!account}>
        <Ionicons name="refresh-outline" size={18} color={account ? colors.textPrimary : colors.textMuted} />
        <Text style={[styles.actionText, !account && styles.disabledText]}>Aggiorna catalogo e contenuti</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </TouchableOpacity>
      {onOpenInstallPwa && (
        <TouchableOpacity style={styles.actionButton} onPress={onOpenInstallPwa} activeOpacity={0.75}>
          <Ionicons name="download-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.actionText}>Installa Streamix</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>

    <Text style={styles.footer}>Streamix · Impostazioni salvate localmente su questo dispositivo</Text>
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 48, maxWidth: 920, width: '100%', alignSelf: 'center' },
  heading: { marginBottom: 24 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 7 },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  section: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 16 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: colors.card },
  optionSelected: { borderColor: colors.primary, backgroundColor: 'rgba(59, 130, 246, 0.08)' },
  optionIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  optionIconSelected: { backgroundColor: 'rgba(59, 130, 246, 0.14)' },
  optionText: { flex: 1 },
  optionTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  optionDescription: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  accountIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1 },
  accountName: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  accountMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusOn: { backgroundColor: colors.accentGreen },
  statusOff: { backgroundColor: colors.textMuted },
  actionButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.card, marginTop: 7 },
  actionText: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  disabledText: { color: colors.textMuted },
  footer: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 8 }
});
