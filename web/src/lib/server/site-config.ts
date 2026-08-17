import type { Database } from '$lib/server/database';
import { loadRevision, type LoadedConfig } from '$lib/server/revisions';
import { parseSiteConfig } from '$lib/site-config';

/**
 * Resolve a site's configuration, at a revision when one is asked for.
 *
 * Returns null for a revision the site does not have, so the caller can 404
 * rather than quietly serving the live one instead.
 */
export async function resolveSiteConfig(
  db: Database | undefined,
  slug: string | null,
  revision: number | null
): Promise<LoadedConfig | null> {
  if (!db || !slug) {
    return revision === null ? { config: parseSiteConfig({}), revision: null } : null;
  }
  return loadRevision(db, slug, revision);
}
