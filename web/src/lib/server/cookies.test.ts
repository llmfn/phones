import { describe, expect, it } from 'vitest';

import { loginChallengeCookieOptions, sessionCookieOptions } from './cookies';

describe('login cookie scope', () => {
  it('keeps the authoritative session cookie host-only', () => {
    const options = sessionCookieOptions(new URL('https://alice.phones.llmfn.com/'));

    expect(options).not.toHaveProperty('domain');
    expect(options).toMatchObject({ httpOnly: true, path: '/', secure: true });
  });

  it('allows cookies over local HTTP development', () => {
    expect(sessionCookieOptions(new URL('http://alice.local.pipal.in:5173/')).secure).toBe(false);
  });

  it('keeps the login challenge host-only and short-lived', () => {
    const options = loginChallengeCookieOptions(
      new URL('https://alice.phones.llmfn.com/admin/login')
    );

    expect(options).not.toHaveProperty('domain');
    expect(options.maxAge).toBe(300);
  });
});
