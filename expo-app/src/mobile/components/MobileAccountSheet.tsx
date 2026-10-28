import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Account } from '../../types';

interface MobileAccountSheetProps {
  visible: boolean;
  account: Account | null;
  onClose: () => void;
  onOpenLogin: () => void;
  onRefresh: () => void;
  onToggleDesktopMode: () => void;
  onLogout: () => void;
  onOpenInstallPwa?: () => void;
}

export const MobileAccountSheet: React.FC<MobileAccountSheetProps> = ({
  visible,
  account,
  onClose,
  onOpenLogin,
  onRefresh,
  onToggleDesktopMode,
  onLogout,
  onOpenInstallPwa
}) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          <View style={styles.handleWrapper}>
            <View style={styles.handle} />
          </View>

          {/* Account Profile Header */}
          <View style={styles.profileSection}>
            <View style={styles.avatarWrapper}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {account ? `Ciao ${account.username || account.name || 'Utente'}` : 'Nessun Account'}
                </Text>
                {account && (
                  <View style={styles.badgeType}>
                    <Text style={styles.badgeTypeText}>
                      {account.accountType === 'm3u' ? 'M3U' : 'XTREAM'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.profileHost} numberOfLines={1}>
                {account ? (account.host || 'Playlist Locale') : 'Accedi per iniziare'}
              </Text>
            </View>
          </View>

          <View style={styles.menuDivider} />

          {/* Actions List */}
          <View style={styles.actionsList}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                onClose();
                onOpenLogin();
              }}
            >
              <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              </View>
              <View style={styles.actionTextWrapper}>
                <Text style={styles.actionTitle}>Cambia Playlist / Account</Text>
                <Text style={styles.actionSub}>Accedi con un'altra lista M3U o Xtream</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                onClose();
                onRefresh();
              }}
            >
              <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <Ionicons name="refresh" size={18} color={colors.accentGreen} />
              </View>
              <View style={styles.actionTextWrapper}>
                <Text style={styles.actionTitle}>Aggiorna Contenuti</Text>
                <Text style={styles.actionSub}>Svuota la cache e ricarica i canali</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                onClose();
                onToggleDesktopMode();
              }}
            >
              <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                <Ionicons name="desktop-outline" size={18} color="#a855f7" />
              </View>
              <View style={styles.actionTextWrapper}>
                <Text style={styles.actionTitle}>Passa alla Versione PC</Text>
                <Text style={styles.actionSub}>Visualizza l'interfaccia classica desktop</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                onClose();
                onOpenInstallPwa?.();
              }}
            >
              <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(234, 179, 8, 0.12)' }]}>
                <Ionicons name="phone-portrait-outline" size={18} color="#eab308" />
              </View>
              <View style={styles.actionTextWrapper}>
                <Text style={styles.actionTitle}>Aggiungi a Schermata Home</Text>
                <Text style={styles.actionSub}>Installa come app a tutto schermo senza barre</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {account && (
              <TouchableOpacity
                style={[styles.actionRow, styles.actionRowDanger]}
                onPress={() => {
                  onClose();
                  onLogout();
                }}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="log-out-outline" size={18} color={colors.accentRed} />
                </View>
                <View style={styles.actionTextWrapper}>
                  <Text style={[styles.actionTitle, { color: colors.accentRed }]}>Disconnetti</Text>
                  <Text style={styles.actionSub}>Elimina i dati della sessione corrente</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accentRed} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.75)',
    justifyContent: 'flex-end'
  },
  dismissArea: {
    flex: 1
  },
  sheetContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 38,
    borderWidth: 1,
    borderColor: colors.border
  },
  handleWrapper: {
    alignItems: 'center',
    paddingVertical: 10
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  profileInfo: {
    flex: 1
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  badgeType: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  badgeTypeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800'
  },
  profileHost: {
    color: colors.textMuted,
    fontSize: 12
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8
  },
  actionsList: {
    paddingHorizontal: 16,
    gap: 6
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 12
  },
  actionRowDanger: {
    marginTop: 4
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionTextWrapper: {
    flex: 1
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  actionSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1
  }
});
