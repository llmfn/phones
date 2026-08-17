import { describe, expect, it, vi } from 'vitest';

import { actions, load } from './+page.server';

function event(url: string, revision: number | null = null) {
  return {
    cookies: { get: vi.fn() },
    locals: { revision },
    request: new Request(url),
    url: new URL(url)
  };
}

describe('apex discovery routing', () => {
  it('always shows discovery on the apex', () => {
    expect(load(event('https://phones.llmfn.com/') as never)).toMatchObject({
      page: 'apex',
      sitename: 'phones.llmfn.com'
    });
  });

  it('serves an instance without requiring a session', () => {
    expect(load(event('https://alice-phones.llmfn.com/') as never)).toMatchObject({
      page: 'app',
      sitename: 'alice-phones.llmfn.com',
      revision: null
    });
  });

  it('passes the resolved revision to the page', () => {
    expect(load(event('https://alice-phones.llmfn.com/?r=3', 3) as never)).toMatchObject({
      revision: 3
    });
  });

  it('uses the email only to redirect to the student instance', async () => {
    const form = new FormData();
    form.set('email', 'Alice.Example@gmail.com');

    try {
      await actions.default?.({
        request: new Request('https://phones.llmfn.com/', { method: 'POST', body: form }),
        url: new URL('https://phones.llmfn.com/')
      } as never);
      throw new Error('Expected a redirect');
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: 'https://aliceexample-phones.llmfn.com/'
      });
    }
  });
});
