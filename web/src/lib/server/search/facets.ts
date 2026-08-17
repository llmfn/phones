import type { Facet, FacetValue, Product } from '$lib/schema';

function categorical(field: string, counts: Map<string, number>, hexes?: Map<string, string>): Facet {
  const values: FacetValue[] = [...counts].map(([value, count]) => ({
    value,
    count,
    ...(hexes?.get(value) ? { hex: hexes.get(value) } : {})
  }));
  values.sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  return { type: 'categorical', field, values };
}

export function computeFacets(products: Product[]): Facet[] {
  const brands = new Map<string, number>();
  const colors = new Map<string, number>();
  const colorHexes = new Map<string, string>();
  const prices: number[] = [];

  for (const product of products) {
    brands.set(product.brand, (brands.get(product.brand) ?? 0) + 1);
    for (const color of product.colors) {
      colors.set(color.family, (colors.get(color.family) ?? 0) + 1);
      if (color.hex && !colorHexes.has(color.family)) colorHexes.set(color.family, color.hex);
    }
    for (const option of product.storage_options) prices.push(option.price);
  }

  return [
    categorical('brand', brands),
    categorical('color', colors, colorHexes),
    { type: 'range', field: 'price', min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 }
  ];
}
