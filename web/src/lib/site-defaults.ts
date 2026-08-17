/**
 * Every default value a site starts with, and the copy describing each knob.
 *
 * This file is data, not logic: `site-config.ts` validates against it and the
 * studio panels render from it, so a knob's default, its bounds, and the words
 * next to it are one entry here rather than three places to keep in step.
 */

/* ---- prompts ---- */

export interface PromptSpec {
  name: 'rewrite' | 'summarize' | 'chat' | 'eval';
  /** Heading for this prompt's own page. */
  title: string;
  hint: string;
  default: string;
}

/** In pipeline order, with the judge last — it grades, it does not run. */
export const PROMPTS = [
  {
    name: 'rewrite',
    title: 'How the query reaches the search engine.',
    hint: 'Turns the shopper’s words into a query the search engine can use.',
    default: '<!-- prompt to rewrite the query -->'
  },
  {
    name: 'summarize',
    title: 'How your site writes the recommendation.',
    hint: 'Writes the recommendation paragraph over the phones search returned.',
    default: '<!-- prompt to summarize the search results -->'
  },
  {
    name: 'chat',
    title: 'How your site carries the conversation.',
    hint: 'Carries the conversation on from that first recommendation.',
    default: '<!-- prompt to respond to the chat -->'
  },
  {
    name: 'eval',
    title: 'How your site is judged.',
    hint: 'Judges one answer against its expectation. Ships written; edit only if you want a stricter judge.',
    default: `You are checking whether a phone recommender answered one shopper request well.

You receive the shopper's query, a plain-language expectation, and the answer
the app returned. Decide whether the answer meets the expectation.

Return \`passed: true\` only when the returned products and summary satisfy the
expectation. Return \`passed: false\` when results are missing, irrelevant,
incorrectly ranked, outside a stated constraint, or contradicted by the answer.

Give one short, specific sentence for \`reason\`. Name the product, ranking, or
constraint that decided the verdict. Judge only the supplied answer; do not
assume facts that are not present.`
  }
] as const satisfies readonly PromptSpec[];

export type PromptName = (typeof PROMPTS)[number]['name'];

/* ---- search ---- */

export interface SearchParamSpec {
  name: string;
  default: number;
  label: string;
  /** Step for the number input; also the granularity worth typing. */
  step: string;
  min?: number;
  max?: number;
  /** Treat `min` as a bound the value must clear rather than one it may take. */
  exclusiveMin?: boolean;
}

export interface SearchMethodSpec {
  value: 'substring_match' | 'bm25' | 'semantic_search';
  hint: string;
  params: readonly SearchParamSpec[];
}

export const SEARCH_METHODS = [
  {
    value: 'substring_match',
    hint: 'Case-insensitive match on the phone name. What you write before you know about ranking.',
    params: []
  },
  {
    value: 'bm25',
    hint: 'Keyword ranking over the whole record. Every query token has to appear.',
    params: [
      {
        name: 'k1',
        default: 1.5,
        label: 'k1 — term frequency saturation',
        step: '0.1',
        min: 0,
        exclusiveMin: true
      },
      { name: 'b', default: 0.75, label: 'b — length normalisation', step: '0.05', min: 0, max: 1 }
    ]
  },
  {
    value: 'semantic_search',
    hint: 'Cosine similarity against each phone’s narrative. Answers vibe queries.',
    params: [
      {
        name: 'min_score',
        default: 0.3,
        label: 'min_score — similarity cutoff',
        step: '0.05',
        min: -1,
        max: 1
      }
    ]
  }
] as const satisfies readonly SearchMethodSpec[];

export type SearchMethod = (typeof SEARCH_METHODS)[number]['value'];

export function searchMethodSpec(method: SearchMethod): SearchMethodSpec {
  return SEARCH_METHODS.find((spec) => spec.value === method) as SearchMethodSpec;
}

/** Every knob any method offers, which is what a save may legally carry. */
export const SEARCH_PARAM_NAMES = SEARCH_METHODS.flatMap((spec) =>
  spec.params.map((param) => param.name)
);

/* ---- design ---- */

export const DESIGN_OPTIONS = {
  CHIPS_POSITION: ['under_search', 'above_results'],
  FILTER_UI: ['sidebar', 'popover'],
  CONVERSATION_UI: ['off', 'left_sidebar']
} as const;

/* ---- the document ---- */

/**
 * What a site with no configuration of its own searches with.
 *
 * The rest of the default document needs no constant: every field above
 * carries its own default, and `parseSiteConfig({})` assembles them.
 */
export const DEFAULT_SEARCH_METHOD: SearchMethod = 'substring_match';
