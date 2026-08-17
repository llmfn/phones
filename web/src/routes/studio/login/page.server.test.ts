import { describe, expect, it, vi } from 'vitest';

import { createLoginChallenge } from '$lib/server/auth';
import { createGroup } from '$lib/server/groups';
import { createParticipant } from '$lib/server/participants';
import { applyMigrations, createTestDatabase } from '../../../../test-support/database';

import { actions, load } from './+page.server';

const SECRET = 'studio-login-test-secret';

describe('studio code login', () => {
  it('shows the temporary masked Gmail owner', async () => {
    await expect(
      load({ url: new URL('https://alice-phones.llmfn.com/studio/login') } as never)
    ).resolves.toEqual({
      maskedEmail: 'a***@gmail.com'
    });
  });

  it('uses the managed participant email instead of the temporary owner', async () => {
    const db = createTestDatabase();
    await applyMigrations(db);
    const group = await createGroup(db, 'edition-03');
    await createParticipant(db, group.id, 'Ada', 'ada@course.test');

    await expect(
      load({
        platform: { env: { DB: db } },
        url: new URL('https://ada-phones.llmfn.com/studio/login')
      } as never)
    ).resolves.toEqual({ maskedEmail: 'a***@course.test' });

    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await actions.send?.({
      cookies: { set: vi.fn() },
      platform: { env: { AUTH_SECRET: SECRET, DB: db } },
      url: new URL('https://ada-phones.llmfn.com/studio/login')
    } as never);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Login code for ada@course\.test: \d{6}$/));
    log.mockRestore();
  });

  it('sends a code to the temporary Gmail owner and stores its challenge', async () => {
    const cookies = { set: vi.fn() };
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(
      actions.send?.({
        cookies,
        platform: { env: { AUTH_SECRET: SECRET } },
        url: new URL('https://alice-phones.llmfn.com/studio/login')
      } as never)
    ).resolves.toEqual({ sent: true });

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Login code for alice@gmail\.com: \d{6}$/));
    expect(cookies.set).toHaveBeenCalledWith(
      'phones_login_challenge',
      expect.any(String),
      expect.not.objectContaining({ domain: expect.anything() })
    );
    log.mockRestore();
  });

  it('turns a valid code challenge into a host-only session', async () => {
    const challenge = await createLoginChallenge(
      'alice-phones.llmfn.com',
      '123456',
      SECRET,
      300
    );
    const form = new FormData();
    form.set('code', '123456');
    const cookies = {
      delete: vi.fn(),
      get: vi.fn().mockReturnValue(challenge),
      set: vi.fn()
    };

    try {
      await actions.verify?.({
        cookies,
        platform: { env: { AUTH_SECRET: SECRET } },
        request: new Request('https://alice-phones.llmfn.com/studio/login', {
          method: 'POST',
          body: form
        }),
        url: new URL('https://alice-phones.llmfn.com/studio/login')
      } as never);
      throw new Error('Expected a redirect');
    } catch (error) {
      expect(error).toMatchObject({ status: 303, location: '/studio' });
    }

    expect(cookies.set).toHaveBeenCalledWith(
      'phones_session',
      expect.any(String),
      expect.not.objectContaining({ domain: expect.anything() })
    );
    expect(cookies.delete).toHaveBeenCalledWith(
      'phones_login_challenge',
      expect.objectContaining({ path: '/' })
    );
  });
});
