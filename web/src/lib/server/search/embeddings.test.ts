import { describe, expect, it, vi } from 'vitest';

import { CATALOGUE } from '$lib/server/catalogue';

import artifact from './semantic-embeddings.generated.json';
import {
  EMBEDDING_MODEL,
  cosine,
  embedQuery,
  loadEmbeddingCorpus
} from './embeddings';

function decode(value: string): Int8Array {
  return Int8Array.from(atob(value), (character) => {
    const byte = character.charCodeAt(0);
    return byte > 127 ? byte - 256 : byte;
  });
}

describe('semantic embeddings', () => {
  it('computes cosine similarity and handles zero vectors honestly', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [1, 1])).toBeCloseTo(Math.SQRT1_2, 10);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(() => cosine([1], [1, 0])).toThrow('different dimensions');
  });

  it('rejects an artifact after its source narrative changes', async () => {
    const changed = [{ ...CATALOGUE[0], narrative: `${CATALOGUE[0].narrative} changed` }, ...CATALOGUE.slice(1)];
    await expect(loadEmbeddingCorpus(changed, artifact)).rejects.toThrow(
      `Semantic embedding is stale for ${CATALOGUE[0].id}`
    );
  });

  it('preserves the reviewed float ranking after int8 quantization', async () => {
    const corpus = await loadEmbeddingCorpus(CATALOGUE, artifact);
    const query = decode(artifact.audit.query_base64);
    const ranked = corpus.phones
      .map((phone, position) => ({
        id: phone.id,
        position,
        score: cosine(query, corpus.vectors[position])
      }))
      .sort((left, right) => right.score - left.score || left.position - right.position)
      .slice(0, artifact.audit.depth)
      .map(({ id }) => id);

    expect(artifact.audit.quantized_top_ids).toEqual(artifact.audit.float_top_ids);
    expect(ranked).toEqual(artifact.audit.float_top_ids);
    expect(artifact.audit.max_score_drift).toBeLessThan(0.001);
  });

  it('sends the exact embedding request and validates the response', async () => {
    const vector = Array.from({ length: artifact.dimensions }, (_, index) => index / artifact.dimensions);
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: vector }] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    });

    await expect(embedQuery('quiet camera phone', 'secret', request)).resolves.toEqual(vector);
    expect(request).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' })
      })
    );
    const options = request.mock.calls[0][1];
    expect(JSON.parse(String(options?.body))).toEqual({
      model: EMBEDDING_MODEL,
      input: ['quiet camera phone']
    });
  });

  it('names the missing Worker secret before making a request', async () => {
    const request = vi.fn();
    await expect(embedQuery('camera', undefined, request)).rejects.toThrow(
      'OPENAI_API_KEY is not configured'
    );
    expect(request).not.toHaveBeenCalled();
  });
});
