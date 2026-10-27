import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Account } from '../types';
import { XtreamAPI } from '../services/api';
import { StorageService } from '../services/storage';

interface LoginModalProps {
  visible: boolean;
  onClose: () => void;
  onLoginSuccess: (account: Account) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  visible,
  onClose,
  onLoginSuccess
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  // Mode: 'xtream' | 'm3u'
  const [loginMode, setLoginMode] = useState<'xtream' | 'm3u'>('xtream');

  // Xtream Fields
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // M3U Fields
  const [m3uName, setM3uName] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');

  // Common
  const [useProxy, setUseProxy] = useState(Platform.OS === 'web');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedAccounts, setSavedAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (visible) {
      loadSavedAccounts();
    }
  }, [visible]);

  const loadSavedAccounts = async () => {
    const list = await StorageService.getAccounts();
    setSavedAccounts(list);
  };

  const handleXtreamLogin = async (
    targetHost = host,
    targetUser = username,
    targetPass = password,
    targetProxy = useProxy
  ) => {
    if (!targetHost || !targetUser) {
      setError('Inserisci sia l\'indirizzo del server che lo username.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const account = await XtreamAPI.login(targetHost, targetUser, targetPass, targetProxy);
      await StorageService.saveAccount(account);
      onLoginSuccess(account);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Errore di connessione al server IPTV');
    } finally {
      setLoading(false);
    }
  };

  const handleM3uLogin = async (targetUrl = m3uUrl, targetName = m3uName, targetProxy = useProxy) => {
    if (!targetUrl.trim()) {
      setError('Inserisci l\'indirizzo URL della playlist M3U.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const account = await XtreamAPI.loadM3U(targetUrl, targetName, targetProxy);
      await StorageService.saveAccount(account);
      onLoginSuccess(account);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Errore durante il caricamento della playlist M3U');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoXtream = () => {
    const origin = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : 'http://localhost:8080';
    const demoHost = origin;
    const demoUser = 'vip_user_2026';
    const demoPass = 'demo_pass';
    setHost(demoHost);
    setUsername(demoUser);
    setPassword(demoPass);
    handleXtreamLogin(demoHost, demoUser, demoPass, true);
  };

  const handleDemoM3U = () => {
    const origin = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : 'http://localhost:8080';
    const demoUrl = `${origin}/demo.m3u`;
    const demoName = 'Demo M3U Italia';
    setM3uUrl(demoUrl);
    setM3uName(demoName);
    handleM3uLogin(demoUrl, demoName, true);
  };

  const handlePublicFreeM3U = () => {
    const publicUrl = 'https://iptv-org.github.io/iptv/countries/it.m3u';
    const publicName = 'IPTV Org Canali Italiani';
    setM3uUrl(publicUrl);
    setM3uName(publicName);
    handleM3uLogin(publicUrl, publicName, true);
  };

  const handleConnectSaved = (acc: Account) => {
    if (acc.accountType === 'm3u') {
      handleM3uLogin(acc.m3uUrl || acc.host, acc.name, acc.useProxy);
    } else {
      handleXtreamLogin(acc.host, acc.username, acc.password || '', acc.useProxy);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    await StorageService.deleteAccount(id);
    loadSavedAccounts();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, isMobile && styles.cardMobile]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerIconWrapper}>
                <Ionicons name="tv-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.title}>Carica Playlist IPTV</Text>
              <Text style={styles.subtitle}>
                Scegli tra credenziali Xtream Codes o link M3U diretto
              </Text>
            </View>

            {/* Mode Segment Switcher */}
            <View style={styles.modeSwitcher}>
              <TouchableOpacity
                style={[styles.modeTab, loginMode === 'xtream' && styles.modeTabActive]}
                onPress={() => { setLoginMode('xtream'); setError(null); }}
              >
                <Ionicons
                  name="server-outline"
                  size={15}
                  color={loginMode === 'xtream' ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.modeTabText, loginMode === 'xtream' && styles.modeTabTextActive]}>
                  Xtream Codes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, loginMode === 'm3u' && styles.modeTabActive]}
                onPress={() => { setLoginMode('m3u'); setError(null); }}
              >
                <Ionicons
                  name="link-outline"
                  size={15}
                  color={loginMode === 'm3u' ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.modeTabText, loginMode === 'm3u' && styles.modeTabTextActive]}>
                  Link M3U Diretto
                </Text>
              </TouchableOpacity>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.accentRed} />
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            )}

            {/* --- TAB 1: XTREAM CODES --- */}
            {loginMode === 'xtream' ? (
              <View>
                <TouchableOpacity
                  style={styles.demoButton}
                  onPress={handleDemoXtream}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play-circle" size={18} color="#fff" />
                  <View style={styles.demoBtnTextWrapper}>
                    <Text style={styles.demoBtnTitle}>Accedi con Account Demo Xtream</Text>
                    <Text style={styles.demoBtnSub}>Server mock locale con canali e film di test</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>oppure credenziali manuali</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Server URL / Host</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="es. http://iptv-server.net:8080"
                    placeholderTextColor={colors.textMuted}
                    value={host}
                    onChangeText={setHost}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome utente"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.input, { paddingRight: 38 }]}
                      placeholder="Password"
                      placeholderTextColor={colors.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.proxyRow}>
                  <View style={styles.proxyInfo}>
                    <Text style={styles.proxyTitle}>Bypass CORS (Proxy Locale)</Text>
                    <Text style={styles.proxySub}>Consigliato per connessioni da browser web</Text>
                  </View>
                  <Switch
                    value={useProxy}
                    onValueChange={setUseProxy}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={() => handleXtreamLogin()}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Connetti Xtream</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* --- TAB 2: PLAYLIST M3U DIRETTA --- */
              <View>
                <TouchableOpacity
                  style={styles.demoButton}
                  onPress={handleDemoM3U}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash-outline" size={18} color="#fff" />
                  <View style={styles.demoBtnTextWrapper}>
                    <Text style={styles.demoBtnTitle}>Prova Playlist M3U Demo Locale</Text>
                    <Text style={styles.demoBtnSub}>Carica istantaneamente il file demo.m3u locale</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.demoButton, { backgroundColor: colors.surfaceElevated, marginTop: -4 }]}
                  onPress={handlePublicFreeM3U}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="globe-outline" size={18} color={colors.textPrimary} />
                  <View style={styles.demoBtnTextWrapper}>
                    <Text style={styles.demoBtnTitle}>Testa con Canali Free Italia (IPTV-Org)</Text>
                    <Text style={styles.demoBtnSub}>Playlist pubblica libera online</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>oppure inserisci il tuo link M3U</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Nome Playlist (Opzionale)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="es. Mia Playlist M3U"
                    placeholderTextColor={colors.textMuted}
                    value={m3uName}
                    onChangeText={setM3uName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>URL Playlist M3U / M3U8</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://example.com/playlist.m3u"
                    placeholderTextColor={colors.textMuted}
                    value={m3uUrl}
                    onChangeText={setM3uUrl}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.proxyRow}>
                  <View style={styles.proxyInfo}>
                    <Text style={styles.proxyTitle}>Bypass CORS (Proxy Locale)</Text>
                    <Text style={styles.proxySub}>Risolve il blocco Cross-Origin su browser web</Text>
                  </View>
                  <Switch
                    value={useProxy}
                    onValueChange={setUseProxy}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={() => handleM3uLogin()}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Scarica e Carica M3U</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Saved Playlists Section */}
            {savedAccounts.length > 0 && (
              <View style={styles.savedSection}>
                <Text style={styles.savedHeading}>Playlist Salvate ({savedAccounts.length})</Text>
                {savedAccounts.map(acc => {
                  const isM3U = acc.accountType === 'm3u';
                  return (
                    <View key={acc.id} style={styles.savedCard}>
                      <View style={styles.savedCardInfo}>
                        <View style={styles.savedNameRow}>
                          <View style={[styles.savedTypeBadge, isM3U && styles.savedTypeBadgeM3U]}>
                            <Text style={styles.savedTypeBadgeText}>
                              {isM3U ? 'M3U' : 'XTREAM'}
                            </Text>
                          </View>
                          <Text style={styles.savedCardUser} numberOfLines={1}>
                            {acc.name || acc.username}
                          </Text>
                        </View>
                        <Text style={styles.savedCardHost} numberOfLines={1}>
                          {acc.m3uUrl || acc.host}
                        </Text>
                      </View>
                      <View style={styles.savedCardActions}>
                        <TouchableOpacity
                          style={styles.savedConnectBtn}
                          onPress={() => handleConnectSaved(acc)}
                        >
                          <Text style={styles.savedConnectText}>Apri</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.savedDeleteBtn}
                          onPress={() => handleDeleteAccount(acc.id)}
                        >
                          <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
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
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    position: 'relative',
    overflow: 'hidden'
  },
  cardMobile: {
    maxWidth: '100%',
    maxHeight: '96%'
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
  scrollContent: {
    padding: 20
  },
  header: {
    alignItems: 'center',
    marginBottom: 14
  },
  headerIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    marginBottom: 14
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 4
  },
  modeTabActive: {
    backgroundColor: colors.primary
  },
  modeTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  modeTabTextActive: {
    color: '#fff',
    fontWeight: '700'
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    padding: 10,
    borderRadius: 6,
    gap: 10,
    marginBottom: 12
  },
  demoBtnTextWrapper: {
    flex: 1
  },
  demoBtnTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },
  demoBtnSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 1
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 11
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    borderRadius: 6,
    padding: 10,
    gap: 8,
    marginBottom: 12
  },
  errorBoxText: {
    color: colors.accentRed,
    fontSize: 12,
    flex: 1
  },
  inputGroup: {
    marginBottom: 10
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center'
  },
  input: {
    height: 38,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 13
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    zIndex: 2,
    padding: 4
  },
  proxyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    marginBottom: 12
  },
  proxyInfo: {
    flex: 1,
    marginRight: 10
  },
  proxyTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600'
  },
  proxySub: {
    color: colors.textMuted,
    fontSize: 11
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    height: 40,
    borderRadius: 6
  },
  submitBtnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },
  savedSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12
  },
  savedHeading: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginBottom: 6
  },
  savedCardInfo: {
    flex: 1,
    marginRight: 8
  },
  savedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  savedTypeBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3
  },
  savedTypeBadgeM3U: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)'
  },
  savedTypeBadgeText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700'
  },
  savedCardUser: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600'
  },
  savedCardHost: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  savedCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  savedConnectBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4
  },
  savedConnectText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600'
  },
  savedDeleteBtn: {
    padding: 4
  }
});
