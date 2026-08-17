import { describe, expect, it } from 'vitest';

import { readSearchQuery, writeSearchQuery } from './search-url';

describe('search URL state', () => {
  it('distinguishes an absent query from an empty search', () => {
    expect(readSearchQuery(new URL('https://student.example/?r=3'))).toBeNull();
    expect(readSearchQuery(new URL('https://student.example/?q=&r=3'))).toBe('');
  });

  it('reads a decoded query', () => {
    expect(readSearchQuery(new URL('https://student.example/?q=iphone+16+pro'))).toBe(
      'iphone 16 pro'
    );
  });

  it('writes a trimmed query while preserving other URL state', () => {
    const url = writeSearchQuery(
      new URL('https://student.example/?r=3&utm_source=course#results'),
      '  iphone 16 pro  '
    );

    expect(url.href).toBe(
      'https://student.example/?r=3&utm_source=course&q=iphone+16+pro#results'
    );
  });

  it('keeps an empty query so the full-catalogue search remains shareable', () => {
    const url = writeSearchQuery(new URL('https://student.example/?r=3'), '   ');

    expect(url.href).toBe('https://student.example/?r=3&q=');
  });
});
