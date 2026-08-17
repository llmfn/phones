import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../../../test-support/database';
import { signCredential } from '$lib/server/auth';
import { listRevisions, loadRevision } from '$lib/server/revisions';

import { actions, load } from './+page.server';

const SECRET = 'studio-page-test-secret';
const HOSTNAME = 'alice-phones.llmfn.com';

let db: TestDatabase;
let session: string;

function event(options: { form?: FormData; revision?: number | null; token?: string } = {}) {
  const url = new URL(`https://${HOSTNAME}/studio`);
  return {
    cookies: { delete: vi.fn(), get: vi.fn().mockReturnValue(options.token ?? session) },
    locals: { revision: options.revision ?? null },
    platform: { env: { AUTH_SECRET: SECRET, DB: db } },
    request: new Request(url, { method: 'POST', body: options.form ?? new FormData() }),
    url
  };
}

function form(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
}

/** Redirects arrive as a throw, whether the handler is sync or async. */
async function expectRedirect(run: () => unknown, location: string) {
  await expect(async () => await run()).rejects.toMatchObject({ status: 303, location });
}

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
  session = await signCredential('session', HOSTNAME, SECRET, 300);
});

describe('studio session', () => {
  it('allows the session only on its own subdomain', async () => {
    await expect(load(event() as never)).resolves.toMatchObject({ slug: 'alice', live: 1 });
  });

  it('sends a signed-out visitor to the login page', async () => {
    await expectRedirect(() => load(event({ token: 'not-a-session' }) as never), '/studio/login');
  });

  it('deletes the host-only session on logout', async () => {
    const logout = event();

    await expectRedirect(() => actions.logout?.(logout as never), '/');
    expect(logout.cookies.delete).toHaveBeenCalledWith(
      'phones_session',
      expect.not.objectContaining({ domain: expect.anything() })
    );
  });
});

describe('the search panel', () => {
  it('opens a new site on the seeded revision', async () => {
    await expect(load(event() as never)).resolves.toMatchObject({
      config: { search: { method: 'substring_match' } },
      revision: 1,
      live: 1
    });
  });

  it('saves a method and its params as the next revision', async () => {
    await load(event() as never);
    const saved = form({ method: 'bm25', k1: '1.2', b: '0.5', note: 'try bm25' });

    await expectRedirect(() => actions.save?.(event({ form: saved }) as never), '/studio');

    await expect(loadRevision(db, 'alice', null)).resolves.toMatchObject({
      revision: 2,
      config: { search: { method: 'bm25', search_params: { k1: 1.2, b: 0.5 } } }
    });
    await expect(listRevisions(db, 'alice')).resolves.toMatchObject([
      { revision: 2, note: 'try bm25' },
      { revision: 1 }
    ]);
  });

  it('refuses a param belonging to another method, naming the field', async () => {
    await load(event() as never);
    const crossed = form({ method: 'bm25', min_score: '0.4' });

    await expect(actions.save?.(event({ form: crossed }) as never)).resolves.toMatchObject({
      status: 400,
      data: { error: 'Unknown bm25 search_params field: min_score' }
    });
    await expect(listRevisions(db, 'alice')).resolves.toHaveLength(1);
  });

  it('shows an older revision read only and refuses to save over it', async () => {
    await load(event() as never);
    const saved = form({ method: 'bm25', note: 'try bm25' });
    await expectRedirect(() => actions.save?.(event({ form: saved }) as never), '/studio');

    await expect(load(event({ revision: 1 }) as never)).resolves.toMatchObject({
      config: { search: { method: 'substring_match' } },
      revision: 1,
      live: 2
    });
    await expect(
      actions.save?.(event({ form: saved, revision: 1 }) as never)
    ).resolves.toMatchObject({ status: 409 });
  });

  it('leaves the other sections of the config alone', async () => {
    await load(event() as never);
    const seeded = form({ method: 'bm25' });
    await expectRedirect(() => actions.save?.(event({ form: seeded }) as never), '/studio');

    await expect(loadRevision(db, 'alice', null)).resolves.toMatchObject({
      config: { prompts: { rewrite: '' }, design: { FILTER_UI: 'sidebar' } }
    });
  });
});
