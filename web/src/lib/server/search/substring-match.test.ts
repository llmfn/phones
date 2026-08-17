import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';

import { searchSubstringMatch, SUBSTRING_MATCH_LIMIT } from './substring-match';

describe('substring match search', () => {
  it('matches case-insensitive substrings on the phone name only', async () => {
    const products = await searchSubstringMatch('IPHONE');
    expect(products).toHaveLength(SUBSTRING_MATCH_LIMIT);
    expect(products.every((phone) => phone.name.toLowerCase().includes('iphone'))).toBe(true);
    expect(await searchSubstringMatch('apple')).toEqual([]);
  });

  it('returns the first catalogue rows for an empty query', async () => {
    expect((await searchSubstringMatch('   ')).map((phone) => phone.id)).toEqual(
      CATALOGUE.slice(0, SUBSTRING_MATCH_LIMIT).map((phone) => phone.id)
    );
  });

  it('preserves catalogue order and caps the result', async () => {
    const products = await searchSubstringMatch('galaxy');
    const expected = CATALOGUE.filter((phone) => phone.name.toLowerCase().includes('galaxy'))
      .slice(0, SUBSTRING_MATCH_LIMIT)
      .map((phone) => phone.id);
    expect(products.map((phone) => phone.id)).toEqual(expected);
    expect(products.length).toBeLessThanOrEqual(SUBSTRING_MATCH_LIMIT);
  });

  it('can find every catalogue phone by its complete name', async () => {
    for (const phone of CATALOGUE) {
      expect(
        (await searchSubstringMatch(phone.name)).some((product) => product.id === phone.id),
        `Expected a complete-name search to find ${phone.id}`
      ).toBe(true);
    }
  });
});
