import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Category } from '../types';

interface CategorySelectorProps {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  categorySearchQuery?: string;
  onCategorySearchChange?: (q: string) => void;
  totalCount?: number;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  categorySearchQuery = '',
  onCategorySearchChange,
  totalCount
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const filteredCategories = categories.filter(c => 
    !categorySearchQuery || c.category_name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  );

  // Desktop Vertical Sidebar
  if (isDesktop) {
    return (
      <View style={styles.desktopSidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>Categorie</Text>
          <Text style={styles.sidebarCount}>{categories.length}</Text>
        </View>

        {onCategorySearchChange && (
          <View style={styles.sidebarSearch}>
            <Ionicons name="search" size={13} color={colors.textMuted} style={styles.sidebarSearchIcon} />
            <TextInput
              style={styles.sidebarSearchInput}
              placeholder="Filtra categorie..."
              placeholderTextColor={colors.textMuted}
              value={categorySearchQuery}
              onChangeText={onCategorySearchChange}
            />
          </View>
        )}

        <ScrollView style={styles.sidebarList} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.sidebarItem, selectedCategoryId === 'all' && styles.sidebarItemActive]}
            onPress={() => onSelectCategory('all')}
          >
            <Ionicons
              name="layers-outline"
              size={15}
              color={selectedCategoryId === 'all' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[styles.sidebarItemText, selectedCategoryId === 'all' && styles.sidebarItemTextActive]}
              numberOfLines={1}
            >
              Tutte le categorie
            </Text>
            {totalCount !== undefined && (
              <View style={[styles.itemBadge, selectedCategoryId === 'all' && styles.itemBadgeActive]}>
                <Text style={[styles.itemBadgeCount, selectedCategoryId === 'all' && styles.itemBadgeCountActive]}>
                  {totalCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {filteredCategories.map(cat => {
            const isSelected = selectedCategoryId === cat.category_id;
            return (
              <TouchableOpacity
                key={cat.category_id}
                style={[styles.sidebarItem, isSelected && styles.sidebarItemActive]}
                onPress={() => onSelectCategory(cat.category_id)}
              >
                <Ionicons
                  name="folder-outline"
                  size={14}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[styles.sidebarItemText, isSelected && styles.sidebarItemTextActive]}
                  numberOfLines={1}
                >
                  {cat.category_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // Mobile / Tablet Horizontal Bar
  return (
    <View style={styles.mobileContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mobilePillsScroll}
      >
        <TouchableOpacity
          style={[styles.pill, selectedCategoryId === 'all' && styles.pillActive]}
          onPress={() => onSelectCategory('all')}
        >
          <Text style={[styles.pillText, selectedCategoryId === 'all' && styles.pillTextActive]}>
            Tutte ({totalCount || categories.length})
          </Text>
        </TouchableOpacity>

        {filteredCategories.map(cat => {
          const isSelected = selectedCategoryId === cat.category_id;
          return (
            <TouchableOpacity
              key={cat.category_id}
              style={[styles.pill, isSelected && styles.pillActive]}
              onPress={() => onSelectCategory(cat.category_id)}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]} numberOfLines={1}>
                {cat.category_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Desktop
  desktopSidebar: {
    width: 250,
    backgroundColor: colors.backgroundSecondary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 10
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 10
  },
  sidebarTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  sidebarCount: {
    color: colors.textMuted,
    fontSize: 11,
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  sidebarSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    marginBottom: 10
  },
  sidebarSearchIcon: {
    marginRight: 6
  },
  sidebarSearchInput: {
    flex: 1,
    height: 32,
    color: colors.textPrimary,
    fontSize: 12
  },
  sidebarList: {
    flex: 1
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2
  },
  sidebarItemActive: {
    backgroundColor: colors.surfaceElevated,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary
  },
  sidebarItemText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500'
  },
  sidebarItemTextActive: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  itemBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8
  },
  itemBadgeActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)'
  },
  itemBadgeCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600'
  },
  itemBadgeCountActive: {
    color: colors.primary
  },

  // Mobile
  mobileContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8
  },
  mobilePillsScroll: {
    paddingHorizontal: 12,
    gap: 6
  },
  pill: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border
  },
  pillActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: 'rgba(59, 130, 246, 0.4)'
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500'
  },
  pillTextActive: {
    color: colors.primary,
    fontWeight: '700'
  }
});
