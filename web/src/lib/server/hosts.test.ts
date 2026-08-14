import { describe, expect, it } from 'vitest';

import {
  getMaskedOwnerEmail,
  getOwnerEmail,
  getSite,
  getSiteUrl,
  getSlugFromEmail,
  isValidSlug
} from './hosts';

describe('host routing', () => {
  it('recognizes the production and local apex hosts', () => {
    expect(getSite(new URL('https://phones.llmfn.com/')).kind).toBe('apex');
    expect(getSite(new URL('http://local.pipal.in:5173/')).kind).toBe('apex');
  });

  it('treats any other host as a public instance', () => {
    expect(getSite(new URL('https://alice-phones.llmfn.com/phones'))).toEqual({
      kind: 'instance',
      hostname: 'alice-phones.llmfn.com',
      apexHostname: 'phones.llmfn.com',
      slug: 'alice'
    });
  });

  it('builds a production instance URL in a first-level subdomain', () => {
    const url = getSiteUrl(
      new URL('https://phones.llmfn.com/'),
      'phones.llmfn.com',
      'alice',
      '/admin/login'
    );

    expect(url.toString()).toBe('https://alice-phones.llmfn.com/admin/login');
  });

  it('builds a local instance URL with its development port', () => {
    const url = getSiteUrl(
      new URL('http://local.pipal.in:5173/'),
      'local.pipal.in',
      'alice',
      '/admin/login'
    );

    expect(url.toString()).toBe('http://alice.local.pipal.in:5173/admin/login');
  });
});

describe('email slugs', () => {
  it('lowercases and strips characters that are invalid in a hostname label', () => {
    expect(getSlugFromEmail('Alice.Example+Course@example.com')).toBe('aliceexamplecourse');
  });

  it('rejects an email whose local part cannot make a hostname', () => {
    expect(getSlugFromEmail('...@example.com')).toBeNull();
  });

  it('rejects malformed and overlong hostname labels', () => {
    expect(getSlugFromEmail('not-an-email')).toBeNull();
    expect(getSlugFromEmail('alice@example.com@attacker.test')).toBeNull();
    expect(isValidSlug('a'.repeat(57))).toBe(false);
  });
});

describe('temporary owner email', () => {
  it('maps the instance slug to Gmail', () => {
    expect(getOwnerEmail('alice')).toBe('alice@gmail.com');
    expect(getMaskedOwnerEmail('alice')).toBe('a***@gmail.com');
  });
});
