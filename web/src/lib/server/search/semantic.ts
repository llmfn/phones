import { projectProduct } from '$lib/server/catalogue';
import { traceStep } from '$lib/server/trace';

import {
  EMBEDDING_MODEL,
  corpusEmbeddings,
  cosine,
  embedQuery,
  type EmbeddingCorpus
} from './embeddings';

const TRACE_TOP_N = 10;

export type QueryEmbedder = (query: string, apiKey: string | undefined) => Promise<number[]>;
export type CorpusLoader = () => Promise<EmbeddingCorpus>;

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

export async function searchSemantic(
  query: string,
  minScore = 0.3,
  apiKey?: string,
  embed: QueryEmbedder = embedQuery,
  loadCorpus: CorpusLoader = corpusEmbeddings
) {
  const corpus = await loadCorpus();
  if (!query.trim()) return corpus.phones.map(projectProduct);

  return traceStep(
    'search_semantic',
    {
      query,
      model: EMBEDDING_MODEL,
      min_score: minScore,
      trace_top_n: TRACE_TOP_N
    },
    async (step) => {
      const queryVector = await embed(query, apiKey);
      if (queryVector.length !== corpus.dimensions) {
        throw new Error(
          `Query embedding has ${queryVector.length} dimensions; expected ${corpus.dimensions}`
        );
      }
      const scored = corpus.phones
        .map((phone, position) => ({
          phone,
          position,
          score: cosine(queryVector, corpus.vectors[position])
        }))
        .sort((left, right) => right.score - left.score || left.position - right.position);
      const qualifying = scored.filter(({ score }) => score >= minScore);

      step.setOutput({
        ranked_candidates: scored.length,
        qualifying: qualifying.length,
        shown_scores: scored.slice(0, TRACE_TOP_N).map(({ phone, score }) => ({
          id: phone.id,
          name: phone.name,
          cosine: rounded(score)
        }))
      });
      return qualifying.map(({ phone }) => projectProduct(phone));
    },
    'semantic search'
  );
}
