import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigration,
  applyMigrations,
  createTestDatabase,
  type TestDatabase
} from '../../../test-support/database';
import { createGroup, listGroups } from './groups';
import {
  createParticipant,
  generatedSubdomain,
  getParticipant,
  listParticipants,
  setParticipantStatus,
  resolveParticipantSite,
  SubdomainConflict,
  updateParticipant
} from './participants';
import { ensureSite, loadRevision } from './revisions';

let db: TestDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
});

describe('the participant store', () => {
  it('generates unique subdomains from names and falls back to the email local part', async () => {
    const group = await createGroup(db, 'edition-03');

    const first = await createParticipant(db, group.id, '  Mary Jane  ', 'mary@example.com');
    const second = await createParticipant(db, group.id, 'Mary Jane', 'other@example.com');
    const unnamed = await createParticipant(db, group.id, null, 'Ada.Lovelace+course@example.com');

    expect(first).toMatchObject({ name: 'Mary Jane', subdomain: 'maryjane', status: 'active' });
    expect(second.subdomain).toBe('maryjane-2');
    expect(unnamed).toMatchObject({ name: null, subdomain: 'adalovelacecourse' });
    expect(generatedSubdomain(' !!! ', 'valid@example.com')).toBeNull();
  });

  it('lists active participants first and counts only active participants', async () => {
    const group = await createGroup(db, 'edition-03');
    const deleted = await createParticipant(db, group.id, 'Deleted', 'deleted@example.com');
    const active = await createParticipant(db, group.id, 'Active', 'active@example.com');
    await setParticipantStatus(db, group.id, deleted.id, 'deleted');

    await expect(listParticipants(db, group.id)).resolves.toMatchObject([
      { id: active.id, status: 'active' },
      { id: deleted.id, status: 'deleted' }
    ]);
    await expect(listGroups(db)).resolves.toMatchObject([{ participant_count: 1 }]);

    await setParticipantStatus(db, group.id, deleted.id, 'active');
    await expect(listGroups(db)).resolves.toMatchObject([{ participant_count: 2 }]);
  });

  it('edits active participants while protecting another participant subdomain', async () => {
    const group = await createGroup(db, 'edition-03');
    const first = await createParticipant(db, group.id, 'Ada', 'ada@example.com');
    const second = await createParticipant(db, group.id, 'Grace', 'grace@example.com');

    await expect(
      updateParticipant(db, group.id, first.id, {
        name: 'Ada Lovelace',
        email: 'ada@course.test',
        subdomain: 'ada-lovelace'
      })
    ).resolves.toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@course.test',
      subdomain: 'ada-lovelace'
    });
    await expect(resolveParticipantSite(db, 'ada')).resolves.toBeNull();
    await expect(resolveParticipantSite(db, 'ada-lovelace')).resolves.toBe('active');
    await expect(
      updateParticipant(db, group.id, first.id, {
        name: 'Ada',
        email: 'ada@example.com',
        subdomain: second.subdomain
      })
    ).rejects.toBeInstanceOf(SubdomainConflict);
  });

  it('soft-deletes and restores only a participant in the selected group', async () => {
    const group = await createGroup(db, 'edition-03');
    const other = await createGroup(db, 'edition-04');
    const participant = await createParticipant(db, group.id, 'Ada', 'ada@example.com');

    await expect(setParticipantStatus(db, other.id, participant.id, 'deleted')).resolves.toBeNull();
    await expect(setParticipantStatus(db, group.id, participant.id, 'deleted')).resolves.toMatchObject({
      status: 'deleted'
    });
    await expect(setParticipantStatus(db, group.id, participant.id, 'active')).resolves.toMatchObject({
      status: 'active'
    });
    await expect(getParticipant(db, group.id, participant.id)).resolves.toMatchObject({
      status: 'active'
    });
  });

  it('adds participants without disturbing existing sites and groups', async () => {
    const existing = createTestDatabase();
    await applyMigration(existing, '../migrations/0001_site_config.sql');
    await ensureSite(existing, 'alice');
    await applyMigration(existing, '../migrations/0002_admin_groups.sql');
    const group = await createGroup(existing, 'edition-03');

    await applyMigration(existing, '../migrations/0003_admin_participants.sql');
    await createParticipant(existing, group.id, 'Ada', 'ada@example.com');

    await expect(loadRevision(existing, 'alice', null)).resolves.toMatchObject({ revision: 1 });
    await expect(listParticipants(existing, group.id)).resolves.toHaveLength(1);
  });

  it('repairs a database that applied participants before subdomain history existed', async () => {
    const partial = createTestDatabase();
    await applyMigration(partial, '../migrations/0001_site_config.sql');
    await applyMigration(partial, '../migrations/0002_admin_groups.sql');
    await partial.exec(`
      CREATE TABLE participants (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        name TEXT,
        email TEXT NOT NULL,
        subdomain TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX participants_group_id ON participants(group_id);
    `);
    const group = await createGroup(partial, 'edition-03');
    await partial
      .prepare(
        `INSERT INTO participants (group_id, name, email, subdomain, status, created_at)
         VALUES (?, 'Ada', 'ada@example.com', 'ada', 'active', datetime('now'))`
      )
      .bind(group.id)
      .run();
    await ensureSite(partial, 'ada');

    await applyMigration(partial, '../migrations/0004_participant_subdomain_history.sql');
    await updateParticipant(partial, group.id, 1, {
      name: 'Ada',
      email: 'ada@example.com',
      subdomain: 'ada-course'
    });

    await expect(resolveParticipantSite(partial, 'ada')).resolves.toBeNull();
    await expect(resolveParticipantSite(partial, 'ada-course')).resolves.toBe('active');
  });
});
