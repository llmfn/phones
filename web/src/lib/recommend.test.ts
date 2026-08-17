import { describe, expect, it, vi } from 'vitest';

import { recommend } from './recommend';

describe('recommend', () => {
  it('posts a query and empty filters to the same-origin endpoint', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ products: [{ id: 'phone-1' }], facets: [] })
    );

    const result = await recommend('iphone', undefined, fetcher);

    expect(result.products).toEqual([{ id: 'phone-1' }]);
    expect(fetcher).toHaveBeenCalledWith('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'iphone', filters: {} }),
      signal: undefined
    });
  });

  it('uses the API error message when one is available', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Search is unavailable' }, { status: 503 }));

    await expect(recommend('iphone', undefined, fetcher)).rejects.toThrow('Search is unavailable');
  });

  it('handles non-JSON errors and malformed success responses', async () => {
    const failed = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    const malformed = vi.fn(async () => Response.json({ products: [] }));

    await expect(recommend('iphone', undefined, failed)).rejects.toThrow('Search failed (502)');
    await expect(recommend('iphone', undefined, malformed)).rejects.toThrow('Search returned an invalid response');
  });
});
