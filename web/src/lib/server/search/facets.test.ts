import { describe, expect, it } from 'vitest';

import type { Product } from '$lib/schema';

import { computeFacets } from './facets';

function product(
  id: string,
  brand: string,
  colors: Product['colors'],
  prices: number[]
): Product {
  const firstColor = colors[0];
  const firstPrice = prices[0];
  if (!firstColor || firstPrice === undefined) throw new Error('Test products need purchasable options');
  return {
    id,
    brand,
    name: id,
    price: firstPrice,
    image: firstColor.image,
    variant_id: `${id}-${firstColor.family}-128`,
    color_name: firstColor.name,
    color_family: firstColor.family,
    storage_gb: 128,
    storage_label: '128 GB',
    colors,
    storage_options: prices.map((price, index) => ({
      gb: 128 * (index + 1),
      label: `${128 * (index + 1)} GB`,
      price
    }))
  };
}

describe('computeFacets', () => {
  it('counts and sorts brands by count then name', () => {
    const products = [
      product('pixel', 'Google', [{ name: 'Black', family: 'black', image: 'pixel.jpg' }], [40_000]),
      product('iphone', 'Apple', [{ name: 'Blue', family: 'blue', image: 'iphone.jpg' }], [80_000]),
      product('iphone-pro', 'Apple', [{ name: 'White', family: 'white', image: 'pro.jpg' }], [120_000])
    ];

    expect(computeFacets(products)[0]).toEqual({
      type: 'categorical',
      field: 'brand',
      values: [
        { value: 'Apple', count: 2 },
        { value: 'Google', count: 1 }
      ]
    });
  });

  it('counts every color option and keeps the first family hex', () => {
    const products = [
      product(
        'phone-a',
        'Alpha',
        [
          { name: 'Sky', family: 'blue', hex: '#112233', image: 'sky.jpg' },
          { name: 'Navy', family: 'blue', hex: '#000022', image: 'navy.jpg' }
        ],
        [10_000]
      ),
      product('phone-b', 'Beta', [{ name: 'Black', family: 'black', hex: '#000000', image: 'black.jpg' }], [20_000])
    ];

    expect(computeFacets(products)[1]).toEqual({
      type: 'categorical',
      field: 'color',
      values: [
        { value: 'blue', count: 2, hex: '#112233' },
        { value: 'black', count: 1, hex: '#000000' }
      ]
    });
  });

  it('spans every storage price and handles no products', () => {
    expect(
      computeFacets([
        product('phone-a', 'Alpha', [{ name: 'Black', family: 'black', image: 'a.jpg' }], [15_000, 30_000]),
        product('phone-b', 'Beta', [{ name: 'White', family: 'white', image: 'b.jpg' }], [12_000, 45_000])
      ])[2]
    ).toEqual({ type: 'range', field: 'price', min: 12_000, max: 45_000 });
    expect(computeFacets([])).toEqual([
      { type: 'categorical', field: 'brand', values: [] },
      { type: 'categorical', field: 'color', values: [] },
      { type: 'range', field: 'price', min: 0, max: 0 }
    ]);
  });
});
