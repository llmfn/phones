import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';
import { parseSiteConfig } from '$lib/site-config';

import { POST } from './+server';

function event(body: unknown, url = 'https://alice-phones.llmfn.com/api/recommend') {
  return {
    locals: { config: parseSiteConfig({}) },
    request: new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }),
    url: new URL(url)
  };
}

async function post(body: unknown, url?: string) {
  const response = await POST(event(body, url) as never);
  return { response, body: await response.json() };
}

describe('POST /api/recommend', () => {
  it('serves substring results through the configured pipeline', async () => {
    const { response, body } = await post({ query: 'iphone', filters: {} });
    const matchingIphones = CATALOGUE.filter((phone) => phone.name.toLowerCase().includes('iphone'));
    expect(response.status).toBe(200);
    expect(body.facets).toEqual(expect.arrayContaining([
      {
        type: 'categorical',
        field: 'brand',
        values: [{ value: 'Apple', count: matchingIphones.length }]
      }
    ]));
    expect(body.products).toHaveLength(matchingIphones.length);
    expect(body.products.every((phone: { name: string }) => phone.name.toLowerCase().includes('iphone'))).toBe(
      true
    );
    expect(body.trace).toMatchObject({
      kind: 'search',
      input: 'iphone',
      status: 'success',
      steps: [
        {
          layer: 1,
          name: 'search_substring_match',
          label: 'substring match',
          status: 'success',
          input: { query: 'iphone', field: 'name' },
          output: {
            matched: matchingIphones.length,
            returned: matchingIphones.length,
            shown_matches: matchingIphones.slice(0, 10).map((phone) => ({ id: phone.id, name: phone.name }))
          }
        }
      ]
    });
    expect(body.trace.steps[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('supports empty and unmatched queries', async () => {
    expect((await post({ query: '' })).body.products).toHaveLength(CATALOGUE.length);
    const unmatched = (await post({ query: 'apple' })).body;
    expect(unmatched.products).toEqual([]);
    expect(unmatched.facets).toEqual([
      { type: 'categorical', field: 'brand', values: [] },
      { type: 'categorical', field: 'color', values: [] },
      { type: 'range', field: 'price', min: 0, max: 0 }
    ]);
  });

  it('scopes facets to each query result set', async () => {
    const full = (await post({ query: '' })).body.facets;
    const iphones = (await post({ query: 'iphone' })).body.facets;

    expect(iphones).not.toEqual(full);
    expect(iphones.find((facet: { field: string }) => facet.field === 'brand').values).toEqual([
      { value: 'Apple', count: CATALOGUE.filter((phone) => phone.name.toLowerCase().includes('iphone')).length }
    ]);
    expect(iphones.find((facet: { field: string }) => facet.field === 'price')).not.toEqual(
      full.find((facet: { field: string }) => facet.field === 'price')
    );
  });

  it('filters products, trims options, and reports consistent removals', async () => {
    const full = (await post({ query: '', filters: {} })).body;
    const source = full.products.find(
      (product: { colors: unknown[]; storage_options: unknown[] }) =>
        product.colors.length > 1 && product.storage_options.length > 1
    );
    expect(source).toBeDefined();
    const color = source.colors[1];
    const storage = source.storage_options[1];

    const filtered = (
      await post({
        query: '',
        filters: {
          brands: [source.brand],
          colors: [color.family],
          price: { min: storage.price, max: storage.price }
        }
      })
    ).body;
    const survivor = filtered.products.find((product: { id: string }) => product.id === source.id);

    expect(survivor).toMatchObject({
      image: color.image,
      color_family: color.family,
      price: storage.price,
      storage_gb: storage.gb,
      variant_id: `${source.id}-${color.family}-${storage.gb}`
    });
    expect(survivor.colors.every((option: { family: string }) => option.family === color.family)).toBe(true);
    expect(survivor.storage_options.every((option: { price: number }) => option.price === storage.price)).toBe(true);
    expect(filtered.facets.find((facet: { field: string }) => facet.field === 'price')).toMatchObject({
      min: storage.price,
      max: storage.price
    });

    const filterStep = filtered.trace.steps.find((step: { name: string }) => step.name === 'apply_filters');
    const removed = Object.values(filterStep.output.removed as Record<string, number>).reduce(
      (total: number, count) => total + count,
      0
    );
    expect(filterStep.input.in).toBe(full.products.length);
    expect(filterStep.output.kept + removed).toBe(filterStep.input.in);
    expect(full.trace.steps.some((step: { name: string }) => step.name === 'apply_filters')).toBe(false);
  });

  it('restores the full result set when filters are cleared', async () => {
    const filtered = (await post({ query: '', filters: { brands: ['Apple'] } })).body;
    const cleared = (await post({ query: '', filters: {} })).body;

    expect(filtered.products.length).toBeLessThan(cleared.products.length);
    expect(cleared.products).toHaveLength(CATALOGUE.length);
  });

  it('rejects malformed requests', async () => {
    expect((await post('{')).response.status).toBe(400);
    expect((await post({ query: 42 })).body).toEqual({ error: 'query must be a string' });
    expect((await post({ query: '', filters: { brands: 'Apple' } })).body).toEqual({
      error: 'filters.brands must be an array of strings'
    });
  });

  it('does not expose the student API on the apex', async () => {
    const { response } = await post({}, 'https://phones.llmfn.com/api/recommend');
    expect(response.status).toBe(404);
  });

  it('serves configured BM25 rankings with an inspectable trace', async () => {
    const bm25Event = event({
      query: 'pro iphone 16',
      filters: { brands: ['Apple'] }
    });
    bm25Event.locals.config = parseSiteConfig({
      search: { method: 'bm25' }
    });
    const response = await POST(bm25Event as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.products[0].id).toBe('apple-iphone-16-pro');
    expect(body.trace).toMatchObject({
      kind: 'search',
      input: 'pro iphone 16',
      status: 'success',
      steps: [
        {
          name: 'search_bm25',
          label: 'keyword search',
          input: { query: 'pro iphone 16' },
          output: {
            catalogue_size: CATALOGUE.length,
            k1: 1.5,
            b: 0.75
          }
        },
        { name: 'apply_filters' }
      ]
    });
  });
});
