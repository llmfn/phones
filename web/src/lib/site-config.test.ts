import { describe, expect, it } from 'vitest';

import { DEFAULT_SITE_CONFIG, parseSiteConfig } from './site-config';

describe('site config', () => {
  it('fills a complete default config on read', () => {
    expect(parseSiteConfig({})).toEqual(DEFAULT_SITE_CONFIG);
  });

  it('fills absent siblings in a partial config', () => {
    expect(
      parseSiteConfig({
        prompts: { rewrite: 'Rewrite this' },
        design: { FILTER_UI: 'popover' }
      })
    ).toEqual({
      ...DEFAULT_SITE_CONFIG,
      prompts: { ...DEFAULT_SITE_CONFIG.prompts, rewrite: 'Rewrite this' },
      design: { ...DEFAULT_SITE_CONFIG.design, FILTER_UI: 'popover' }
    });
  });

  it('validates parameters against the selected method', () => {
    expect(() =>
      parseSiteConfig({ search: { method: 'substring_match', search_params: { k1: 1.2 } } })
    ).toThrow('Unknown substring_match search_params field: k1');
    expect(parseSiteConfig({ search: { method: 'bm25' } }).search).toEqual({
      method: 'bm25',
      search_params: { k1: 1.5, b: 0.75 }
    });
    expect(parseSiteConfig({ search: { method: 'semantic_search' } }).search).toEqual({
      method: 'semantic_search',
      search_params: { min_score: 0.3 }
    });
  });

  it('rejects unsupported versions, methods, design values, and fields', () => {
    expect(() => parseSiteConfig({ version: 2 })).toThrow('site config version must be 1');
    expect(() => parseSiteConfig({ search: { method: 'unknown' } })).toThrow(
      'search.method must be one of'
    );
    expect(() => parseSiteConfig({ design: { FILTER_UI: 'drawer' } })).toThrow(
      'design.FILTER_UI must be one of'
    );
    expect(() => parseSiteConfig({ typo: true })).toThrow('Unknown site config field: typo');
  });

  it('returns fresh nested objects', () => {
    const first = parseSiteConfig({});
    const second = parseSiteConfig({});
    expect(first).not.toBe(second);
    expect(first.prompts).not.toBe(second.prompts);
    expect(first.search.search_params).not.toBe(second.search.search_params);
    expect(first.design).not.toBe(second.design);
  });
});
