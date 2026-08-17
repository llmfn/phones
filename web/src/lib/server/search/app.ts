import { searchSubstringMatch } from '$lib/server/search/substring-match';
import { traceTurn } from '$lib/server/trace';

import { computeFacets } from './facets';

import type { Filters, SearchResult } from '$lib/schema';
import type { SiteConfig } from '$lib/site-config';

export async function search(query: string, _filters: Filters, config: SiteConfig): Promise<SearchResult> {
  const { result, trace } = await traceTurn('search', query, async () => {
    switch (config.search.method) {
      case 'substring_match':
        {
          const products = await searchSubstringMatch(query);
          return { products, facets: computeFacets(products) };
        }
      case 'bm25':
        throw new Error('BM25 search is not implemented');
      case 'semantic_search':
        throw new Error('Semantic search is not implemented');
    }
  });

  return result ? { ...result, trace } : { products: [], facets: [], trace };
}
