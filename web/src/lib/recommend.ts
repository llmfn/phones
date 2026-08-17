import type { SearchResult } from '$lib/schema';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function recommend(query: string, signal?: AbortSignal, fetcher: Fetch = fetch): Promise<SearchResult> {
  const response = await fetcher('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters: {} }),
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
