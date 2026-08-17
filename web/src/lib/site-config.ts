import {
  DEFAULT_SEARCH_METHOD,
  DESIGN_OPTIONS,
  PROMPTS,
  SEARCH_METHODS,
  searchMethodSpec,
  type PromptName,
  type SearchMethod,
  type SearchParamSpec
} from './site-defaults';

export { DESIGN_OPTIONS };

type DesignOptions = typeof DESIGN_OPTIONS;

type DesignConfig = {
  [Key in keyof DesignOptions]: DesignOptions[Key][number];
};

type PromptConfig = Record<PromptName, string>;

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
  rejectUnknownKeys(
    prompts,
    PROMPTS.map((prompt) => prompt.name),
    'prompts'
  );
  const parsed = {} as PromptConfig;
  for (const prompt of PROMPTS) {
    parsed[prompt.name] = stringValue(
      prompts[prompt.name],
      prompt.default,
      `prompts.${prompt.name}`
    );
  }
  return parsed;
}

function parseMethod(value: unknown): SearchMethod {
  const methods = SEARCH_METHODS.map((spec) => spec.value);
  if (value === undefined) return DEFAULT_SEARCH_METHOD;
  if (typeof value !== 'string' || !methods.includes(value as SearchMethod)) {
    throw new Error(`search.method must be one of: ${methods.join(', ')}`);
  }
  return value as SearchMethod;
}

function rangeMessage({ min, max, exclusiveMin }: SearchParamSpec): string {
  if (min !== undefined && max !== undefined) return `must be between ${min} and ${max}`;
  if (min !== undefined) return `must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}`;
  return `must be at most ${max}`;
}

function checkRange(value: number, param: SearchParamSpec, name: string) {
  const { min, max, exclusiveMin } = param;
  const belowMin = min !== undefined && (exclusiveMin ? value <= min : value < min);
  const aboveMax = max !== undefined && value > max;
  if (belowMin || aboveMax) throw new Error(`${name} ${rangeMessage(param)}`);
}

function parseSearch(value: unknown): SearchConfig {
  const search = objectOrEmpty(value, 'search');
  rejectUnknownKeys(search, ['method', 'search_params'], 'search');
  const method = parseMethod(search.method);
  const spec = searchMethodSpec(method);
  const params = objectOrEmpty(search.search_params, 'search.search_params');
  rejectUnknownKeys(
    params,
    spec.params.map((param) => param.name),
    `${method} search_params`
  );

  const search_params: Record<string, number> = {};
  for (const param of spec.params) {
    const name = `search.search_params.${param.name}`;
    const number = finiteNumber(params[param.name], param.default, name);
    checkRange(number, param, name);
    search_params[param.name] = number;
  }

  // The table and the union above describe the same knobs per method; the
  // table is what a save is checked against, the union is what callers read.
  return { method, search_params } as SearchConfig;
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

/** The document a site with no revisions of its own serves. */
export const DEFAULT_SITE_CONFIG: SiteConfig = parseSiteConfig({});
