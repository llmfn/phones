import { describe, expect, it, vi } from 'vitest';

import { signCredential } from '$lib/server/auth';

import { actions, load } from './+page.server';

const SECRET = 'admin-page-test-secret';

describe('admin session', () => {
  it('allows the session only on its own subdomain', async () => {
    const session = await signCredential('session', 'alice-phones.llmfn.com', SECRET, 300);

    await expect(
      load({
        cookies: { get: vi.fn().mockReturnValue(session) },
        platform: { env: { AUTH_SECRET: SECRET } },
        url: new URL('https://alice-phones.llmfn.com/admin')
      } as never)
    ).resolves.toEqual({ slug: 'alice' });
  });

  it('deletes the host-only session on logout', async () => {
    const cookies = { delete: vi.fn() };

    try {
      await actions.logout?.({
        cookies,
        url: new URL('https://alice-phones.llmfn.com/admin')
      } as never);
      throw new Error('Expected a redirect');
    } catch (error) {
      expect(error).toMatchObject({ status: 303, location: '/' });
    }

    expect(cookies.delete).toHaveBeenCalledWith(
      'phones_session',
      expect.not.objectContaining({ domain: expect.anything() })
    );
  });
});
