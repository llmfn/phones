export function readSearchQuery(url: URL): string | null {
  return url.searchParams.has('q') ? (url.searchParams.get('q') ?? '') : null;
}

export function writeSearchQuery(url: URL, query: string): URL {
  const next = new URL(url);
  next.searchParams.set('q', query.trim());
  return next;
}
