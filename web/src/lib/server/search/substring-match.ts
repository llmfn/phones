import { CATALOGUE, projectProduct } from '$lib/server/catalogue';

import type { Product } from '$lib/schema';

export const SUBSTRING_MATCH_LIMIT = 5;

export function searchSubstringMatch(query: string): Product[] {
  const needle = query.trim().toLocaleLowerCase();
  return CATALOGUE.filter(
    (phone) => needle.length === 0 || phone.name.toLocaleLowerCase().includes(needle)
  )
    .slice(0, SUBSTRING_MATCH_LIMIT)
    .map(projectProduct);
}
