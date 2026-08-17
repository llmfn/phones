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
    expect(body.facets).toEqual([]);
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
    expect((await post({ query: 'apple' })).body.products).toEqual([]);
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

  it('returns pipeline failures as inspectable error turns', async () => {
    const failedEvent = event({ query: 'iphone' });
    failedEvent.locals.config = parseSiteConfig({ search: { method: 'bm25' } });
    const response = await POST(failedEvent as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.products).toEqual([]);
    expect(body.trace).toMatchObject({
      kind: 'search',
      input: 'iphone',
      steps: [],
      status: 'error',
      error: 'BM25 search is not implemented'
    });
  });
});
