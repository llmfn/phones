// In-memory app state. Search state (query + filters) mirrors the URL
// fragment — #q=…&brand=…&color=…&price=min-max — so a URL reproduces a
// search and the bare URL is the zero state. localStorage holds only the
// stable user id (sent as a bearer token). Conversation messages are held in
// memory only and disappear on page refresh.

const KEYS = {
  userId: "llmfn_user_id",
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
  query: "",
  filters: emptyFilters(),
  // Full price bounds from the unfiltered catalogue, so the slider track stays
  // stable even though facet bounds narrow with filtering. Captured on the
  // first unfiltered response.
  priceBounds: null,
  // Latest trace returned by the backend (for "copy as JSON").
  lastTrace: [],
  conversation: [],
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
}

export function resetConversation(summary) {
  state.conversation = summary ? [{ role: "assistant", content: summary }] : [];
}

export function addConversationMessage(role, content) {
  state.conversation.push({ role, content });
}

// --- URL fragment (de)serialization ---

// URLSearchParams carries the whole search state: q, one brand/color entry per
// selected value, and price as "min-max". An empty fragment is the zero state.

export function parseHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const price = /^(\d+)-(\d+)$/.exec(params.get("price") ?? "");
  return {
    query: params.get("q") ?? "",
    filters: {
      brands: params.getAll("brand"),
      colors: params.getAll("color"),
      price: price ? { min: Number(price[1]), max: Number(price[2]) } : null,
    },
  };
}

export function toHash() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const brand of state.filters.brands) params.append("brand", brand);
  for (const color of state.filters.colors) params.append("color", color);
  const price = state.filters.price;
  if (price) params.set("price", `${price.min}-${price.max}`);
  const encoded = params.toString();
  return encoded ? "#" + encoded : "";
}

// Categorical facet selections (field is the filters key: "brands", "colors").

export function toggleFacetValue(field, value) {
  const values = state.filters[field];
  const i = values.indexOf(value);
  if (i === -1) values.push(value);
  else values.splice(i, 1);
}

export function removeFacetValue(field, value) {
  state.filters[field] = state.filters[field].filter((v) => v !== value);
}

export function setPrice(min, max) {
  state.filters.price = { min, max };
}

export function clearPrice() {
  state.filters.price = null;
}

export function clearFilters() {
  state.filters = emptyFilters();
}

// The POST /api/recommend body: query + filters only. Identity travels in the
// Authorization header (see api.js), not the payload.
export function buildPayload() {
  return { query: state.query, filters: state.filters };
}
