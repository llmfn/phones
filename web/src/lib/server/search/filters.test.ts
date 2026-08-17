import { describe, expect, it } from 'vitest';

import type { Filters, Product } from '$lib/schema';
import { traceTurn } from '$lib/server/trace';

import { applyFilters } from './filters';

const emptyFilters: Filters = { brands: [], colors: [], price: null };

function product(id: string, brand: string, colors: Product['colors'], storage: Product['storage_options']): Product {
  const color = colors[0];
  const option = storage[0];
  return {
    id,
    brand,
    name: id,
    price: option.price,
    image: color.image,
    variant_id: `${id}-${color.family}-${option.gb}`,
    color_name: color.name,
    color_family: color.family,
    storage_gb: option.gb,
    storage_label: option.label,
    ram_gb: option.ram_gb,
    colors,
    storage_options: storage
  };
}

const products = [
  product(
    'alpha-one',
    'Alpha',
    [
      { name: 'Midnight', family: 'black', image: 'alpha-black.jpg' },
      { name: 'Ruby', family: 'red', hex: '#cc0000', image: 'alpha-red.jpg' }
    ],
    [
      { gb: 128, label: '128 GB', ram_gb: 8, price: 20_000 },
      { gb: 256, label: '256 GB', price: 30_000 }
    ]
  ),
  product(
    'beta-one',
    'Beta',
    [{ name: 'Ruby', family: 'red', image: 'beta-red.jpg' }],
    [{ gb: 128, label: '128 GB', price: 25_000 }]
  ),
  product(
    'gamma-one',
    'Gamma',
    [{ name: 'Ocean', family: 'blue', image: 'gamma-blue.jpg' }],
    [{ gb: 128, label: '128 GB', price: 45_000 }]
  )
];

describe('applyFilters', () => {
  it('returns all products and records no step when filters are inactive', async () => {
    const { result, trace } = await traceTurn('search', '', () => applyFilters(products, emptyFilters));

    expect(result?.products).toBe(products);
    expect(trace.steps).toEqual([]);
  });

  it('ORs values within dimensions and ANDs active dimensions', async () => {
    const result = await applyFilters(products, {
      brands: ['Alpha', 'Beta'],
      colors: ['red'],
      price: { min: 24_000, max: 31_000 }
    });

    expect(result.products.map((item) => item.id)).toEqual(['alpha-one', 'beta-one']);
  });

  it('trims options and rebuilds the lead variant from the first survivors', async () => {
    const result = await applyFilters(products, {
      brands: [],
      colors: ['red'],
      price: { min: 30_000, max: 30_000 }
    });
    const [survivor] = result.products;

    expect(survivor).toMatchObject({
      id: 'alpha-one',
      image: 'alpha-red.jpg',
      color_name: 'Ruby',
      color_family: 'red',
      price: 30_000,
      storage_gb: 256,
      storage_label: '256 GB',
      variant_id: 'alpha-one-red-256',
      colors: [{ name: 'Ruby', family: 'red', hex: '#cc0000', image: 'alpha-red.jpg' }],
      storage_options: [{ gb: 256, label: '256 GB', price: 30_000 }]
    });
    expect(survivor.ram_gb).toBeUndefined();
    expect(result.facets[2]).toEqual({ type: 'range', field: 'price', min: 30_000, max: 30_000 });
  });

  it('attributes each removal to its first excluding dimension', async () => {
    const { result, trace } = await traceTurn('search', '', () =>
      applyFilters(products, {
        brands: ['Alpha', 'Gamma'],
        colors: ['red'],
        price: { min: 40_000, max: 50_000 }
      })
    );

    expect(result?.products).toEqual([]);
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]).toMatchObject({
      name: 'apply_filters',
      input: { in: 3 },
      output: { kept: 0, removed: { brands: 1, colors: 1, price: 1 } }
    });
  });
});
