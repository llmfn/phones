import { describe, expect, it, vi } from 'vitest';

import { handle } from './hooks.server';

describe('site config hook', () => {
  it('resolves configuration onto request locals', async () => {
    const event = { locals: {} };
    const resolve = vi.fn(({ locals }) => new Response(locals.config.search.method));

    const response = await handle({ event, resolve } as never);

    expect(await response.text()).toBe('substring_match');
    expect(resolve).toHaveBeenCalledOnce();
  });
});
