import { describe, expect, it } from 'vitest';

import { getSitename } from './sitename';

describe('getSitename', () => {
  it('returns the apex hostname', () => {
    const request = new Request('https://phones.llmfn.com/');

    expect(getSitename(request)).toBe('phones.llmfn.com');
  });

  it('returns an arbitrary subdomain hostname', () => {
    const request = new Request('https://unregistered-phones.llmfn.com/path?q=phone');

    expect(getSitename(request)).toBe('unregistered-phones.llmfn.com');
  });

  it('preserves a local development port', () => {
    const request = new Request('http://localhost:5173/');

    expect(getSitename(request)).toBe('localhost:5173');
  });
});
