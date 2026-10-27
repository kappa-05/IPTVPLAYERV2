import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Account, Category, NavTab } from '../../types';

interface MobileHeaderProps {
  activeTab: NavTab;
  account: Account | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  onOpenCategorySheet: () => void;
  onOpenAccountSheet: () => void;
  onRefresh: () => void;
  totalCount?: number;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  activeTab,
  account,
  searchQuery,
  onSearchChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onOpenCategorySheet,
  onOpenAccountSheet,
  onRefresh,
  totalCount
}) => {
  const [showSearch, setShowSearch] = useState(false);

  // Tab Title
  const getTabTitle = () => {
    switch (activeTab) {
      case 'live': return 'Canali Live';
      case 'epg': return 'Guida TV';
      case 'vod': return 'Film & Cinema';
      case 'series': return 'Serie TV';
      case 'favorites': return 'Preferiti';
      default: return 'IPTV Player';
    }
  };

  const selectedCategoryName = categories.find(c => c.category_id === selectedCategoryId)?.category_name;

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.topBar}>
        {/* Brand */}
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="play" size={13} color="#fff" />
          </View>
          <View>
            <Text style={styles.brandTitle}>
              IPTV <Text style={styles.brandAccent}>PLAYER</Text>
            </Text>
            <Text style={styles.tabSubtitle}>{getTabTitle()}</Text>
          </View>
        </View>

        {/* Action Icons */}
        <View style={styles.actions}>
          {activeTab !== 'epg' && (
            <TouchableOpacity
              style={[styles.iconBtn, showSearch && styles.iconBtnActive]}
              onPress={() => {
                setShowSearch(prev => !prev);
                if (showSearch) onSearchChange('');
              }}
              accessibilityLabel="Cerca"
            >
              <Ionicons
                name={showSearch ? 'close' : 'search'}
                size={18}
                color={showSearch ? colors.primary : colors.textPrimary}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onRefresh}
            accessibilityLabel="Aggiorna"
          >
            <Ionicons name="reload" size={17} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.profileBtn}
            onPress={onOpenAccountSheet}
            accessibilityLabel="Profilo"
          >
            <Ionicons name="person" size={16} color={colors.primary} />
            <View style={styles.statusDot} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Search Input */}
      {showSearch && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Cerca in ${getTabTitle()}...`}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoFocus
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Category Pills Bar (for live, vod, series) */}
      {activeTab !== 'favorites' && activeTab !== 'epg' && categories.length > 0 && (
        <View style={styles.categoryBar}>
          {/* Quick All-Categories Sheet Trigger */}
          <TouchableOpacity
            style={[styles.filterSheetBtn, selectedCategoryId !== 'all' && styles.filterSheetBtnActive]}
            onPress={onOpenCategorySheet}
          >
            <Ionicons
              name="options-outline"
              size={13}
              color={selectedCategoryId !== 'all' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[styles.filterSheetBtnText, selectedCategoryId !== 'all' && styles.filterSheetBtnTextActive]}
              numberOfLines={1}
            >
              {selectedCategoryId !== 'all' ? (selectedCategoryName || 'Categoria') : 'Filtra'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={12}
              color={selectedCategoryId !== 'all' ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Horizontal Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScrollWrapper}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
              style={[styles.chip, selectedCategoryId === 'all' && styles.chipActive]}
              onPress={() => onSelectCategory('all')}
            >
              <Text style={[styles.chipText, selectedCategoryId === 'all' && styles.chipTextActive]}>
                Tutti {totalCount !== undefined ? `(${totalCount})` : ''}
              </Text>
            </TouchableOpacity>

            {categories.slice(0, 20).map(cat => {
              const isSelected = selectedCategoryId === cat.category_id;
              return (
                <TouchableOpacity
                  key={cat.category_id}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => onSelectCategory(cat.category_id)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]} numberOfLines={1}>
                    {cat.category_name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {categories.length > 20 && (
              <TouchableOpacity style={styles.chipMore} onPress={onOpenCategorySheet}>
                <Text style={styles.chipMoreText}>+ Altre ({categories.length - 20})</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c0f17',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'web' ? 8 : 12,
    zIndex: 90
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  brandAccent: {
    color: colors.primary
  },
  tabSubtitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    marginTop: -1
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.primary
  },
  profileBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  statusDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentGreen
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    padding: 0
  },
  categoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    height: 44,
    maxHeight: 44,
    flexGrow: 0,
    flexShrink: 0
  },
  filterSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    height: 30,
    maxHeight: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 130,
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0
  },
  filterSheetBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.primary
  },
  filterSheetBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  filterSheetBtnTextActive: {
    color: colors.primary
  },
  chipsScrollWrapper: {
    height: 36,
    maxHeight: 36,
    flexGrow: 0,
    flexShrink: 0
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36
  },
  chip: {
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    height: 28,
    maxHeight: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0
  },
  chipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: colors.primary
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  chipMore: {
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  chipMoreText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600'
  }
});
