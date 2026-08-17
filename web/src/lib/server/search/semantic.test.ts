import { describe, expect, it, vi } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';
import { traceTurn } from '$lib/server/trace';

import { searchSemantic } from './semantic';

const corpus = {
  phones: CATALOGUE.slice(0, 3),
  dimensions: 2,
  vectors: [new Int8Array([1, 0]), new Int8Array([1, 0]), new Int8Array([0, 1])]
};

describe('semantic search', () => {
  it('returns the catalogue without embedding or tracing an empty query', async () => {
    const embed = vi.fn();
    const { result, trace } = await traceTurn('search', '', () => {
      return searchSemantic('  ', 0.3, undefined, embed, async () => corpus);
    });

    expect(result?.map(({ id }) => id)).toEqual(corpus.phones.map(({ id }) => id));
    expect(embed).not.toHaveBeenCalled();
    expect(trace.steps).toEqual([]);
  });

  it('stably ranks every candidate and applies an inclusive minimum score', async () => {
    const { result, trace } = await traceTurn('search', 'camera', () => {
      return searchSemantic('camera', 1, 'secret', async () => [1, 0], async () => corpus);
    });

    expect(result?.map(({ id }) => id)).toEqual(corpus.phones.slice(0, 2).map(({ id }) => id));
    expect(trace.steps[0]).toMatchObject({
      name: 'search_semantic',
      label: 'semantic search',
      input: {
        query: 'camera',
        model: 'text-embedding-3-small',
        min_score: 1,
        trace_top_n: 10
      },
      output: {
        ranked_candidates: 3,
        qualifying: 2,
        shown_scores: [
          { id: corpus.phones[0].id, cosine: 1 },
          { id: corpus.phones[1].id, cosine: 1 },
          { id: corpus.phones[2].id, cosine: 0 }
        ]
      }
    });
  });

  it('returns an inspectable error step when query embedding fails', async () => {
    const { result, trace } = await traceTurn('search', 'camera', () => {
      return searchSemantic(
        'camera',
        0.3,
        undefined,
        async () => {
          throw new Error('OPENAI_API_KEY is not configured');
        },
        async () => corpus
      );
    });

    expect(result).toBeUndefined();
    expect(trace).toMatchObject({
      status: 'error',
      error: 'OPENAI_API_KEY is not configured',
      steps: [
        {
          name: 'search_semantic',
          status: 'error',
          output: { error: 'OPENAI_API_KEY is not configured' }
        }
      ]
    });
  });
});
