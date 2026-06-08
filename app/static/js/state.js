// In-memory app state plus localStorage persistence and derived helpers.
// localStorage keys are defined by docs/specs.md.

const KEYS = {
  currentLayer: "llmfn_current_layer",
  phaseState: "llmfn_phase_state",
  chatHistory: "llmfn_chat_history",
  sessionId: "llmfn_session_id", // not in the spec table, but needed for the API
};

const DEFAULT_LAYER = 1;

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

function makeSessionId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "sess-" + Math.random().toString(16).slice(2);
}

export const state = {
  currentLayer: read(KEYS.currentLayer, DEFAULT_LAYER),
  phaseState: read(KEYS.phaseState, {}),
  chatHistory: read(KEYS.chatHistory, []),
  sessionId: read(KEYS.sessionId, null),
  // Session-only: applies to the next request, never persisted.
  simulateFailureNext: false,
  // Latest trace returned by the backend (for Copy trace as JSON).
  lastTrace: [],
};

if (!state.sessionId) {
  state.sessionId = makeSessionId();
  write(KEYS.sessionId, state.sessionId);
}

// active_layers is derived: selecting layer N enables 1..N.
export function activeLayers() {
  return Array.from({ length: state.currentLayer }, (_, i) => i + 1);
}

export function setCurrentLayer(n) {
  state.currentLayer = n;
  write(KEYS.currentLayer, n);
}

export function addMessage(message) {
  state.chatHistory.push(message);
  write(KEYS.chatHistory, state.chatHistory);
}

export function resetDefaults() {
  setCurrentLayer(DEFAULT_LAYER);
  state.phaseState = {};
  write(KEYS.phaseState, state.phaseState);
  state.chatHistory = [];
  write(KEYS.chatHistory, state.chatHistory);
  state.simulateFailureNext = false;
  state.lastTrace = [];
}

// Build the POST /api/recommend payload from current state.
export function buildPayload(query) {
  return {
    query,
    current_layer: state.currentLayer,
    active_layers: activeLayers(),
    phase: state.phaseState,
    simulate_failure: state.simulateFailureNext,
    session_id: state.sessionId,
  };
}
