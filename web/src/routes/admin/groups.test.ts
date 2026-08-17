import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../../../test-support/database';
import { createGroup, getGroup, listGroups } from '$lib/server/groups';

import { actions as groupActions, load as loadGroup } from './groups/[id]/+page.server';
import { actions, load } from './+page.server';

let db: TestDatabase;

function form(name: string): FormData {
  const data = new FormData();
  data.set('name', name);
  return data;
}

function event(options: { id?: string; name?: string; withDatabase?: boolean } = {}) {
  const id = options.id ?? '1';
  const url = new URL(`https://phones.llmfn.com/admin/groups/${id}`);
  return {
    params: { id },
    platform: { env: options.withDatabase === false ? {} : { DB: db } },
    request: new Request(url, {
      method: 'POST',
      body: form(options.name ?? 'edition-03')
    }),
    url
  };
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

    await expect(loadGroup(event({ id: String(group.id) }) as never)).resolves.toEqual({ group });
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
