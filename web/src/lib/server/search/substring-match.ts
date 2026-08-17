import { CATALOGUE, projectProduct } from '$lib/server/catalogue';
import { traceStep } from '$lib/server/trace';

import type { Product } from '$lib/schema';

export const SUBSTRING_MATCH_LIMIT = 5;

export function searchSubstringMatch(query: string): Promise<Product[]> {
  return traceStep(
    'search_substring_match',
    { query, field: 'name', limit: SUBSTRING_MATCH_LIMIT },
    (step) => {
      const needle = query.trim().toLocaleLowerCase();
      const matches = CATALOGUE.filter(
        (phone) => needle.length === 0 || phone.name.toLocaleLowerCase().includes(needle)
      );
      const products = matches.slice(0, SUBSTRING_MATCH_LIMIT).map(projectProduct);
      step.setOutput({ matched: matches.length, returned: products.length });
      return products;
    },
    'substring match'
  );
}
