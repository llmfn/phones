// In-memory app state plus localStorage persistence.
// Keys are defined by docs/specs.md: a stable user id (sent as a bearer token),
// the last query, and the last applied filters. There is no chat history — this
// is a product-search app, not a chatbot.

const KEYS = {
  userId: "llmfn_user_id",
  lastQuery: "llmfn_last_query",
  lastFilters: "llmfn_last_filters",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function makeUserId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "user-" + Math.random().toString(16).slice(2);
}

function emptyFilters() {
  return { brands: [], colors: [], price: null };
}

export const state = {
  userId: read(KEYS.userId, null),
  query: read(KEYS.lastQuery, ""),
  // Merge over the empty shape so filters persisted before a new facet
  // existed (e.g. colors) still have every key.
  filters: { ...emptyFilters(), ...read(KEYS.lastFilters, {}) },
  // Full price bounds from the unfiltered catalogue, so the slider track stays
  // stable even though facet bounds narrow with filtering. Captured on the
  // first unfiltered response.
  priceBounds: null,
  // Latest trace returned by the backend (for "copy as JSON").
  lastTrace: [],
};

if (!state.userId) {
  state.userId = makeUserId();
  write(KEYS.userId, state.userId);
}

// Round price bounds outward to the nearest 500 so every slider stop is a clean
// number (13000, 13500, ...) and the step stays uniform across the whole track.
export function niceBounds(bounds) {
  return {
    min: Math.floor(bounds.min / 500) * 500,
    max: Math.ceil(bounds.max / 500) * 500,
  };
}

export function hasFilters() {
  return (
    state.filters.brands.length > 0 ||
    state.filters.colors.length > 0 ||
    state.filters.price !== null
  );
}

export function setQuery(q) {
  state.query = q;
  write(KEYS.lastQuery, q);
}

// Categorical facet selections (field is the filters key: "brands", "colors").

export function toggleFacetValue(field, value) {
  const values = state.filters[field];
  const i = values.indexOf(value);
  if (i === -1) values.push(value);
  else values.splice(i, 1);
  persistFilters();
}

export function removeFacetValue(field, value) {
  state.filters[field] = state.filters[field].filter((v) => v !== value);
  persistFilters();
}

export function setPrice(min, max) {
  state.filters.price = { min, max };
  persistFilters();
}

export function clearPrice() {
  state.filters.price = null;
  persistFilters();
}

export function clearFilters() {
  state.filters = emptyFilters();
  persistFilters();
}

function persistFilters() {
  write(KEYS.lastFilters, state.filters);
}

// The POST /api/recommend body: query + filters only. Identity travels in the
// Authorization header (see api.js), not the payload.
export function buildPayload() {
  return { query: state.query, filters: state.filters };
}
