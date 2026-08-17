import type { Filters, Product, SearchResult } from '$lib/schema';
import { traceStep } from '$lib/server/trace';

import { computeFacets } from './facets';

type FilterField = 'brands' | 'colors' | 'price';

function filterProduct(product: Product, filters: Filters): [Product | null, FilterField | null] {
  if (filters.brands.length && !filters.brands.includes(product.brand)) return [null, 'brands'];

  const colors = filters.colors.length
    ? product.colors.filter((color) => filters.colors.includes(color.family))
    : product.colors;
  if (!colors.length) return [null, 'colors'];

  const storageOptions = filters.price
    ? product.storage_options.filter(
        (option) => option.price >= filters.price!.min && option.price <= filters.price!.max
      )
    : product.storage_options;
  if (!storageOptions.length) return [null, 'price'];

  if (colors === product.colors && storageOptions === product.storage_options) return [product, null];

  const leadColor = colors[0];
  const leadStorage = storageOptions[0];
  return [
    {
      ...product,
      price: leadStorage.price,
      image: leadColor.image,
      variant_id: `${product.id}-${leadColor.family}-${leadStorage.gb}`,
      color_name: leadColor.name,
      color_family: leadColor.family,
      storage_gb: leadStorage.gb,
      storage_label: leadStorage.label,
      ram_gb: leadStorage.ram_gb,
      colors,
      storage_options: storageOptions
    },
    null
  ];
}

export async function applyFilters(products: Product[], filters: Filters): Promise<SearchResult> {
  if (!filters.brands.length && !filters.colors.length && !filters.price) {
    return { products, facets: computeFacets(products) };
  }

  return traceStep('apply_filters', { in: products.length, filters }, (step) => {
    const survivors: Product[] = [];
    const removed: Partial<Record<FilterField, number>> = {};

    for (const product of products) {
      const [survivor, cut] = filterProduct(product, filters);
      if (survivor) survivors.push(survivor);
      else if (cut) removed[cut] = (removed[cut] ?? 0) + 1;
    }

    step.setOutput({ kept: survivors.length, removed });
    return { products: survivors, facets: computeFacets(survivors) };
  });
}
