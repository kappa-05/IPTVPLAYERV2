import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { MediaType } from '../types';
import { SearchService, SearchDocument } from '../services/SearchService';

type SearchFilter = 'all' | 'live' | 'vod' | 'series';

interface SearchScreenProps {
  live: any[];
  vod: any[];
  series: any[];
  query?: string;
  onQueryChange?: (value: string) => void;
  onPressItem: (item: any, type: MediaType) => void;
}

interface SearchEntry extends SearchDocument {
  item: any;
  type: MediaType;
  searchable: string;
  key: string;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  live,
  vod,
  series,
  onPressItem,
  query: externalQuery,
  onQueryChange
}) => {
  const { width } = useWindowDimensions();
  const [internalQuery, setInternalQuery] = useState('');
  const query = externalQuery ?? internalQuery;
  const updateQuery = onQueryChange ?? setInternalQuery;
  const [filter, setFilter] = useState<SearchFilter>('all');

  const filters: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: 'Tutti' },
    { id: 'live', label: 'TV' },
    { id: 'vod', label: 'Film' },
    { id: 'series', label: 'Serie TV' }
  ];

  // Debounce: evita di avviare una ricerca per ogni carattere digitato.
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timeout);
  }, [query]);

  // Build the normalized search index only when catalog data changes.
  const searchIndex = useMemo(() => {
    const sources: { type: MediaType; items: any[] }[] = [
      { type: 'live', items: live || [] },
      { type: 'vod', items: vod || [] },
      { type: 'series', items: series || [] }
    ];

    const entries: SearchEntry[] = sources.flatMap(source =>
      source.items.map((item, index) => {
        const id = item.stream_id ?? item.series_id ?? item.id ?? index;

        return {
          item,
          type: source.type,
          key: `${source.type}_${id}`,
          name: item.name,
          title: item.title,
          stream_id: item.stream_id,
          series_id: item.series_id,
          id: item.id,
          year: item.year,
          releaseDate: item.releaseDate,
          genre: item.genre,
          plot: item.plot,
          category_name: item.category_name,
          searchable: [
            item.name,
            item.title,
            item.stream_id,
            item.series_id,
            item.year,
            item.genre
          ].filter(Boolean).join(' ').toLowerCase()
        };
      })
    );

    return SearchService.createIndex(entries);
  }, [live, vod, series]);

  const normalizedQuery = debouncedQuery.trim();

  const results = useMemo<SearchEntry[]>(() => {
    if (!normalizedQuery) return [];

    return SearchService.search(
      searchIndex,
      normalizedQuery,
      500,
      entry => filter === 'all' || entry.type === filter
    ).map(match => match.item);
  }, [searchIndex, normalizedQuery, filter]);

  const columns = width >= 1400 ? 6 : width >= 1000 ? 5 : width >= 650 ? 4 : 2;

  const renderResult = ({ item: entry }: { item: SearchEntry }) => {
    const { item, type } = entry;
    const title = item.name || item.title || 'Senza titolo';
    const poster = item.stream_icon || item.cover || item.movie_image;

    return (
      <TouchableOpacity
        style={[styles.card, { width: `${100 / columns}%` }]}
        activeOpacity={0.82}
        onPress={() => onPressItem(item, type)}
      >
        <View style={styles.posterFrame}>
          {poster ? (
            <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons
                name={type === 'live' ? 'tv-outline' : 'film-outline'}
                size={30}
                color={colors.textMuted}
              />
            </View>
          )}

          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {type === 'live' ? 'TV' : type === 'vod' ? 'FILM' : 'SERIE'}
            </Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        {!!item.year && (
          <Text style={styles.cardYear}>{String(item.year).slice(0, 4)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ESPLORA IL CATALOGO</Text>
        <Text style={styles.title}>Ricerca</Text>
        <Text style={styles.subtitle}>
          Trova canali, film e serie TV in un unico posto.
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca un contenuto..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={updateQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => updateQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {filters.map(item => {
          const active = filter === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.filterButton, active && styles.filterActive]}
              onPress={() => setFilter(item.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!normalizedQuery ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={42} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Cosa vuoi guardare?</Text>
          <Text style={styles.emptyText}>
            Inserisci il titolo di un canale, film o serie TV.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="film-outline" size={42} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nessun risultato</Text>
          <Text style={styles.emptyText}>
            Non abbiamo trovato contenuti corrispondenti alla tua ricerca.
          </Text>
        </View>
      ) : (
        <FlatList
          key={`search-grid-${columns}`}
          data={results}
          renderItem={renderResult}
          keyExtractor={entry => entry.key}
          numColumns={columns}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.results}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {results.length} {results.length === 1 ? 'risultato' : 'risultati'}
            </Text>
          }
          initialNumToRender={Math.max(columns * 3, 6)}
          maxToRenderPerBatch={Math.max(columns * 3, 6)}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 24
  },
  header: { marginBottom: 22 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4
  },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 5 },
  searchBox: {
    height: 52,
    flexShrink: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 12
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 15,
    outlineStyle: 'none' as any
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 58
  },
  filters: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingRight: 4
  },
  filterButton: {
    alignSelf: 'center',
    paddingHorizontal: 17,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  filterActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary
  },
  filterText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: colors.primary },
  results: { paddingBottom: 35 },
  resultCount: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 15,
    paddingTop: 4
  },
  card: { paddingHorizontal: 5, marginBottom: 20 },
  posterFrame: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative'
  },
  poster: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typeBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4
  },
  typeBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 7
  },
  cardYear: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  empty: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
    paddingBottom: 50
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 15
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 7
  }
});
