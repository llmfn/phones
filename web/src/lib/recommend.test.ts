import { describe, expect, it, vi } from 'vitest';

import { recommend } from './recommend';

const NO_FILTERS = { brands: [], colors: [], price: null };

describe('recommend', () => {
  it('posts a query and filters to the same-origin endpoint', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ products: [{ id: 'phone-1' }], facets: [] })
    );

    const filters = { brands: ['Apple'], colors: ['black'], price: { min: 50_000, max: 90_000 } };
    const result = await recommend('iphone', filters, { fetcher });

    expect(result.products).toEqual([{ id: 'phone-1' }]);
    expect(fetcher).toHaveBeenCalledWith('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'iphone', filters }),
      signal: undefined
    });
  });

  it('pins the request to a revision only when it is asked for', async () => {
    async function headersFor(revision?: number) {
      let sent: Record<string, string> = {};
      const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
        sent = init?.headers as Record<string, string>;
        return Response.json({ products: [], facets: [] });
      };
      await recommend('iphone', NO_FILTERS, { fetcher, revision });
      return sent;
    }

    expect(await headersFor(3)).toMatchObject({ 'X-Phones-Revision': '3' });
    expect(await headersFor()).not.toHaveProperty('X-Phones-Revision');
  });

  it('uses the API error message when one is available', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Search is unavailable' }, { status: 503 }));

    await expect(recommend('iphone', NO_FILTERS, { fetcher })).rejects.toThrow(
      'Search is unavailable'
    );
  });

  it('handles non-JSON errors and malformed success responses', async () => {
    const failed = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    const malformed = vi.fn(async () => Response.json({ products: [] }));

    await expect(recommend('iphone', NO_FILTERS, { fetcher: failed })).rejects.toThrow(
      'Search failed (502)'
    );
    await expect(recommend('iphone', NO_FILTERS, { fetcher: malformed })).rejects.toThrow(
      'Search returned an invalid response'
    );
  });
});
