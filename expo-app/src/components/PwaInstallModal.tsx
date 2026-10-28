import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface PwaInstallModalProps {
  visible: boolean;
  onClose: () => void;
  isIOS: boolean;
  onInstallNative?: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  visible,
  onClose,
  isIOS,
  onInstallNative
}) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="phone-portrait-outline" size={28} color={colors.primary} />
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Aggiungi a Schermata Home</Text>
          <Text style={styles.subtitle}>
            Installa l'app per aprirla a tutto schermo come una vera applicazione, senza barre del browser e con prestazioni ottimali.
          </Text>

          {isIOS ? (
            /* iOS Safari Instructions */
            <View style={styles.iosStepsContainer}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Tocca il pulsante Condividi</Text>
                  <Text style={styles.stepDesc}>
                    Premi l'icona <Ionicons name="share-outline" size={16} color={colors.primary} /> (quadrato con freccia verso l'alto) nella barra di Safari in basso.
                  </Text>
                </View>
              </View>

              <View style={styles.stepDivider} />

              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Seleziona "Aggiungi a Home"</Text>
                  <Text style={styles.stepDesc}>
                    Scorri le opzioni del menu e seleziona <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>"Aggiungi alla schermata Home"</Text> (<Ionicons name="add-circle-outline" size={15} color={colors.accentGreen} />).
                  </Text>
                </View>
              </View>

              <View style={styles.stepDivider} />

              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Fatto!</Text>
                  <Text style={styles.stepDesc}>
                    Premi "Aggiungi" in alto a destra. L'icona apparirà sulla tua home per un accesso immediato a tutto schermo.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* Android / Desktop Direct Install */
            <View style={styles.androidContainer}>
              <TouchableOpacity
                style={styles.installButton}
                activeOpacity={0.8}
                onPress={() => {
                  onInstallNative?.();
                  onClose();
                }}
              >
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.installButtonText}>Installa Applicazione Ora</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.dismissButton} onPress={onClose}>
            <Text style={styles.dismissButtonText}>Ho capito, chiudi</Text>
          </TouchableOpacity>
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
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  closeBtn: {
    padding: 6
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20
  },
  iosStepsContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    gap: 12
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary
  },
  stepBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800'
  },
  stepContent: {
    flex: 1
  },
  stepTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  stepDivider: {
    height: 1,
    backgroundColor: colors.border
  },
  androidContainer: {
    marginVertical: 12
  },
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  installButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 10
  },
  dismissButtonText: {
    color: colors.textMuted,
    fontSize: 13
  }
});
