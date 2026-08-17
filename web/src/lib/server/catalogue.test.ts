import { describe, expect, it } from 'vitest';

import type { CataloguePhone } from '$lib/schema';

import { CATALOGUE, projectProduct } from './catalogue';

describe('generated catalogue', () => {
  it('contains every phone once in deterministic order', () => {
    expect(CATALOGUE).toHaveLength(136);
    expect(new Set(CATALOGUE.map((phone) => phone.id)).size).toBe(CATALOGUE.length);
    expect(CATALOGUE.map((phone) => phone.id)).toEqual(
      [...CATALOGUE]
        .sort((left, right) => {
          const leftFilename = `${left.id}.json`;
          const rightFilename = `${right.id}.json`;
          return leftFilename < rightFilename ? -1 : leftFilename > rightFilename ? 1 : 0;
        })
        .map((phone) => phone.id)
    );
  });
});

describe('product projection', () => {
  it('uses the first colour and storage option as the lead configuration', () => {
    const phone: CataloguePhone = {
      id: 'phone-one',
      brand: 'Example',
      name: 'Phone One',
      narrative: 'A phone.',
      specs: {},
      signals: { use_cases: [], personas: [], price_segment: '' },
      colors: [
        { name: 'Ocean', family: 'blue', hex: '#123456', image: 'blue.jpg' },
        { name: 'Night', family: 'black', image: 'black.jpg' }
      ],
      storage_options: [
        { gb: 128, label: '128GB', ram_gb: 8, price: 10000 },
        { gb: 256, label: '256GB', price: 12000 }
      ]
    };

    expect(projectProduct(phone)).toEqual({
      id: 'phone-one',
      name: 'Phone One',
      brand: 'Example',
      price: 10000,
      image: 'blue.jpg',
      variant_id: 'phone-one-blue-128',
      color_name: 'Ocean',
      color_family: 'blue',
      storage_gb: 128,
      storage_label: '128GB',
      ram_gb: 8,
      colors: [
        { name: 'Ocean', family: 'blue', hex: '#123456', image: 'blue.jpg' },
        { name: 'Night', family: 'black', image: 'black.jpg' }
      ],
      storage_options: [
        { gb: 128, label: '128GB', ram_gb: 8, price: 10000 },
        { gb: 256, label: '256GB', price: 12000 }
      ]
    });
  });
});
