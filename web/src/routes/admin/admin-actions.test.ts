import { describe, expect, it, vi } from 'vitest';

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSession
} from '$lib/server/admin-auth';
import { actions as loginActions, load as loginLoad } from './login/+page.server';
import { actions as logoutActions } from './logout/+page.server';

const PASSCODE = 'test-admin-passcode';
const SECRET = 'test-admin-secret-with-at-least-32-characters';

describe('admin login actions', () => {
  function expectRedirect(run: () => unknown, location: string) {
    try {
      run();
      throw new Error('Expected a redirect');
    } catch (error) {
      expect(error).toMatchObject({ status: 303, location });
    }
  }

  it('turns the configured passcode into a signed session', async () => {
    const form = new FormData();
    form.set('passcode', PASSCODE);
    const cookies = { set: vi.fn() };

    await expect(
      loginActions.default?.({
        cookies,
        platform: { env: { ADMIN_PASSCODE: PASSCODE, ADMIN_SESSION_SECRET: SECRET } },
        request: new Request('https://phones.llmfn.com/admin/login', {
          method: 'POST',
          body: form
        }),
        url: new URL('https://phones.llmfn.com/admin/login')
      } as never)
    ).rejects.toMatchObject({ status: 303, location: '/admin' });

    const [name, token, options] = cookies.set.mock.calls[0];
    expect(name).toBe(ADMIN_SESSION_COOKIE);
    expect(options).not.toHaveProperty('domain');
    await expect(verifyAdminSession(token, SECRET)).resolves.toMatchObject({ subject: 'admin' });
  });

  it('sets no cookie for incorrect or missing configuration', async () => {
    const form = new FormData();
    form.set('passcode', 'incorrect');
    const cookies = { set: vi.fn() };

    await expect(
      loginActions.default?.({
        cookies,
        platform: { env: { ADMIN_PASSCODE: PASSCODE, ADMIN_SESSION_SECRET: SECRET } },
        request: new Request('https://phones.llmfn.com/admin/login', {
          method: 'POST',
          body: form
        }),
        url: new URL('https://phones.llmfn.com/admin/login')
      } as never)
    ).resolves.toMatchObject({ status: 400, data: { error: 'Passcode is incorrect.' } });

    await expect(
      loginActions.default?.({
        cookies,
        platform: { env: {} },
        request: new Request('https://phones.llmfn.com/admin/login', { method: 'POST' }),
        url: new URL('https://phones.llmfn.com/admin/login')
      } as never)
    ).resolves.toMatchObject({ status: 500, data: { error: 'Admin login is not configured.' } });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('redirects an authenticated login and clears the session on logout', async () => {
    expectRedirect(
      () => loginLoad({ locals: { admin: { subject: 'admin' } } } as never),
      '/admin'
    );

    const cookies = { delete: vi.fn() };
    expectRedirect(
      () => logoutActions.default?.({
        cookies,
        url: new URL('https://phones.llmfn.com/admin/logout')
      } as never),
      '/admin/login'
    );
    expect(cookies.delete).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      expect.objectContaining({ path: '/admin' })
    );
  });
});
