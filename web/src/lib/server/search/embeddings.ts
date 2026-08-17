import { CATALOGUE } from '$lib/server/catalogue';

import artifact from './semantic-embeddings.generated.json';

import type { CataloguePhone } from '$lib/schema';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface EmbeddingArtifact {
  model: string;
  dimensions: number;
  ids: string[];
  narrative_sha256: string[];
  scales: number[];
  vectors_base64: string;
}

export interface EmbeddingCorpus {
  phones: readonly CataloguePhone[];
  vectors: readonly Int8Array[];
  dimensions: number;
}

function decodeBase64(value: string): Int8Array {
  const binary = atob(value);
  return Int8Array.from(binary, (character) => {
    const byte = character.charCodeAt(0);
    return byte > 127 ? byte - 256 : byte;
  });
}

async function narrativeHash(narrative: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(narrative));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadEmbeddingCorpus(
  phones: readonly CataloguePhone[],
  source: EmbeddingArtifact
): Promise<EmbeddingCorpus> {
  if (source.model !== EMBEDDING_MODEL) {
    throw new Error(`Semantic embeddings use ${source.model}; expected ${EMBEDDING_MODEL}`);
  }
  if (!Number.isInteger(source.dimensions) || source.dimensions <= 0) {
    throw new Error('Semantic embeddings have invalid dimensions');
  }
  if (
    source.ids.length !== phones.length ||
    source.narrative_sha256.length !== phones.length ||
    source.scales.length !== phones.length
  ) {
    throw new Error('Semantic embeddings do not match the catalogue size');
  }

  const hashes = await Promise.all(phones.map((phone) => narrativeHash(phone.narrative)));
  for (let position = 0; position < phones.length; position += 1) {
    const phone = phones[position];
    if (source.ids[position] !== phone.id) {
      throw new Error(`Semantic embeddings do not match catalogue phone ${phone.id}`);
    }
    if (source.narrative_sha256[position] !== hashes[position]) {
      throw new Error(`Semantic embedding is stale for ${phone.id}`);
    }
    if (!Number.isFinite(source.scales[position]) || source.scales[position] <= 0) {
      throw new Error(`Semantic embedding has an invalid scale for ${phone.id}`);
    }
  }

  const bytes = decodeBase64(source.vectors_base64);
  const expectedLength = phones.length * source.dimensions;
  if (bytes.length !== expectedLength) {
    throw new Error(`Semantic embedding payload has ${bytes.length} values; expected ${expectedLength}`);
  }
  return {
    phones,
    dimensions: source.dimensions,
    vectors: phones.map((_, position) => {
      const start = position * source.dimensions;
      return bytes.slice(start, start + source.dimensions);
    })
  };
}

let corpusPromise: Promise<EmbeddingCorpus> | undefined;

export function corpusEmbeddings(): Promise<EmbeddingCorpus> {
  corpusPromise ??= loadEmbeddingCorpus(CATALOGUE, artifact);
  return corpusPromise;
}

export function cosine(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length !== right.length) throw new Error('Cannot compare embeddings with different dimensions');
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}

export async function embedQuery(
  query: string,
  apiKey: string | undefined,
  request: typeof fetch = fetch
): Promise<number[]> {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const response = await request('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI embeddings failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error('OpenAI embeddings response is missing data');
  }
  const item = payload.data[0];
  if (
    payload.data.length !== 1 ||
    typeof item !== 'object' ||
    item === null ||
    !('index' in item) ||
    item.index !== 0 ||
    !('embedding' in item) ||
    !Array.isArray(item.embedding) ||
    item.embedding.length !== artifact.dimensions ||
    !item.embedding.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new Error('OpenAI returned an invalid query embedding');
  }
  return item.embedding as number[];
}
