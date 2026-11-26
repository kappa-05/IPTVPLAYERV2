export interface SearchDocument {
  name?: string;
  title?: string;
  stream_id?: string | number;
  series_id?: string | number;
  id?: string | number;
  year?: string | number;
  releaseDate?: string;
  genre?: string;
  plot?: string;
  category_name?: string;
}

export interface SearchMatch<T> {
  item: T;
  score: number;
}

interface IndexedDocument<T> {
  item: T;
  title: string;
  fields: string[];
  tokens: Set<string>;
}

export interface SearchIndex<T> {
  documents: IndexedDocument<T>[];
  inverted: Map<string, number[]>;
  vocabulary: string[];
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const levenshtein = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 3;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    previous = current;
  }

  return previous[b.length];
};

const getFields = (item: SearchDocument): string[] =>
  [
    item.name,
    item.title,
    item.stream_id,
    item.series_id,
    item.id,
    item.year,
    item.releaseDate,
    item.genre,
    item.plot,
    item.category_name
  ]
    .map(normalize)
    .filter(Boolean);

export const SearchService = {
  normalize,

  createIndex<T extends SearchDocument>(items: T[]): SearchIndex<T> {
    const documents: IndexedDocument<T>[] = [];
    const inverted = new Map<string, number[]>();

    (items || []).forEach(item => {
      const fields = getFields(item);
      const title = normalize(item.name || item.title);
      const tokens = new Set(fields.flatMap(field => field.split(' ')));
      const index = documents.length;

      documents.push({ item, title, fields, tokens });

      tokens.forEach(token => {
        if (!token) return;

        const matches = inverted.get(token);

        if (matches) {
          matches.push(index);
        } else {
          inverted.set(token, [index]);
        }
      });
    });

    return {
      documents,
      inverted,
      vocabulary: Array.from(inverted.keys())
    };
  },

  search<T>(
    index: SearchIndex<T>,
    query: string,
    limit = 200,
    predicate?: (item: T) => boolean
  ): SearchMatch<T>[] {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    if (!queryTokens.length) return [];

    const tokenMatches: number[][] = [];

    for (const queryToken of queryTokens) {
      const exactMatches: number[] = [];
      const partialMatches: number[] = [];

      index.inverted.forEach((documentIds, token) => {
        if (token === queryToken) {
          exactMatches.push(...documentIds);
        } else if (
          queryToken.length >= 2 &&
          token.startsWith(queryToken)
        ) {
          partialMatches.push(...documentIds);
        }
      });

      let candidates = exactMatches.length
        ? exactMatches
        : partialMatches;

      // Use fuzzy matching only if normal matching found nothing.
      if (!candidates.length && queryToken.length >= 4) {
        const fuzzyTokens = index.vocabulary.filter(token =>
          token.length >= 4 &&
          levenshtein(queryToken, token) <=
            (queryToken.length >= 8 ? 2 : 1)
        );

        fuzzyTokens.forEach(token => {
          candidates.push(...(index.inverted.get(token) || []));
        });
      }

      if (!candidates.length) return [];

      tokenMatches.push(Array.from(new Set(candidates)));
    }

    // Intersect candidate lists: every query word must match.
    tokenMatches.sort((a, b) => a.length - b.length);

    let matchingIds = new Set(tokenMatches[0]);

    for (let i = 1; i < tokenMatches.length; i++) {
      const current = new Set(tokenMatches[i]);
      matchingIds = new Set(
        Array.from(matchingIds).filter(id => current.has(id))
      );

      if (!matchingIds.size) return [];
    }

    const results: SearchMatch<T>[] = [];

    matchingIds.forEach(id => {
      const document = index.documents[id];
      if (!document || (predicate && !predicate(document.item))) return;

      let score = 0;

      if (document.title === normalizedQuery) score += 120;
      else if (document.title.startsWith(normalizedQuery)) score += 90;
      else if (document.title.includes(normalizedQuery)) score += 75;

      for (const token of queryTokens) {
        if (document.title.split(' ').includes(token)) {
          score += 35;
        } else {
          score += 10;
        }
      }

      if (document.fields.some(field => field.includes(normalizedQuery))) {
        score += 10;
      }

      results.push({ item: document.item, score });
    });

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, Math.max(0, limit));
  }
};
