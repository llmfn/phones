import type { Filters, PriceRange } from '$lib/schema';

const FILTER_KEYS = ['brands', 'colors', 'price'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], name: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown ${name} field: ${unknown}`);
}

function stringList(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings`);
  }
  return [...value];
}

function priceRange(value: unknown): PriceRange | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error('filters.price must be an object or null');
  rejectUnknownKeys(value, ['min', 'max'], 'filters.price');
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) {
    throw new Error('filters.price min and max must be finite numbers');
  }
  const min = value.min as number;
  const max = value.max as number;
  if (min > max) throw new Error('filters.price min must not exceed max');
  return { min, max };
}

export function parseFilters(value: unknown): Filters {
  if (value === undefined || value === null) return { brands: [], colors: [], price: null };
  if (!isRecord(value)) throw new Error('filters must be an object');
  rejectUnknownKeys(value, FILTER_KEYS, 'filters');
  return {
    brands: stringList(value.brands, 'filters.brands'),
    colors: stringList(value.colors, 'filters.colors'),
    price: priceRange(value.price)
  };
}
