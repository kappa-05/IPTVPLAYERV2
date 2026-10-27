import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, useWindowDimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Account, MediaType, NavTab } from '../types';

interface HeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  account: Account | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onToggleMobileMode?: () => void;
  counts?: {
    live?: number;
    vod?: number;
    series?: number;
    favorites?: number;
  };
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  account,
  onOpenLogin,
  onLogout,
  onRefresh,
  onToggleMobileMode,
  counts
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {/* Brand Logo */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
          <Text style={styles.brandTitle}>
            IPTV <Text style={styles.brandTitleAccent}>PLAYER</Text>
          </Text>
        </View>

        {/* Desktop Search Bar */}
        {!isMobile && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca canali, film, serie tv..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={onSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearSearchBtn}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {onToggleMobileMode && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onToggleMobileMode}
              accessibilityLabel="Passa alla versione Mobile"
            >
              <Ionicons name="phone-portrait-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onRefresh}
            accessibilityLabel="Aggiorna contenuti"
          >
            <Ionicons name="reload" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {account ? (
            <View style={styles.accountBadge}>
              <View style={styles.statusDot} />
              {account.accountType === 'm3u' && (
                <View style={styles.headerM3uBadge}>
                  <Text style={styles.headerM3uBadgeText}>M3U</Text>
                </View>
              )}
              <Text style={styles.accountUsername} numberOfLines={1}>
                {account.name || account.username}
              </Text>
              <TouchableOpacity onPress={onLogout} style={styles.logoutBtn} accessibilityLabel="Disconnetti">
                <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.loginBtn} onPress={onOpenLogin}>
              <Ionicons name="log-in-outline" size={15} color="#fff" />
              <Text style={styles.loginBtnText}>Accedi</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Mobile Search Bar */}
      {isMobile && (
        <View style={styles.mobileSearchContainer}>
          <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca contenuti..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearSearchBtn}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Navigation Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollView}
        contentContainerStyle={styles.tabsContainer}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'live' && styles.tabActive]}
          onPress={() => onTabChange('live')}
        >
          <Ionicons
            name="tv-outline"
            size={16}
            color={activeTab === 'live' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
            Canali Live
          </Text>
          {counts?.live !== undefined && (
            <View style={[styles.tabBadge, activeTab === 'live' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'live' && styles.tabBadgeTextActive]}>
                {counts.live}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'epg' && styles.tabActive]}
          onPress={() => onTabChange('epg')}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={activeTab === 'epg' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'epg' && styles.tabTextActive]}>
            Guida TV
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'vod' && styles.tabActive]}
          onPress={() => onTabChange('vod')}
        >
          <Ionicons
            name="film-outline"
            size={16}
            color={activeTab === 'vod' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'vod' && styles.tabTextActive]}>
            Film VOD
          </Text>
          {counts?.vod !== undefined && (
            <View style={[styles.tabBadge, activeTab === 'vod' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'vod' && styles.tabBadgeTextActive]}>
                {counts.vod}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'series' && styles.tabActive]}
          onPress={() => onTabChange('series')}
        >
          <Ionicons
            name="albums-outline"
            size={16}
            color={activeTab === 'series' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'series' && styles.tabTextActive]}>
            Serie TV
          </Text>
          {counts?.series !== undefined && (
            <View style={[styles.tabBadge, activeTab === 'series' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'series' && styles.tabBadgeTextActive]}>
                {counts.series}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => onTabChange('favorites')}
        >
          <Ionicons
            name="star-outline"
            size={16}
            color={activeTab === 'favorites' ? colors.accentAmber : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
            Preferiti
          </Text>
          {counts?.favorites !== undefined && counts.favorites > 0 && (
            <View style={[styles.tabBadge, activeTab === 'favorites' && { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
              <Text style={[styles.tabBadgeText, activeTab === 'favorites' && { color: colors.accentAmber }]}>
                {counts.favorites}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 44,
    paddingBottom: 8,
    zIndex: 10
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  brandTitleAccent: {
    color: colors.primary
  },
  searchContainer: {
    flex: 1,
    maxWidth: 420,
    marginHorizontal: 16,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileSearchContainer: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    zIndex: 2
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 34,
    paddingRight: 32,
    color: colors.textPrimary,
    fontSize: 13
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 8,
    zIndex: 2,
    padding: 4
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8
  },
  headerM3uBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3
  },
  headerM3uBadgeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '700'
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentGreen
  },
  accountUsername: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120
  },
  logoutBtn: {
    padding: 2
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  tabsScrollView: {
    width: '100%',
    flexGrow: 0
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  tabActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: 'rgba(59, 130, 246, 0.35)'
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500'
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  tabBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)'
  },
  tabBadgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600'
  },
  tabBadgeTextActive: {
    color: colors.primary
  }
});
