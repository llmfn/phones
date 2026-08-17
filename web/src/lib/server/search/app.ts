import { searchSubstringMatch } from '$lib/server/search/substring-match';
import { traceTurn } from '$lib/server/trace';

import { searchBM25 } from './bm25';
import { applyFilters } from './filters';
import { searchSemantic } from './semantic';

import type { Filters, SearchResult } from '$lib/schema';
import type { SiteConfig } from '$lib/site-config';

export async function search(
  query: string,
  filters: Filters,
  config: SiteConfig,
  openAIApiKey?: string
): Promise<SearchResult> {
  const { result, trace } = await traceTurn('search', query, async () => {
    switch (config.search.method) {
      case 'substring_match':
        {
          const products = await searchSubstringMatch(query);
          return applyFilters(products, filters);
        }
      case 'bm25':
        {
          const { k1, b } = config.search.search_params;
          const products = await searchBM25(query, k1, b);
          return applyFilters(products, filters);
        }
      case 'semantic_search':
        {
          const { min_score } = config.search.search_params;
          const products = await searchSemantic(query, min_score, openAIApiKey);
          return applyFilters(products, filters);
        }
    }
  });

  return result ? { ...result, trace } : { products: [], facets: [], trace };
}
