import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations, createTestDatabase, type TestDatabase } from '../test-support/database';
import { appendRevision, ensureSite } from '$lib/server/revisions';
import { parseSiteConfig } from '$lib/site-config';
import { handle } from './hooks.server';

const BM25 = parseSiteConfig({ search: { method: 'bm25', search_params: {} } });
const SEMANTIC = parseSiteConfig({ search: { method: 'semantic_search', search_params: {} } });

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

  it('serves the defaults for a site with nothing saved', async () => {
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
});
