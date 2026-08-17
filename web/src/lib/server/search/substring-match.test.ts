import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';

import { searchSubstringMatch } from './substring-match';

describe('substring match search', () => {
  it('matches case-insensitive substrings on the phone name only', async () => {
    const products = await searchSubstringMatch('IPHONE');
    expect(products).toHaveLength(
      CATALOGUE.filter((phone) => phone.name.toLowerCase().includes('iphone')).length
    );
    expect(products.every((phone) => phone.name.toLowerCase().includes('iphone'))).toBe(true);
    expect(await searchSubstringMatch('apple')).toEqual([]);
  });

  it('returns the full catalogue for an empty query', async () => {
    expect((await searchSubstringMatch('   ')).map((phone) => phone.id)).toEqual(
      CATALOGUE.map((phone) => phone.id)
    );
  });

  it('returns every match in catalogue order', async () => {
    const products = await searchSubstringMatch('galaxy');
    const expected = CATALOGUE.filter((phone) => phone.name.toLowerCase().includes('galaxy'))
      .map((phone) => phone.id);
    expect(products.map((phone) => phone.id)).toEqual(expected);
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
