import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;
const AUDIT_QUERY = 'a phone for my mom';
const AUDIT_DEPTH = 20;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const phonesDirectory = resolve(scriptDirectory, '../../data/phones');
const outputPath = resolve(scriptDirectory, '../src/lib/server/search/semantic-embeddings.generated.json');

interface PhoneNarrative {
  id: string;
  narrative: string;
}

interface QuantizedVector {
  scale: number;
  values: Int8Array;
}

interface GeneratedArtifact {
  model: string;
  dimensions: number;
  ids: string[];
  narrative_sha256: string[];
  scales: number[];
  vectors_base64: string;
  audit: {
    query: string;
    depth: number;
    query_scale: number;
    query_base64: string;
    float_top_ids: string[];
    quantized_top_ids: string[];
    max_score_drift: number;
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function quantize(vector: readonly number[]): QuantizedVector {
  const maximum = Math.max(...vector.map(Math.abs));
  const scale = maximum === 0 ? 1 : maximum / 127;
  return {
    scale,
    values: Int8Array.from(vector, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))))
  };
}

function cosine(left: readonly number[], right: readonly number[]): number {
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

function dequantize(vector: QuantizedVector): number[] {
  return Array.from(vector.values, (value) => value * vector.scale);
}

function rank(
  ids: readonly string[],
  query: readonly number[],
  vectors: readonly (readonly number[])[]
): Array<{ id: string; score: number }> {
  return ids
    .map((id, position) => ({ id, position, score: cosine(query, vectors[position]) }))
    .sort((left, right) => right.score - left.score || left.position - right.position);
}

function encode(vectors: readonly Int8Array[]): string {
  return Buffer.concat(
    vectors.map((vector) => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength))
  ).toString('base64');
}

async function loadPhones(): Promise<PhoneNarrative[]> {
  const filenames = (await readdir(phonesDirectory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    filenames.map(async (filename) => {
      const phone = JSON.parse(await readFile(resolve(phonesDirectory, filename), 'utf8')) as {
        id?: unknown;
        narrative?: unknown;
      };
      if (typeof phone.id !== 'string' || typeof phone.narrative !== 'string') {
        throw new Error(`Invalid id or narrative in ${filename}`);
      }
      return { id: phone.id, narrative: phone.narrative };
    })
  );
}

function validateCurrentArtifact(artifact: GeneratedArtifact, phones: readonly PhoneNarrative[]): void {
  const ids = phones.map((phone) => phone.id);
  const hashes = phones.map((phone) => sha256(phone.narrative));
  if (artifact.model !== MODEL) throw new Error(`Embedding model must be ${MODEL}`);
  if (artifact.dimensions !== DIMENSIONS) throw new Error(`Embedding dimensions must be ${DIMENSIONS}`);
  if (JSON.stringify(artifact.ids) !== JSON.stringify(ids)) {
    throw new Error('Embedding phone ids do not match the catalogue');
  }
  if (JSON.stringify(artifact.narrative_sha256) !== JSON.stringify(hashes)) {
    throw new Error('Embedding narratives are stale');
  }
  if (artifact.scales.length !== phones.length) {
    throw new Error('Embedding scales do not match the catalogue');
  }
  const bytes = Buffer.from(artifact.vectors_base64, 'base64');
  if (bytes.length !== phones.length * DIMENSIONS) {
    throw new Error('Embedding vector payload has the wrong length');
  }
}

async function embed(texts: readonly string[], apiKey: string): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts })
  });
  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed (${response.status}): ${await response.text()}`);
  }
  const payload = (await response.json()) as { data?: Array<{ index?: unknown; embedding?: unknown }> };
  if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
    throw new Error('OpenAI returned the wrong number of embeddings');
  }
  const indexes = payload.data.map(({ index }) => index);
  if (
    !indexes.every((index) => Number.isInteger(index) && Number(index) >= 0 && Number(index) < texts.length) ||
    new Set(indexes).size !== texts.length
  ) {
    throw new Error('OpenAI returned invalid embedding indexes');
  }
  return payload.data
    .toSorted((left, right) => Number(left.index) - Number(right.index))
    .map((item, index) => {
      if (
        !Array.isArray(item.embedding) ||
        item.embedding.length !== DIMENSIONS ||
        !item.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        throw new Error(`OpenAI returned an invalid embedding at index ${index}`);
      }
      return item.embedding as number[];
    });
}

const phones = await loadPhones();

if (process.argv.includes('--check')) {
  try {
    const artifact = JSON.parse(await readFile(outputPath, 'utf8')) as GeneratedArtifact;
    validateCurrentArtifact(artifact, phones);
  } catch (error) {
    console.error(
      `Semantic embedding artifact is stale or invalid: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error('Run npm run generate:embeddings.');
    process.exitCode = 1;
  }
} else {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required to generate semantic embeddings');

  const embedded = await embed([...phones.map((phone) => phone.narrative), AUDIT_QUERY], apiKey);
  const vectors = embedded.slice(0, phones.length);
  const query = embedded.at(-1);
  if (!query) throw new Error('OpenAI did not return the audit query embedding');

  const quantized = vectors.map(quantize);
  const quantizedQuery = quantize(query);
  const ids = phones.map((phone) => phone.id);
  const floatRanking = rank(ids, query, vectors);
  const quantizedRanking = rank(ids, dequantize(quantizedQuery), quantized.map(dequantize));
  const floatTopIds = floatRanking.slice(0, AUDIT_DEPTH).map(({ id }) => id);
  const quantizedTopIds = quantizedRanking.slice(0, AUDIT_DEPTH).map(({ id }) => id);
  if (JSON.stringify(floatTopIds) !== JSON.stringify(quantizedTopIds)) {
    throw new Error(`Quantization changed the top ${AUDIT_DEPTH} audit ranking`);
  }

  const artifact: GeneratedArtifact = {
    model: MODEL,
    dimensions: DIMENSIONS,
    ids,
    narrative_sha256: phones.map((phone) => sha256(phone.narrative)),
    scales: quantized.map(({ scale }) => scale),
    vectors_base64: encode(quantized.map(({ values }) => values)),
    audit: {
      query: AUDIT_QUERY,
      depth: AUDIT_DEPTH,
      query_scale: quantizedQuery.scale,
      query_base64: encode([quantizedQuery.values]),
      float_top_ids: floatTopIds,
      quantized_top_ids: quantizedTopIds,
      max_score_drift: Math.max(
        ...floatRanking.map(({ id, score }) => {
          const quantizedScore = quantizedRanking.find((entry) => entry.id === id)?.score;
          return Math.abs(score - (quantizedScore ?? score));
        })
      )
    }
  };
  validateCurrentArtifact(artifact, phones);
  await writeFile(outputPath, `${JSON.stringify(artifact)}\n`);
  console.log(
    `Generated ${phones.length} semantic embeddings (${Buffer.from(artifact.vectors_base64, 'base64').length} int8 bytes)`
  );
}
