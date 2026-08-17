import type { Cookies } from '@sveltejs/kit';

export const ADMIN_SESSION_COOKIE = 'phones_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

const SESSION_VERSION = 1;
const encoder = new TextEncoder();

export interface AdminSession {
  version: number;
  subject: 'admin';
  issuedAt: number;
  expiresAt: number;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array | null, right: Uint8Array): boolean {
  if (!left || left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function validSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= 32;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function sign(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function verifyAdminPasscode(
  candidate: unknown,
  expected: string | undefined
): Promise<boolean> {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false;
  }

  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(expected)
  ]);
  return equalBytes(candidateDigest, expectedDigest);
}

export async function createAdminSession(secret: string | undefined, now = Date.now()) {
  if (!validSecret(secret)) {
    throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
  }

  const issuedAt = Math.floor(now / 1000);
  const payload: AdminSession = {
    version: SESSION_VERSION,
    subject: 'admin',
    issuedAt,
    expiresAt: issuedAt + ADMIN_SESSION_TTL_SECONDS
  };
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signature = encode(await sign(secret, body));
  return `${body}.${signature}`;
}

export async function verifyAdminSession(
  token: string | null | undefined,
  secret: string | undefined,
  now = Date.now()
): Promise<AdminSession | null> {
  if (typeof token !== 'string' || !validSecret(secret)) return null;

  try {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) return null;
    if (!equalBytes(decode(signature), await sign(secret, body))) return null;

    const bodyBytes = decode(body);
    if (!bodyBytes) return null;
    const payload = JSON.parse(new TextDecoder().decode(bodyBytes)) as Partial<AdminSession>;
    const nowSeconds = Math.floor(now / 1000);
    if (
      payload.version !== SESSION_VERSION ||
      payload.subject !== 'admin' ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      (payload.issuedAt as number) > nowSeconds ||
      (payload.expiresAt as number) <= nowSeconds
    ) {
      return null;
    }

    return payload as AdminSession;
  } catch {
    return null;
  }
}

function adminCookieOptions(url: URL) {
  return {
    path: '/admin',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const
  };
}

export function setAdminSessionCookie(cookies: Cookies, token: string, url: URL) {
  cookies.set(ADMIN_SESSION_COOKIE, token, {
    ...adminCookieOptions(url),
    maxAge: ADMIN_SESSION_TTL_SECONDS
  });
}

export function clearAdminSessionCookie(cookies: Cookies, url: URL) {
  cookies.delete(ADMIN_SESSION_COOKIE, adminCookieOptions(url));
}
