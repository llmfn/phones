import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';
import { traceTurn } from '$lib/server/trace';

import goldenRankings from './bm25.golden.json';
import {
  BM25Index,
  flattenTokens,
  searchBM25,
  tokenize
} from './bm25';

describe('BM25 primitives', () => {
  it('uses the same ASCII tokenizer for text and nested scalar values', () => {
    expect(tokenize('Galaxy Z-Fold6, 5G! Café')).toEqual([
      'galaxy',
      'z',
      'fold6',
      '5g',
      'caf'
    ]);
    expect(
      flattenTokens({
        name: 'Phone 16',
        values: [true, 512, null, { color: 'Blue-Grey' }]
      })
    ).toEqual([
      'phone',
      '16',
      'true',
      '512',
      'blue',
      'grey'
    ]);
  });

  it('matches hand-calculated IDF and contribution values', () => {
    const index = new BM25Index([
      ['apple', 'apple', 'phone'],
      ['apple', 'watch']
    ]);

    expect(index.documentLengths).toEqual([3, 2]);
    expect(index.averageLength).toBe(2.5);
    expect(index.documentFrequency.get('apple')).toBe(2);
    expect(index.idf('apple')).toBeCloseTo(0.1823215568, 10);
    expect(index.idf('phone')).toBeCloseTo(0.6931471806, 10);

    const scores = index.tokenScores(['apple', 'phone']);
    expect(scores[0].get('apple')).toBeCloseTo(0.2447269219, 10);
    expect(scores[0].get('phone')).toBeCloseTo(0.6359148446, 10);
    expect(scores[1].has('phone')).toBe(false);
  });

  it('applies request-specific parameters without changing the index', () => {
    const index = new BM25Index([
      ['phone', 'phone', 'phone'],
      ['phone']
    ]);
    const noLengthNormalization = index.tokenScores(['phone'], 0.5, 0);
    const fullLengthNormalization = index.tokenScores(['phone'], 2.5, 1);

    expect(noLengthNormalization[0].get('phone')).not.toBe(
      fullLengthNormalization[0].get('phone')
    );
    expect(index.tokenScores(['phone'], 0.5, 0)).toEqual(
      noLengthNormalization
    );
  });
});

describe('BM25 catalogue search', () => {
  it('returns the catalogue without a step for a tokenless query', async () => {
    const { result, trace } = await traceTurn('search', '', () => {
      return searchBM25('---');
    });

    expect(result?.map((phone) => phone.id)).toEqual(
      CATALOGUE.map((phone) => phone.id)
    );
    expect(trace.steps).toEqual([]);
  });

  it('searches the whole record and ignores query word order', async () => {
    const apple = await searchBM25('apple');
    const reordered = await searchBM25('pro iphone 16');

    expect(apple.length).toBeGreaterThan(0);
    expect(apple.every((phone) => phone.brand === 'Apple')).toBe(true);
    expect(reordered[0]?.id).toBe('apple-iphone-16-pro');
  });

  it('requires every unique token and explains the ranked scores', async () => {
    const { result, trace } = await traceTurn(
      'search',
      'a phone for my mom',
      () => searchBM25('a phone for my mom')
    );
    const step = trace.steps[0];

    expect(result).toEqual([]);
    expect(step).toMatchObject({
      name: 'search_bm25',
      label: 'keyword search',
      input: { query: 'a phone for my mom' },
      output: {
        catalogue_size: CATALOGUE.length,
        k1: 1.5,
        b: 0.75,
        results: 0,
        top_scores: []
      }
    });
    expect(step.output.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: 'mom', matches: 0 })
      ])
    );
    expect(
      (step.output.tokens as Array<{ token: string }>).at(-1)?.token
    ).toBe('mom');
  });

  it('records the Python trace score decomposition', async () => {
    const { trace } = await traceTurn('search', 'pro iphone 16', () => {
      return searchBM25('pro iphone 16');
    });
    const output = trace.steps[0].output;
    const topScores = output.top_scores as Array<{
      id: string;
      score: number;
      length: number;
      tokens: Array<{ token: string; count: number; score: number }>;
    }>;

    expect(output).toMatchObject({
      catalogue_size: 136,
      average_length: 224.7,
      tokens: [
        { token: '16', matches: 26, weight: 1.6428 },
        { token: 'pro', matches: 33, weight: 1.4084 },
        { token: 'iphone', matches: 39, weight: 1.2437 }
      ]
    });
    expect(topScores).toHaveLength(8);
    expect(topScores[0]).toEqual({
      id: 'apple-iphone-16-pro',
      name: 'iPhone 16 Pro',
      score: 8.2973,
      length: 238,
      tokens: [
        { token: '16', count: 3, score: 2.6982 },
        { token: 'pro', count: 9, score: 2.9991 },
        { token: 'iphone', count: 8, score: 2.6001 }
      ]
    });
    expect(
      topScores[0].tokens.reduce((sum, token) => sum + token.score, 0)
    ).toBeCloseTo(topScores[0].score, 3);
  });

  it('does not let one request retain another request parameters', async () => {
    const first = await traceTurn('search', 'iphone', () => {
      return searchBM25('iphone', 0.5, 0);
    });
    const second = await traceTurn('search', 'iphone', () => {
      return searchBM25('iphone', 2.5, 1);
    });

    expect(first.trace.steps[0].output).toMatchObject({ k1: 0.5, b: 0 });
    expect(second.trace.steps[0].output).toMatchObject({ k1: 2.5, b: 1 });
  });

  it('reproduces the reviewed real-catalogue rankings', async () => {
    for (const [query, expectedIds] of Object.entries(goldenRankings)) {
      const products = await searchBM25(query);
      expect(
        products.map((phone) => phone.id),
        `Ranking changed for ${query}`
      ).toEqual(expectedIds);
    }
  });
});
