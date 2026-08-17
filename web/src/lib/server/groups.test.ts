import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigration,
  applyMigrations,
  createTestDatabase,
  type TestDatabase
} from '../../../test-support/database';
import { ensureSite, loadRevision } from './revisions';
import { createGroup, getGroup, groupName, listGroups, renameGroup } from './groups';

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
});

describe('the group store', () => {
  it('creates active groups and lists the newest first', async () => {
    const first = await createGroup(db, '  edition-01  ');
    const second = await createGroup(db, 'edition-02');
    await db.prepare("UPDATE groups SET status = 'archived' WHERE id = ?").bind(first.id).run();

    expect(first).toMatchObject({ name: 'edition-01', status: 'active' });
    await expect(listGroups(db)).resolves.toMatchObject([
      { id: second.id, name: 'edition-02' },
      { id: first.id, name: 'edition-01', status: 'archived' }
    ]);
  });

  it('renames only the selected group without changing its status or creation time', async () => {
    const original = await createGroup(db, 'edition-01');
    const other = await createGroup(db, 'edition-02');

    await expect(renameGroup(db, original.id, '  foundation  ')).resolves.toEqual({
      ...original,
      name: 'foundation'
    });
    await expect(getGroup(db, other.id)).resolves.toEqual(other);
    await expect(renameGroup(db, 999, 'missing')).resolves.toBeNull();
  });

  it('requires a non-empty name and enforces the status values in the schema', async () => {
    expect(groupName('   ')).toBeNull();
    await expect(createGroup(db, '   ')).rejects.toThrow(/required/);
    await expect(
      db
        .prepare(
          "INSERT INTO groups (name, status, created_at) VALUES ('bad', 'deleted', datetime('now'))"
        )
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it('adds groups without disturbing an existing site configuration database', async () => {
    const existing = createTestDatabase();
    await applyMigration(existing, '../migrations/0001_site_config.sql');
    await ensureSite(existing, 'alice');

    await applyMigration(existing, '../migrations/0002_admin_groups.sql');
    await createGroup(existing, 'edition-03');

    await expect(loadRevision(existing, 'alice', null)).resolves.toMatchObject({ revision: 1 });
    await expect(listGroups(existing)).resolves.toMatchObject([{ name: 'edition-03' }]);
  });
});
