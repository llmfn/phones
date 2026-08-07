// In-memory app state. Search state (query + filters) mirrors the URL
// fragment — #q=…&brand=…&color=…&price=min-max — so a URL reproduces a
// search and the bare URL is the zero state. localStorage holds only the
// stable user id (sent as a bearer token). Conversation messages are held in
// memory only and disappear on page refresh; the server owns persisted search
// and conversation session files.

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

function randomId(prefix) {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return prefix + Math.random().toString(16).slice(2);
}

function makeUserId() {
  return randomId("user-");
}

// One id per action, minted before the request goes out so the trace panel can
// start watching the run at the same moment the work starts.
export function newRunId() {
  return randomId("run-");
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
  // Trace turns for the current session, oldest first. A search replaces them
  // (a new search is a new session); later turns append.
  turns: [],
  // Whether the trace panel is grown to full-page width.
  traceWide: false,
  sessionId: null,
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

// --- Trace turns ---

// A turn appears in the panel when the work starts, not when it answers, so it
// begins as a running placeholder that the run's steps fill in and the
// response finally replaces. Every mutator below takes the turn object rather
// than its index and checks it is still in the panel: that one check is what
// makes an abandoned turn's late poll a no-op, without any generation counter
// to keep in step.

let nextTurnId = 1;

export function startTurn(kind, input, { append = false } = {}) {
  // The id follows the turn through settling, so the panel can tell "this turn,
  // further along" from "a different turn in the same place" -- one keeps the
  // reader's open steps and its clock, the other must not.
  const turn = { id: nextTurnId++, kind, input, steps: [], status: "running", latency_ms: null };
  if (append) state.turns.push(turn);
  else state.turns = [turn];
  return turn;
}

export function applyTraceChanges(turn, changed) {
  if (!state.turns.includes(turn)) return false;
  for (const { index, step } of changed ?? []) turn.steps[index] = step;
  return true;
}

// The response's turn is the authoritative one: it replaces the live turn
// whole, so what the panel settles on is exactly what a pre-liveness render
// would have shown.
export function settleTurn(turn, settled) {
  const index = state.turns.indexOf(turn);
  if (index === -1) return;
  if (settled) state.turns[index] = { ...settled, id: turn.id };
  else state.turns.splice(index, 1);
}

export function resetConversation(summary) {
  state.conversation = summary ? [{ role: "assistant", content: summary }] : [];
}

export function addConversationMessage(role, content, suggestions = []) {
  const message = { role, content: String(content ?? "") };
  if (role === "assistant" && suggestions.length) {
    message.suggestions = suggestions.filter((suggestion) => typeof suggestion === "string");
  }
  state.conversation.push(message);
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
