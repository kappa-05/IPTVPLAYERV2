import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { NavTab } from '../../types';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  favoritesCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  favoritesCount = 0
}) => {
  const tabs: { key: NavTab; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'live', label: 'Canali', icon: 'tv-outline', iconActive: 'tv' },
    { key: 'epg', label: 'Guida TV', icon: 'calendar-outline', iconActive: 'calendar' },
    { key: 'vod', label: 'Film', icon: 'film-outline', iconActive: 'film' },
    { key: 'series', label: 'Serie TV', icon: 'albums-outline', iconActive: 'albums' },
    { key: 'favorites', label: 'Preferiti', icon: 'star-outline', iconActive: 'star' }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={20}
                  color={isActive ? colors.primary : colors.textMuted}
                />
                {tab.key === 'favorites' && favoritesCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {favoritesCount > 99 ? '99+' : favoritesCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c0f17',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'web' ? 8 : 16,
    paddingTop: 6,
    width: '100%',
    zIndex: 100
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative'
  },
  tabItemActive: {},
  iconWrapper: {
    position: 'relative',
    height: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    backgroundColor: colors.accentAmber,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800'
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary
  }
});
