const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const LOGIN_CODE_TTL_SECONDS = 5 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type Credential = {
  kind: 'session';
  hostname: string;
  exp: number;
};

type LoginChallenge = {
  kind: 'login-code';
  hostname: string;
  digest: string;
  exp: number;
};

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('AUTH_SECRET is required');

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signCredential(
  kind: 'session',
  hostname: string,
  secret: string,
  ttlSeconds: number,
  now = Date.now()
): Promise<string> {
  const body = encode(
    encoder.encode(
      JSON.stringify({ kind, hostname, exp: Math.floor(now / 1000) + ttlSeconds })
    )
  );
  const signature = await crypto.subtle.sign('HMAC', await getKey(secret), encoder.encode(body));

  return `${body}.${encode(new Uint8Array(signature))}`;
}

export async function verifyCredential(
  token: string | null | undefined,
  kind: 'session',
  hostname: string,
  secret: string,
  now = Date.now()
): Promise<boolean> {
  if (!token) return false;

  try {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) return false;

    const validSignature = await crypto.subtle.verify(
      'HMAC',
      await getKey(secret),
      decode(signature),
      encoder.encode(body)
    );
    if (!validSignature) return false;

    const credential = JSON.parse(decoder.decode(decode(body))) as Partial<Credential>;
    return (
      credential.kind === kind &&
      credential.hostname === hostname &&
      Number.isInteger(credential.exp) &&
      (credential.exp as number) > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

async function getCodeDigest(hostname: string, code: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.sign(
    'HMAC',
    await getKey(secret),
    encoder.encode(`login-code:${hostname}:${code}`)
  );
  return encode(new Uint8Array(digest));
}

export function generateLoginCode(): string {
  const range = 1_000_000;
  const limit = Math.floor(2 ** 32 / range) * range;
  const values = new Uint32Array(1);

  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);

  return (values[0] % range).toString().padStart(6, '0');
}

export async function createLoginChallenge(
  hostname: string,
  code: string,
  secret: string,
  ttlSeconds: number,
  now = Date.now()
): Promise<string> {
  const body = encode(
    encoder.encode(
      JSON.stringify({
        kind: 'login-code',
        hostname,
        digest: await getCodeDigest(hostname, code, secret),
        exp: Math.floor(now / 1000) + ttlSeconds
      })
    )
  );
  const signature = await crypto.subtle.sign('HMAC', await getKey(secret), encoder.encode(body));

  return `${body}.${encode(new Uint8Array(signature))}`;
}

export async function verifyLoginChallenge(
  challenge: string | null | undefined,
  hostname: string,
  code: string,
  secret: string,
  now = Date.now()
): Promise<boolean> {
  if (!challenge || !/^\d{6}$/.test(code)) return false;

  try {
    const [body, signature, extra] = challenge.split('.');
    if (!body || !signature || extra) return false;

    const validSignature = await crypto.subtle.verify(
      'HMAC',
      await getKey(secret),
      decode(signature),
      encoder.encode(body)
    );
    if (!validSignature) return false;

    const payload = JSON.parse(decoder.decode(decode(body))) as Partial<LoginChallenge>;
    const validCode =
      typeof payload.digest === 'string' &&
      (await crypto.subtle.verify(
        'HMAC',
        await getKey(secret),
        decode(payload.digest),
        encoder.encode(`login-code:${hostname}:${code}`)
      ));
    return (
      payload.kind === 'login-code' &&
      payload.hostname === hostname &&
      validCode &&
      Number.isInteger(payload.exp) &&
      (payload.exp as number) > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export function getAuthSecret(platform: App.Platform | undefined, development: boolean): string {
  const secret = platform?.env.AUTH_SECRET;
  if (secret) return secret;
  if (development) return 'phones-local-development-secret';

  throw new Error('AUTH_SECRET is required');
}
