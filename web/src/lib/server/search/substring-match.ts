import { CATALOGUE, projectProduct } from '$lib/server/catalogue';
import { traceStep } from '$lib/server/trace';

import type { Product } from '$lib/schema';

const SUBSTRING_TRACE_TOP_N = 10;

export function searchSubstringMatch(query: string): Promise<Product[]> {
  return traceStep(
    'search_substring_match',
    { query, field: 'name' },
    (step) => {
      const needle = query.trim().toLocaleLowerCase();
      const matches = CATALOGUE.filter(
        (phone) => needle.length === 0 || phone.name.toLocaleLowerCase().includes(needle)
      );
      const products = matches.map(projectProduct);
      step.setOutput({
        matched: matches.length,
        returned: products.length,
        shown_matches: matches.slice(0, SUBSTRING_TRACE_TOP_N).map((phone) => ({
          id: phone.id,
          name: phone.name
        }))
      });
      return products;
    },
    'substring match'
  );
}
