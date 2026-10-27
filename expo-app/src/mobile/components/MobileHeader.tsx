import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
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

  // Category navigation list: ['all', ...category_ids]
  const allCatIds = useMemo(() => ['all', ...categories.map(c => c.category_id)], [categories]);
  const currentIndex = allCatIds.indexOf(selectedCategoryId);

  const handlePrevCategory = () => {
    if (allCatIds.length <= 1) return;
    const newIdx = currentIndex <= 0 ? allCatIds.length - 1 : currentIndex - 1;
    onSelectCategory(allCatIds[newIdx]);
  };

  const handleNextCategory = () => {
    if (allCatIds.length <= 1) return;
    const newIdx = currentIndex >= allCatIds.length - 1 ? 0 : currentIndex + 1;
    onSelectCategory(allCatIds[newIdx]);
  };

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
            <Text style={styles.tabSubtitle} numberOfLines={1}>
              {account ? `Ciao ${account.username || account.name || 'Utente'}` : getTabTitle()}
            </Text>
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

      {/* Centered Expanded Category Bar */}
      {activeTab !== 'favorites' && activeTab !== 'epg' && categories.length > 0 && (
        <View style={styles.categoryBar}>
          {/* Previous Category Stepper */}
          <TouchableOpacity
            style={styles.catArrowBtn}
            onPress={handlePrevCategory}
            accessibilityLabel="Categoria precedente"
          >
            <Ionicons name="chevron-back" size={17} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Centered Expanded Category Button */}
          <TouchableOpacity
            style={[styles.categoryCenterBtn, selectedCategoryId !== 'all' && styles.categoryCenterBtnActive]}
            onPress={onOpenCategorySheet}
            activeOpacity={0.7}
            accessibilityLabel="Seleziona categoria"
          >
            <View style={styles.catCenterLeft}>
              <Ionicons
                name={selectedCategoryId === 'all' ? "layers-outline" : "folder-outline"}
                size={16}
                color={selectedCategoryId !== 'all' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[styles.catCenterText, selectedCategoryId !== 'all' && styles.catCenterTextActive]}
                numberOfLines={1}
              >
                {selectedCategoryId === 'all'
                  ? `Tutte le Categorie (${totalCount || categories.length})`
                  : (selectedCategoryName || 'Categoria')}
              </Text>
            </View>
            <Ionicons
              name="chevron-down"
              size={15}
              color={selectedCategoryId !== 'all' ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Next Category Stepper */}
          <TouchableOpacity
            style={styles.catArrowBtn}
            onPress={handleNextCategory}
            accessibilityLabel="Categoria successiva"
          >
            <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} />
          </TouchableOpacity>
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
    gap: 6,
    height: 44,
    maxHeight: 44,
    flexGrow: 0,
    flexShrink: 0
  },
  catArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0
  },
  categoryCenterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    height: 34,
    alignSelf: 'center'
  },
  categoryCenterBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: colors.primary
  },
  catCenterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    marginRight: 6
  },
  catCenterText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  catCenterTextActive: {
    color: colors.primary,
    fontWeight: '700'
  }
});
