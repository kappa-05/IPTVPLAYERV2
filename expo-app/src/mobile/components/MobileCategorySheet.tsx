import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Category } from '../../types';

interface MobileCategorySheetProps {
  visible: boolean;
  categories: Category[];
  selectedCategoryId: string;
  totalCount?: number;
  onSelectCategory: (id: string) => void;
  onClose: () => void;
}

export const MobileCategorySheet: React.FC<MobileCategorySheetProps> = ({
  visible,
  categories,
  selectedCategoryId,
  totalCount,
  onSelectCategory,
  onClose
}) => {
  const [search, setSearch] = useState('');

  if (!visible) return null;

  const filteredCategories = categories.filter(c =>
    !search.trim() || c.category_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Sheet Handle */}
          <View style={styles.handleWrapper}>
            <View style={styles.handle} />
          </View>

          {/* Sheet Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Seleziona Categoria</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca categoria..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category List */}
          <FlatList
            data={filteredCategories}
            keyExtractor={(item) => item.category_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              !search ? (
                <TouchableOpacity
                  style={[
                    styles.categoryRow,
                    selectedCategoryId === 'all' && styles.categoryRowActive
                  ]}
                  onPress={() => {
                    onSelectCategory('all');
                    onClose();
                  }}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons
                      name="layers-outline"
                      size={18}
                      color={selectedCategoryId === 'all' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryName,
                        selectedCategoryId === 'all' && styles.categoryNameActive
                      ]}
                    >
                      Tutte le categorie
                    </Text>
                  </View>
                  {totalCount !== undefined && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{totalCount}</Text>
                    </View>
                  )}
                  {selectedCategoryId === 'all' && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ) : undefined
            }
            renderItem={({ item }) => {
              const isSelected = selectedCategoryId === item.category_id;
              return (
                <TouchableOpacity
                  style={[styles.categoryRow, isSelected && styles.categoryRowActive]}
                  onPress={() => {
                    onSelectCategory(item.category_id);
                    onClose();
                  }}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons
                      name="folder-outline"
                      size={18}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[styles.categoryName, isSelected && styles.categoryNameActive]}
                      numberOfLines={1}
                    >
                      {item.category_name}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
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
    maxHeight: '80%',
    minHeight: '40%',
    paddingBottom: Platform.OS === 'web' ? 20 : 34,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  closeBtn: {
    padding: 4
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    padding: 0
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  categoryRowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: colors.primary
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8
  },
  categoryName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    flex: 1
  },
  categoryNameActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  badge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8
  },
  badgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600'
  }
});
