import {
  CATALOGUE,
  projectProduct
} from '$lib/server/catalogue';
import { traceStep } from '$lib/server/trace';

const TOKEN_PATTERN = /[a-z0-9]+/g;
const TRACE_TOP_N = 10;

export const DEFAULT_K1 = 1.5;
export const DEFAULT_B = 0.75;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

export function flattenTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenTokens);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(flattenTokens);
  }
  if (value === null) return [];
  return tokenize(String(value));
}

export class BM25Index {
  readonly documentCounts: ReadonlyArray<ReadonlyMap<string, number>>;
  readonly documentLengths: readonly number[];
  readonly averageLength: number;
  readonly documentFrequency: ReadonlyMap<string, number>;

  constructor(documents: readonly (readonly string[])[]) {
    const frequencies = new Map<string, number>();
    const counts = documents.map((tokens) => {
      const document = new Map<string, number>();
      for (const token of tokens) {
        document.set(token, (document.get(token) ?? 0) + 1);
      }
      for (const token of document.keys()) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }
      return document;
    });

    this.documentCounts = counts;
    this.documentLengths = documents.map((tokens) => tokens.length);
    this.averageLength = documents.length
      ? this.documentLengths.reduce((sum, length) => sum + length, 0) /
        documents.length
      : 0;
    this.documentFrequency = frequencies;
  }

  idf(token: string): number {
    const matches = this.documentFrequency.get(token) ?? 0;
    const documents = this.documentCounts.length;
    return Math.log(
      1 + (documents - matches + 0.5) / (matches + 0.5)
    );
  }

  tokenScores(
    tokens: readonly string[],
    k1 = DEFAULT_K1,
    b = DEFAULT_B
  ): Array<Map<string, number>> {
    return this.documentCounts.map((counts, position) => {
      const scores = new Map<string, number>();
      for (const token of tokens) {
        const frequency = counts.get(token) ?? 0;
        if (frequency === 0) continue;
        const length = this.documentLengths[position];
        const norm =
          frequency +
          k1 * (1 - b + b * length / this.averageLength);
        const score =
          this.idf(token) * frequency * (k1 + 1) / norm;
        scores.set(token, score);
      }
      return scores;
    });
  }
}

const catalogueIndex = new BM25Index(
  CATALOGUE.map((phone) => flattenTokens(phone))
);

function rounded(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export async function searchBM25(
  query: string,
  k1 = DEFAULT_K1,
  b = DEFAULT_B
) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return CATALOGUE.map(projectProduct);

  return traceStep(
    'search_bm25',
    { query },
    (step) => {
      const perDocumentScores = catalogueIndex.tokenScores(tokens, k1, b);
      const uniqueTokens = [...new Set(tokens)];
      const scored = perDocumentScores
        .map((tokenScores, position) => ({
          position,
          tokenScores,
          total: [...tokenScores.values()].reduce(
            (sum, score) => sum + score,
            0
          )
        }))
        .filter(({ tokenScores }) => {
          return tokenScores.size === uniqueTokens.length;
        })
        .sort((left, right) => {
          return right.total - left.total || left.position - right.position;
        });

      const matches = new Map(
        uniqueTokens.map((token) => [
          token,
          perDocumentScores.filter((scores) => scores.has(token)).length
        ])
      );
      const orderedTokens = uniqueTokens.toSorted((left, right) => {
        const leftMatches = matches.get(left) ?? 0;
        const rightMatches = matches.get(right) ?? 0;
        return (
          Number(leftMatches === 0) - Number(rightMatches === 0) ||
          catalogueIndex.idf(right) - catalogueIndex.idf(left)
        );
      });

      step.setOutput({
        catalogue_size: CATALOGUE.length,
        average_length: rounded(catalogueIndex.averageLength, 1),
        k1,
        b,
        tokens: orderedTokens.map((token) => ({
          token,
          matches: matches.get(token) ?? 0,
          weight: rounded(catalogueIndex.idf(token), 4)
        })),
        results: scored.length,
        top_scores: scored.slice(0, TRACE_TOP_N).map((result) => {
          const phone = CATALOGUE[result.position];
          return {
            id: phone.id,
            name: phone.name,
            score: rounded(result.total, 4),
            length: catalogueIndex.documentLengths[result.position],
            tokens: orderedTokens.map((token) => ({
              token,
              count:
                catalogueIndex.documentCounts[result.position].get(token) ?? 0,
              score: rounded(result.tokenScores.get(token) ?? 0, 4)
            }))
          };
        })
      });

      return scored.map(({ position }) => {
        return projectProduct(CATALOGUE[position]);
      });
    },
    'keyword search'
  );
}
