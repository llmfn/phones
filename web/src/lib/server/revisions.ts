import { DEFAULT_SITE_CONFIG, parseSiteConfig, type SiteConfig } from '$lib/site-config';

/** The slice of D1 this module uses, declared here so a test can stand it up. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<Row = Record<string, unknown>>(column?: string): Promise<Row | null>;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
}

export interface Database {
  prepare(sql: string): Statement;
}

export interface Revision {
  revision: number;
  note: string | null;
  created_at: string;
}

export interface LoadedConfig {
  config: SiteConfig;
  /** The revision serving the config, or null when the site has none yet. */
  revision: number | null;
}

/**
 * Create the site and seed revision 1 with the defaults, if it is not there.
 *
 * Seeding means history always starts at 1 rather than at whatever the student
 * first saved, so every revision in the list is something they can go back to.
 */
export async function ensureSite(db: Database, slug: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO site (slug, created_at) VALUES (?, datetime('now'))")
    .bind(slug)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO siteconfig (site_id, revision, config, note, created_at)
       SELECT id, 1, ?, ?, datetime('now') FROM site WHERE slug = ?`
    )
    .bind(JSON.stringify(DEFAULT_SITE_CONFIG), 'Starting configuration', slug)
    .run();
}

/**
 * Read a site's configuration at a revision, or at the live one when null.
 *
 * Returns null for a revision the site does not have, which is what lets the
 * caller 404 rather than quietly serving something else.
 */
export async function loadRevision(
  db: Database,
  slug: string,
  revision: number | null
): Promise<LoadedConfig | null> {
  const row =
    revision === null
      ? await db
          .prepare(
            `SELECT revision, config FROM siteconfig
               JOIN site ON site.id = siteconfig.site_id
              WHERE site.slug = ? ORDER BY revision DESC LIMIT 1`
          )
          .bind(slug)
          .first<{ revision: number; config: string }>()
      : await db
          .prepare(
            `SELECT revision, config FROM siteconfig
               JOIN site ON site.id = siteconfig.site_id
              WHERE site.slug = ? AND revision = ?`
          )
          .bind(slug, revision)
          .first<{ revision: number; config: string }>();

  if (!row) {
    return revision === null ? { config: parseSiteConfig({}), revision: null } : null;
  }
  return { config: parseSiteConfig(JSON.parse(row.config)), revision: row.revision };
}

/** Every revision of a site, newest first. */
export async function listRevisions(db: Database, slug: string): Promise<Revision[]> {
  const { results } = await db
    .prepare(
      `SELECT revision, note, siteconfig.created_at AS created_at FROM siteconfig
         JOIN site ON site.id = siteconfig.site_id
        WHERE site.slug = ? ORDER BY revision DESC`
    )
    .bind(slug)
    .all<Revision>();
  return results;
}

/**
 * Append a revision and return its number.
 *
 * The number is derived inside the insert rather than read first, so two saves
 * racing each other cannot land on the same one — and the unique constraint on
 * (site_id, revision) is there to say so if they ever do.
 */
export async function appendRevision(
  db: Database,
  slug: string,
  config: SiteConfig,
  note: string | null
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO siteconfig (site_id, revision, config, note, created_at)
       SELECT id,
              COALESCE((SELECT MAX(revision) FROM siteconfig WHERE site_id = site.id), 0) + 1,
              ?, ?, datetime('now')
         FROM site WHERE slug = ?
       RETURNING revision`
    )
    .bind(JSON.stringify(config), note, slug)
    .first<{ revision: number }>();

  if (!row) throw new Error(`No site named ${slug}`);
  return row.revision;
}
