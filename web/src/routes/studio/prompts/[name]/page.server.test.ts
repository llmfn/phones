import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyMigrations,
  createTestDatabase,
  type TestDatabase
} from '../../../../../test-support/database';
import { signCredential } from '$lib/server/auth';
import { listRevisions, loadRevision } from '$lib/server/revisions';
import { DEFAULT_SITE_CONFIG } from '$lib/site-config';

import { actions, load } from './+page.server';
import { actions as searchActions } from '../../+page.server';

const SECRET = 'studio-prompts-test-secret';
const HOSTNAME = 'alice-phones.llmfn.com';

let db: TestDatabase;
let session: string;

function event(
  options: { name?: string; form?: FormData; revision?: number | null } = {}
) {
  const name = options.name ?? 'rewrite';
  const url = new URL(`https://${HOSTNAME}/studio/prompts/${name}`);
  return {
    cookies: { delete: vi.fn(), get: vi.fn().mockReturnValue(session) },
    locals: { revision: options.revision ?? null },
    params: { name },
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

async function expectRedirect(run: () => unknown, location: string) {
  await expect(async () => await run()).rejects.toMatchObject({ status: 303, location });
}

beforeEach(async () => {
  db = createTestDatabase();
  await applyMigrations(db);
  session = await signCredential('session', HOSTNAME, SECRET, 300);
});

describe('a prompt panel', () => {
  it('opens a new site on that prompt’s default text', async () => {
    await expect(load(event({ name: 'eval' }) as never)).resolves.toMatchObject({
      prompt: { name: 'eval' },
      config: {
        prompts: {
          eval: expect.stringContaining('You are checking whether a phone recommender'),
          rewrite: '<!-- prompt to rewrite the query -->'
        }
      }
    });
  });

  it('404s on a prompt the schema does not have', async () => {
    await expect(load(event({ name: 'banana' }) as never)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps an edited prompt at the revision it was saved on', async () => {
    const edited = form({ summarize: 'Two sentences, no more.' });
    const saving = event({ name: 'summarize', form: edited });
    await expectRedirect(() => actions.save?.(saving as never), '/studio/prompts/summarize');

    await expect(load(event({ name: 'summarize', revision: 1 }) as never)).resolves.toMatchObject({
      config: { prompts: { summarize: DEFAULT_SITE_CONFIG.prompts.summarize } }
    });
    await expect(load(event({ name: 'summarize' }) as never)).resolves.toMatchObject({
      config: { prompts: { summarize: 'Two sentences, no more.' } }
    });
    await expect(listRevisions(db, 'alice')).resolves.toHaveLength(2);
  });

  it('leaves the sibling prompts alone', async () => {
    const chat = form({ chat: 'Ask one question.' });
    await expectRedirect(
      () => actions.save?.(event({ name: 'chat', form: chat }) as never),
      '/studio/prompts/chat'
    );
    const rewrite = form({ rewrite: 'Rewrite it plainly.' });
    await expectRedirect(
      () => actions.save?.(event({ name: 'rewrite', form: rewrite }) as never),
      '/studio/prompts/rewrite'
    );

    await expect(loadRevision(db, 'alice', null)).resolves.toMatchObject({
      revision: 3,
      config: {
        prompts: {
          chat: 'Ask one question.',
          rewrite: 'Rewrite it plainly.',
          eval: DEFAULT_SITE_CONFIG.prompts.eval
        }
      }
    });
  });

  it('keeps a prompt the student emptied on purpose', async () => {
    const emptied = form({ chat: '' });
    await expectRedirect(
      () => actions.save?.(event({ name: 'chat', form: emptied }) as never),
      '/studio/prompts/chat'
    );

    await expect(loadRevision(db, 'alice', null)).resolves.toMatchObject({
      config: { prompts: { chat: '' } }
    });
  });

  it('leaves a search setting saved elsewhere alone', async () => {
    const method = form({ method: 'bm25', k1: '1.2' });
    await expectRedirect(() => searchActions.save?.(event({ form: method }) as never), '/studio');

    const edited = form({ rewrite: 'Rewrite it plainly.' });
    await expectRedirect(() => actions.save?.(event({ form: edited }) as never), '/studio/prompts/rewrite');

    await expect(loadRevision(db, 'alice', null)).resolves.toMatchObject({
      config: {
        prompts: { rewrite: 'Rewrite it plainly.' },
        search: { method: 'bm25', search_params: { k1: 1.2 } }
      }
    });
  });

  it('refuses to save over an archived revision', async () => {
    const edited = form({ rewrite: 'Rewrite it plainly.' });
    await expectRedirect(() => actions.save?.(event({ form: edited }) as never), '/studio/prompts/rewrite');

    await expect(
      actions.save?.(event({ form: edited, revision: 1 }) as never)
    ).resolves.toMatchObject({ status: 409 });
    await expect(listRevisions(db, 'alice')).resolves.toHaveLength(2);
  });
});
