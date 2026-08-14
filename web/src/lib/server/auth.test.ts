import { describe, expect, it } from 'vitest';

import {
  createLoginChallenge,
  generateLoginCode,
  signCredential,
  verifyCredential,
  verifyLoginChallenge
} from './auth';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 7, 15);

describe('login code challenges', () => {
  it('generates a six-digit code', () => {
    expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });

  it('accepts a fresh code more than once', async () => {
    const challenge = await createLoginChallenge('alice.phones.llmfn.com', '123456', SECRET, 300, NOW);

    await expect(
      verifyLoginChallenge(challenge, 'alice.phones.llmfn.com', '123456', SECRET, NOW)
    ).resolves.toBe(true);
    await expect(
      verifyLoginChallenge(challenge, 'alice.phones.llmfn.com', '123456', SECRET, NOW)
    ).resolves.toBe(true);
  });

  it('refuses an expired code', async () => {
    const challenge = await createLoginChallenge('alice.phones.llmfn.com', '123456', SECRET, 300, NOW);

    await expect(
      verifyLoginChallenge(challenge, 'alice.phones.llmfn.com', '123456', SECRET, NOW + 301_000)
    ).resolves.toBe(false);
  });

  it('refuses an incorrect code', async () => {
    const challenge = await createLoginChallenge('alice.phones.llmfn.com', '123456', SECRET, 300, NOW);

    await expect(
      verifyLoginChallenge(challenge, 'alice.phones.llmfn.com', '654321', SECRET, NOW)
    ).resolves.toBe(false);
  });

  it('refuses a code on the wrong student host', async () => {
    const challenge = await createLoginChallenge('alice.phones.llmfn.com', '123456', SECRET, 300, NOW);

    await expect(
      verifyLoginChallenge(challenge, 'alice.local.pipal.in', '123456', SECRET, NOW)
    ).resolves.toBe(false);
  });
});

describe('signed sessions', () => {
  it('accepts a valid session only on its student host', async () => {
    const session = await signCredential('session', 'alice.phones.llmfn.com', SECRET, 300, NOW);

    await expect(
      verifyCredential(session, 'session', 'alice.phones.llmfn.com', SECRET, NOW)
    ).resolves.toBe(true);
    await expect(
      verifyCredential(session, 'session', 'alice.local.pipal.in', SECRET, NOW)
    ).resolves.toBe(false);
  });
});
