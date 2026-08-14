import { describe, expect, it, vi } from 'vitest';

import { createLoginChallenge } from '$lib/server/auth';

import { actions, load } from './+page.server';

const SECRET = 'admin-login-test-secret';

describe('admin code login', () => {
  it('shows the temporary masked Gmail owner', () => {
    expect(load({ url: new URL('https://alice-phones.llmfn.com/admin/login') } as never)).toEqual({
      maskedEmail: 'a***@gmail.com'
    });
  });

  it('sends a code to the temporary Gmail owner and stores its challenge', async () => {
    const cookies = { set: vi.fn() };
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(
      actions.send?.({
        cookies,
        platform: { env: { AUTH_SECRET: SECRET } },
        url: new URL('https://alice-phones.llmfn.com/admin/login')
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
        request: new Request('https://alice-phones.llmfn.com/admin/login', {
          method: 'POST',
          body: form
        }),
        url: new URL('https://alice-phones.llmfn.com/admin/login')
      } as never);
      throw new Error('Expected a redirect');
    } catch (error) {
      expect(error).toMatchObject({ status: 303, location: '/admin' });
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
