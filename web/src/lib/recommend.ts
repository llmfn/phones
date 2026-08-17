import type { Filters, SearchResult } from '$lib/schema';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface RecommendOptions {
  signal?: AbortSignal;
  /** Pins the request to a revision, so a page opened at `?r=` stays there. */
  revision?: number | null;
  fetcher?: Fetch;
}

export async function recommend(
  query: string,
  filters: Filters,
  options: RecommendOptions = {}
): Promise<SearchResult> {
  const { signal, revision = null, fetcher = fetch } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (revision !== null) headers['X-Phones-Revision'] = String(revision);

  const response = await fetcher('/api/recommend', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, filters }),
    signal
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? 'Search returned an invalid response' : `Search failed (${response.status})`);
  }

  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : `Search failed (${response.status})`;
    throw new Error(message);
  }
  if (!isRecord(body) || !Array.isArray(body.products) || !Array.isArray(body.facets)) {
    throw new Error('Search returned an invalid response');
  }

  return body as unknown as SearchResult;
}
