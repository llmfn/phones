import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../../../test-support/database';
import { appendRevision, ensureSite, listRevisions, loadRevision } from './revisions';
import { parseSiteConfig } from '$lib/site-config';

const BM25 = parseSiteConfig({ search: { method: 'bm25', search_params: { k1: 1.2, b: 0.5 } } });

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
});

describe('the revision store', () => {
  it('serves the defaults for a slug with no rows', async () => {
    await expect(loadRevision(db, 'nobody', null)).resolves.toEqual({
      config: parseSiteConfig({}),
      revision: null
    });
  });

  it('seeds revision 1 with the defaults, once', async () => {
    await ensureSite(db, 'alice');
    await ensureSite(db, 'alice');

    await expect(loadRevision(db, 'alice', null)).resolves.toEqual({
      config: parseSiteConfig({}),
      revision: 1
    });
    await expect(listRevisions(db, 'alice')).resolves.toHaveLength(1);
  });

  it('appends the next revision and makes it live', async () => {
    await ensureSite(db, 'alice');

    await expect(appendRevision(db, 'alice', BM25, 'try bm25')).resolves.toBe(2);
    await expect(loadRevision(db, 'alice', null)).resolves.toEqual({ config: BM25, revision: 2 });
    await expect(loadRevision(db, 'alice', 1)).resolves.toEqual({
      config: parseSiteConfig({}),
      revision: 1
    });
  });

  it('gives racing saves distinct revision numbers', async () => {
    await ensureSite(db, 'alice');

    const revisions = await Promise.all([
      appendRevision(db, 'alice', BM25, 'one'),
      appendRevision(db, 'alice', BM25, 'two'),
      appendRevision(db, 'alice', BM25, 'three')
    ]);

    expect(new Set(revisions).size).toBe(3);
    expect([...revisions].sort()).toEqual([2, 3, 4]);
  });

  it('refuses a second row for a revision that already exists', async () => {
    await ensureSite(db, 'alice');

    await expect(
      db
        .prepare(
          `INSERT INTO siteconfig (site_id, revision, config, note, created_at)
           VALUES (1, 1, '{}', NULL, datetime('now'))`
        )
        .run()
    ).rejects.toThrow(/UNIQUE/);
  });

  it('has nothing to serve for a revision the site does not have', async () => {
    await ensureSite(db, 'alice');

    await expect(loadRevision(db, 'alice', 99)).resolves.toBeNull();
    await expect(loadRevision(db, 'nobody', 1)).resolves.toBeNull();
  });

  it('lists every revision newest first', async () => {
    await ensureSite(db, 'alice');
    await appendRevision(db, 'alice', BM25, 'try bm25');

    await expect(listRevisions(db, 'alice')).resolves.toMatchObject([
      { revision: 2, note: 'try bm25' },
      { revision: 1 }
    ]);
  });

  it('keeps one site out of another', async () => {
    await ensureSite(db, 'alice');
    await ensureSite(db, 'bob');
    await appendRevision(db, 'alice', BM25, 'try bm25');

    await expect(loadRevision(db, 'bob', null)).resolves.toMatchObject({ revision: 1 });
    await expect(loadRevision(db, 'bob', 2)).resolves.toBeNull();
  });
});
