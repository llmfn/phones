import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../test-support/database';
import { ADMIN_SESSION_COOKIE, createAdminSession } from '$lib/server/admin-auth';
import { createGroup } from '$lib/server/groups';
import { createParticipant, setParticipantStatus, updateParticipant } from '$lib/server/participants';
import { appendRevision, ensureSite } from '$lib/server/revisions';
import { parseSiteConfig } from '$lib/site-config';
import { handle } from './hooks.server';

const BM25 = parseSiteConfig({ search: { method: 'bm25', search_params: {} } });
const SEMANTIC = parseSiteConfig({ search: { method: 'semantic_search', search_params: {} } });
const ADMIN_SECRET = 'test-admin-secret-with-at-least-32-characters';

let db: TestDatabase;

function request(url: string, headers: Record<string, string> = {}) {
  return {
    url: new URL(url),
    request: new Request(url, { headers }),
    platform: { env: { DB: db } },
    locals: {}
  };
}

async function run(event: ReturnType<typeof request>) {
  const resolve = vi.fn(
    ({ locals }) => new Response(`${locals.config.search.method} ${locals.revision}`)
  );
  return (await handle({ event, resolve } as never)).text();
}

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
  await ensureSite(db, 'alice');
  await appendRevision(db, 'alice', BM25, 'try bm25');
  await appendRevision(db, 'alice', SEMANTIC, 'try meaning');
});

describe('site config hook', () => {
  it('resolves the newest revision onto request locals', async () => {
    await expect(run(request('https://alice-phones.llmfn.com/'))).resolves.toBe(
      'semantic_search 3'
    );
  });

  it('preserves public instances created before self-signup sites were persisted', async () => {
    await expect(run(request('https://nobody-phones.llmfn.com/'))).resolves.toBe(
      'substring_match null'
    );
  });

  it('serves the defaults on the apex, which has no site of its own', async () => {
    await expect(run(request('https://phones.llmfn.com/'))).resolves.toBe('substring_match null');
  });

  it('serves the defaults when no database is bound', async () => {
    const event = { ...request('https://alice-phones.llmfn.com/'), platform: { env: {} } };
    await expect(run(event as never)).resolves.toBe('substring_match null');
  });

  it('reads a revision from the query parameter', async () => {
    await expect(run(request('https://alice-phones.llmfn.com/?r=2'))).resolves.toBe('bm25 2');
  });

  it('lets the header win over the query parameter', async () => {
    const event = request('https://alice-phones.llmfn.com/?r=2', { 'X-Phones-Revision': '1' });
    await expect(run(event)).resolves.toBe('substring_match 1');
  });

  it('refuses a revision the site does not have', async () => {
    await expect(run(request('https://alice-phones.llmfn.com/?r=99'))).rejects.toMatchObject({
      status: 404
    });
  });

  it('refuses something that cannot be a revision', async () => {
    for (const asked of ['banana', '0', '-1', '1.5', '']) {
      await expect(
        run(request(`https://alice-phones.llmfn.com/?r=${asked}`))
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it('serves active participants and stops deleted or previous subdomains', async () => {
    const group = await createGroup(db, 'edition-03');
    const participant = await createParticipant(db, group.id, 'Ada', 'ada@example.com');
    await expect(run(request('https://ada-phones.llmfn.com/'))).resolves.toBe(
      'substring_match 1'
    );

    await setParticipantStatus(db, group.id, participant.id, 'deleted');
    await expect(run(request('https://ada-phones.llmfn.com/'))).rejects.toMatchObject({ status: 404 });

    await setParticipantStatus(db, group.id, participant.id, 'active');
    await updateParticipant(db, group.id, participant.id, {
      name: 'Ada',
      email: 'ada@example.com',
      subdomain: 'ada-course'
    });
    await expect(run(request('https://ada-phones.llmfn.com/'))).rejects.toMatchObject({ status: 404 });
    await expect(run(request('https://ada-course-phones.llmfn.com/'))).resolves.toBe(
      'substring_match 1'
    );
  });
});

describe('admin access hook', () => {
  function adminEvent(url: string, token?: string, method = 'GET') {
    return {
      cookies: {
        get: vi.fn((name: string) => (name === ADMIN_SESSION_COOKIE ? token : undefined))
      },
      locals: {},
      platform: { env: { ADMIN_SESSION_SECRET: ADMIN_SECRET } },
      request: new Request(url, { method }),
      url: new URL(url)
    };
  }

  it('redirects a signed-out admin request before resolving site configuration', async () => {
    const resolve = vi.fn(() => new Response('should not resolve'));
    const response = await handle({
      event: adminEvent('https://phones.llmfn.com/admin?r=invalid'),
      resolve
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/admin/login');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('allows the login page and authenticated admin requests', async () => {
    const login = await handle({
      event: adminEvent('https://phones.llmfn.com/admin/login'),
      resolve: () => new Response('login')
    } as never);
    expect(await login.text()).toBe('login');

    const token = await createAdminSession(ADMIN_SECRET);
    const event = adminEvent('https://phones.llmfn.com/admin', token);
    const authenticated = await handle({
      event,
      resolve: ({ locals }: { locals: { admin?: { subject: string } } }) =>
        new Response(locals.admin?.subject)
    } as never);
    expect(await authenticated.text()).toBe('admin');
    expect(authenticated.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 401 for signed-out mutations and 404 on instance hosts', async () => {
    const mutation = await handle({
      event: adminEvent('https://phones.llmfn.com/admin/logout', undefined, 'POST'),
      resolve: () => new Response('should not resolve')
    } as never);
    expect(mutation.status).toBe(401);

    await expect(
      handle({
        event: adminEvent('https://alice-phones.llmfn.com/admin'),
        resolve: () => new Response('should not resolve')
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });
});
