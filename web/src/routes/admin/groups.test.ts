import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../../../test-support/database';
import { createGroup, getGroup, listGroups } from '$lib/server/groups';
import { createParticipant, getParticipant, listParticipants } from '$lib/server/participants';

import { actions as groupActions, load as loadGroup } from './groups/[id]/+page.server';
import { actions, load } from './+page.server';

let db: TestDatabase;

function form(name: string): FormData {
  const data = new FormData();
  data.set('name', name);
  return data;
}

function event(
  options: { id?: string; name?: string; data?: FormData; withDatabase?: boolean } = {}
) {
  const id = options.id ?? '1';
  const url = new URL(`https://phones.llmfn.com/admin/groups/${id}`);
  return {
    params: { id },
    platform: { env: options.withDatabase === false ? {} : { DB: db } },
    request: new Request(url, {
      method: 'POST',
      body: options.data ?? form(options.name ?? 'edition-03')
    }),
    url
  };
}

function participantForm(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

async function expectRedirect(run: () => unknown, location: string) {
  await expect(async () => await run()).rejects.toMatchObject({ status: 303, location });
}

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
});

describe('admin group list', () => {
  it('creates a group and then includes it in the list', async () => {
    await expect(load(event() as never)).resolves.toEqual({ groups: [] });

    await expectRedirect(
      () => actions.create?.(event({ name: '  edition-03  ' }) as never),
      '/admin/groups/1'
    );

    await expect(load(event() as never)).resolves.toMatchObject({
      groups: [{ id: 1, name: 'edition-03', status: 'active' }]
    });
  });

  it('refuses an empty name without creating a row', async () => {
    await expect(actions.create?.(event({ name: '   ' }) as never)).resolves.toMatchObject({
      status: 400,
      data: { error: 'Group name is required.' }
    });
    await expect(listGroups(db)).resolves.toEqual([]);
  });

  it('reports an unavailable database', async () => {
    await expect(load(event({ withDatabase: false }) as never)).rejects.toMatchObject({
      status: 503
    });
  });
});

describe('admin group detail', () => {
  it('loads and renames a group', async () => {
    const group = await createGroup(db, 'edition-02');

    await expect(loadGroup(event({ id: String(group.id) }) as never)).resolves.toEqual({
      group,
      participants: []
    });
    await expectRedirect(
      () => groupActions.rename?.(event({ id: String(group.id), name: 'foundation' }) as never),
      `/admin/groups/${group.id}`
    );
    await expect(getGroup(db, group.id)).resolves.toMatchObject({ name: 'foundation' });
  });

  it('returns not found for malformed and missing group ids', async () => {
    await expect(loadGroup(event({ id: 'banana' }) as never)).rejects.toMatchObject({ status: 404 });
    await expect(loadGroup(event({ id: '999' }) as never)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an empty rename without changing the group', async () => {
    const group = await createGroup(db, 'edition-01');

    await expect(
      groupActions.rename?.(event({ id: String(group.id), name: '   ' }) as never)
    ).resolves.toMatchObject({ status: 400, data: { error: 'Group name is required.' } });
    await expect(getGroup(db, group.id)).resolves.toEqual(group);
  });
});

describe('admin group participants', () => {
  it('adds, lists, edits, deletes, and restores a participant', async () => {
    const group = await createGroup(db, 'edition-03');
    await expectRedirect(
      () =>
        groupActions.addParticipant?.(
          event({
            id: String(group.id),
            data: participantForm({ name: 'Ada Lovelace', email: 'ada@example.com' })
          }) as never
        ),
      `/admin/groups/${group.id}`
    );

    const [participant] = await listParticipants(db, group.id);
    await expect(loadGroup(event({ id: String(group.id) }) as never)).resolves.toMatchObject({
      participants: [{ id: participant.id, subdomain: 'adalovelace', status: 'active' }]
    });

    await expectRedirect(
      () =>
        groupActions.editParticipant?.(
          event({
            id: String(group.id),
            data: participantForm({
              participantId: String(participant.id),
              name: 'Ada',
              email: 'ada@course.test',
              subdomain: 'ada-course'
            })
          }) as never
        ),
      `/admin/groups/${group.id}`
    );
    await expect(getParticipant(db, group.id, participant.id)).resolves.toMatchObject({
      name: 'Ada',
      email: 'ada@course.test',
      subdomain: 'ada-course'
    });

    for (const [action, status] of [
      ['deleteParticipant', 'deleted'],
      ['restoreParticipant', 'active']
    ] as const) {
      await expectRedirect(
        () =>
          groupActions[action]?.(
            event({
              id: String(group.id),
              data: participantForm({ participantId: String(participant.id) })
            }) as never
          ),
        `/admin/groups/${group.id}`
      );
      await expect(getParticipant(db, group.id, participant.id)).resolves.toMatchObject({ status });
    }
  });

  it('returns form errors for invalid participant details and conflicting subdomains', async () => {
    const group = await createGroup(db, 'edition-03');
    const first = await createParticipant(db, group.id, 'Ada', 'ada@example.com');
    const second = await createParticipant(db, group.id, 'Grace', 'grace@example.com');

    await expect(
      groupActions.addParticipant?.(
        event({
          id: String(group.id),
          data: participantForm({ name: 'Invalid', email: 'not-an-email' })
        }) as never
      )
    ).resolves.toMatchObject({ status: 400, data: { action: 'add' } });

    await expect(
      groupActions.editParticipant?.(
        event({
          id: String(group.id),
          data: participantForm({
            participantId: String(first.id),
            name: 'Ada',
            email: 'ada@example.com',
            subdomain: second.subdomain
          })
        }) as never
      )
    ).resolves.toMatchObject({
      status: 409,
      data: { action: 'edit', participantId: first.id }
    });
  });

  it('does not mutate a participant through another group', async () => {
    const group = await createGroup(db, 'edition-03');
    const other = await createGroup(db, 'edition-04');
    const participant = await createParticipant(db, group.id, 'Ada', 'ada@example.com');

    await expect(
      groupActions.deleteParticipant?.(
        event({
          id: String(other.id),
          data: participantForm({ participantId: String(participant.id) })
        }) as never
      )
    ).rejects.toMatchObject({ status: 404 });
    await expect(getParticipant(db, group.id, participant.id)).resolves.toMatchObject({
      status: 'active'
    });
  });
});
