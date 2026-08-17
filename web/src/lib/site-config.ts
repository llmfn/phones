const SEARCH_METHODS = ['substring_match', 'bm25', 'semantic_search'] as const;

export const DESIGN_OPTIONS = {
  CHIPS_POSITION: ['under_search', 'above_results'],
  FILTER_UI: ['sidebar', 'popover'],
  CONVERSATION_UI: ['off', 'left_sidebar']
} as const;

type SearchMethod = (typeof SEARCH_METHODS)[number];
type DesignOptions = typeof DESIGN_OPTIONS;

type DesignConfig = {
  [Key in keyof DesignOptions]: DesignOptions[Key][number];
};

interface PromptConfig {
  rewrite: string;
  summarize: string;
  eval: string;
  chat: string;
}

type SearchConfig =
  | { method: 'substring_match'; search_params: Record<string, never> }
  | { method: 'bm25'; search_params: { k1: number; b: number } }
  | { method: 'semantic_search'; search_params: { min_score: number } };

export interface SiteConfig {
  version: 1;
  prompts: PromptConfig;
  search: SearchConfig;
  design: DesignConfig;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  version: 1,
  prompts: { rewrite: '', summarize: '', eval: '', chat: '' },
  search: { method: 'substring_match', search_params: {} },
  design: {
    CHIPS_POSITION: 'under_search',
    FILTER_UI: 'sidebar',
    CONVERSATION_UI: 'off'
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectOrEmpty(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], name: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown ${name} field: ${unknown}`);
}

function stringValue(value: unknown, fallback: string, name: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function finiteNumber(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function parsePrompts(value: unknown): PromptConfig {
  const prompts = objectOrEmpty(value, 'prompts');
  rejectUnknownKeys(prompts, ['rewrite', 'summarize', 'eval', 'chat'], 'prompts');
  return {
    rewrite: stringValue(prompts.rewrite, '', 'prompts.rewrite'),
    summarize: stringValue(prompts.summarize, '', 'prompts.summarize'),
    eval: stringValue(prompts.eval, '', 'prompts.eval'),
    chat: stringValue(prompts.chat, '', 'prompts.chat')
  };
}

function parseMethod(value: unknown): SearchMethod {
  if (value === undefined) return 'substring_match';
  if (typeof value !== 'string' || !SEARCH_METHODS.includes(value as SearchMethod)) {
    throw new Error(`search.method must be one of: ${SEARCH_METHODS.join(', ')}`);
  }
  return value as SearchMethod;
}

function parseSearch(value: unknown): SearchConfig {
  const search = objectOrEmpty(value, 'search');
  rejectUnknownKeys(search, ['method', 'search_params'], 'search');
  const method = parseMethod(search.method);
  const params = objectOrEmpty(search.search_params, 'search.search_params');

  if (method === 'substring_match') {
    rejectUnknownKeys(params, [], 'substring_match search_params');
    return { method, search_params: {} };
  }
  if (method === 'bm25') {
    rejectUnknownKeys(params, ['k1', 'b'], 'bm25 search_params');
    const k1 = finiteNumber(params.k1, 1.5, 'search.search_params.k1');
    const b = finiteNumber(params.b, 0.75, 'search.search_params.b');
    if (k1 <= 0) throw new Error('search.search_params.k1 must be greater than zero');
    if (b < 0 || b > 1) throw new Error('search.search_params.b must be between zero and one');
    return { method, search_params: { k1, b } };
  }

  rejectUnknownKeys(params, ['min_score'], 'semantic_search search_params');
  const minScore = finiteNumber(params.min_score, 0.3, 'search.search_params.min_score');
  if (minScore < -1 || minScore > 1) {
    throw new Error('search.search_params.min_score must be between -1 and 1');
  }
  return { method, search_params: { min_score: minScore } };
}

function designValue<Key extends keyof DesignOptions>(
  design: Record<string, unknown>,
  key: Key
): DesignOptions[Key][number] {
  const value = design[key] ?? DESIGN_OPTIONS[key][0];
  if (typeof value !== 'string' || !(DESIGN_OPTIONS[key] as readonly string[]).includes(value)) {
    throw new Error(`design.${key} must be one of: ${DESIGN_OPTIONS[key].join(', ')}`);
  }
  return value as DesignOptions[Key][number];
}

function parseDesign(value: unknown): DesignConfig {
  const design = objectOrEmpty(value, 'design');
  rejectUnknownKeys(design, Object.keys(DESIGN_OPTIONS), 'design');
  return {
    CHIPS_POSITION: designValue(design, 'CHIPS_POSITION'),
    FILTER_UI: designValue(design, 'FILTER_UI'),
    CONVERSATION_UI: designValue(design, 'CONVERSATION_UI')
  };
}

export function parseSiteConfig(value: unknown): SiteConfig {
  const config = objectOrEmpty(value, 'site config');
  rejectUnknownKeys(config, ['version', 'prompts', 'search', 'design'], 'site config');
  if (config.version !== undefined && config.version !== 1) {
    throw new Error('site config version must be 1');
  }
  return {
    version: 1,
    prompts: parsePrompts(config.prompts),
    search: parseSearch(config.search),
    design: parseDesign(config.design)
  };
}
