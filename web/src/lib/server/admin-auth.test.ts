import { describe, expect, it, vi } from 'vitest';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  clearAdminSessionCookie,
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminPasscode,
  verifyAdminSession
} from './admin-auth';

const NOW = Date.UTC(2026, 7, 17, 12);
const SECRET = 'test-admin-secret-with-at-least-32-characters';

describe('admin authentication', () => {
  it('compares configured passcodes without accepting missing configuration', async () => {
    await expect(verifyAdminPasscode('correct horse', 'correct horse')).resolves.toBe(true);
    await expect(verifyAdminPasscode('wrong horse', 'correct horse')).resolves.toBe(false);
    await expect(verifyAdminPasscode('', '')).resolves.toBe(false);
    await expect(verifyAdminPasscode('candidate', undefined)).resolves.toBe(false);
  });

  it('accepts a signed session until it expires', async () => {
    const token = await createAdminSession(SECRET, NOW);

    await expect(verifyAdminSession(token, SECRET, NOW)).resolves.toMatchObject({
      subject: 'admin',
      issuedAt: NOW / 1000,
      expiresAt: NOW / 1000 + ADMIN_SESSION_TTL_SECONDS
    });
    await expect(
      verifyAdminSession(token, SECRET, NOW + ADMIN_SESSION_TTL_SECONDS * 1000)
    ).resolves.toBeNull();
  });

  it('refuses tampered sessions and invalid secrets', async () => {
    const token = await createAdminSession(SECRET, NOW);
    const [body, signature] = token.split('.');
    const tampered = `${body}.${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;

    await expect(verifyAdminSession(tampered, SECRET, NOW)).resolves.toBeNull();
    await expect(verifyAdminSession(token, 'another-secret-with-at-least-32-characters', NOW)).resolves.toBeNull();
    await expect(verifyAdminSession('not-a-token', SECRET, NOW)).resolves.toBeNull();
    await expect(createAdminSession('too-short', NOW)).rejects.toThrow(/at least 32/);
  });

  it('sets and clears a host-only cookie scoped to admin', () => {
    const cookies = { delete: vi.fn(), set: vi.fn() };
    const url = new URL('https://phones.llmfn.com/admin');

    setAdminSessionCookie(cookies as never, 'signed-token', url);
    clearAdminSessionCookie(cookies as never, url);

    expect(cookies.set).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE, 'signed-token', {
      path: '/admin',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: ADMIN_SESSION_TTL_SECONDS
    });
    expect(cookies.set.mock.calls[0][2]).not.toHaveProperty('domain');
    expect(cookies.delete).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE, {
      path: '/admin',
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });
  });
});
