import { searchSubstringMatch } from '$lib/server/search/substring-match';

import type { Filters, SearchResult } from '$lib/schema';
import type { SiteConfig } from '$lib/site-config';

export function search(query: string, _filters: Filters, config: SiteConfig): SearchResult {
  switch (config.search.method) {
    case 'substring_match':
      return { products: searchSubstringMatch(query), facets: [] };
    case 'bm25':
      throw new Error('BM25 search is not implemented');
    case 'semantic_search':
      throw new Error('Semantic search is not implemented');
  }
}
