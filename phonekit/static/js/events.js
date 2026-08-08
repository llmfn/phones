// Event binding and the query orchestration. Every search and every filter
// change re-queries the backend (see docs/specs.md); the response drives the
// results grid, facets, chips, and trace.

import { recommend, sendConversationMessage, traceSince } from "./api.js";
import {
  state,
  hasFilters,
  newRunId,
  niceBounds,
  setQuery,
  startTurn,
  applyTraceChanges,
  settleTurn,
  toggleFacetValue,
  removeFacetValue,
  setPrice,
  clearPrice,
  clearFilters,
  resetConversation,
  addConversationMessage,
  buildPayload,
  parseHash,
  toHash,
} from "./state.js";
import {
  setAppState,
  openStep,
  closeStep,
  reframe,
  renderResults,
  renderSummary,
  renderFilters,
  renderChips,
  renderConversation,
  renderTrace,
  renderSearchMode,
  updatePriceUI,
} from "./render.js";

let conversationQueue = [];
let conversationInFlight = false;
let conversationToken = 0;

// The panel follows one turn at a time — a search resets the thread, and the
// conversation queue serializes chat — so starting a watch ends the one before
// it rather than accumulating parked connections.
let traceWatch = null;

// Follow a run while it computes: each request hangs until the pipeline moves,
// so this loop turns over about once per step. The response is still what
// settles the turn; this only fills the panel in the meantime, and gives up
// quietly the moment the turn it was watching leaves the panel.
function watchTrace(runId, turn) {
  traceWatch?.abort();
  const watch = new AbortController();
  traceWatch = watch;

  (async () => {
    let since = 0;
    while (!watch.signal.aborted) {
      let delta;
      try {
        delta = await traceSince(runId, since, watch.signal);
      } catch {
        // Aborted, or the watch itself failed: the answer still lands on its
        // own request, so there is nothing to recover here.
        return;
      }
      since = delta.version;
      if (!applyTraceChanges(turn, delta.changed)) return;
      renderTrace(state.turns);
      if (delta.done) return;
    }
  })();
}

function stopWatchingTrace() {
  traceWatch?.abort();
  traceWatch = null;
}

function hasConversationUi() {
  return document.getElementById("app").dataset.conversationUi === "left_sidebar";
}

function resetConversationTransport() {
  conversationQueue = [];
  conversationInFlight = false;
  conversationToken += 1;
  state.sessionId = null;
  stopWatchingTrace();
}

function normalizeConversationReply(reply) {
  if (typeof reply === "string") return { text: reply, suggestions: [] };
  if (!reply || typeof reply !== "object") return { text: String(reply ?? ""), suggestions: [] };
  const suggestions = Array.isArray(reply.suggestions)
    ? reply.suggestions.filter((suggestion) => typeof suggestion === "string")
    : [];
  return { text: String(reply.text ?? ""), suggestions };
}

function submitConversationText(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  addConversationMessage("user", trimmed);
  renderConversation(state.conversation);
  conversationQueue.push(trimmed);
  flushConversationQueue();
}

async function flushConversationQueue(token = conversationToken) {
  if (conversationInFlight || !state.sessionId || conversationQueue.length === 0) return;

  conversationInFlight = true;
  const message = conversationQueue.shift();
  // A follow-up is a turn of its own: it appends to the panel rather than
  // replacing it, so a session's turns accumulate as the conversation grows.
  const runId = newRunId();
  const turn = startTurn("chat", message, { append: true });
  renderTrace(state.turns);
  watchTrace(runId, turn);
  try {
    const data = await sendConversationMessage(state.sessionId, message, runId);
    if (token === conversationToken) {
      const reply = normalizeConversationReply(data.reply);
      addConversationMessage("assistant", reply.text, reply.suggestions);
      renderConversation(state.conversation);
      settleTurn(turn, data.trace);
      renderTrace(state.turns);
    }
  } catch (err) {
    if (token === conversationToken) {
      addConversationMessage("assistant", err.message);
      renderConversation(state.conversation);
      settleTurn(turn, null);
      renderTrace(state.turns);
    }
  } finally {
    stopWatchingTrace();
    if (token !== conversationToken) return;
    conversationInFlight = false;
    if (conversationQueue.length > 0) {
      flushConversationQueue(token);
    }
  }
}

// Mirror the in-memory search state into the URL fragment. A new search pushes
// a history entry (see the submit handler); everything else rewrites the
// current one, so Back/Forward step through searches, not filter tweaks.
function syncUrl(mode = "replace") {
  const url = toHash() || location.pathname + location.search;
  history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

// Adopt whatever the URL fragment says: on boot, on Back/Forward, and when the
// wordmark link clears the fragment. An empty fragment is the zero state.
export function applyUrl() {
  const { query, filters } = parseHash(location.hash);
  state.query = query;
  state.filters = filters;
  state.priceBounds = null;
  document.getElementById("query").value = query;
  if (query) runQuery({ resetThread: true });
  else {
    resetConversation(null);
    renderConversation(state.conversation);
    setAppState("zero");
  }
}

export async function runQuery({ resetThread = false } = {}) {
  if (resetThread) resetConversationTransport();
  setAppState("search");
  syncUrl();
  const payload = buildPayload();
  // The turn goes up before the request does: a new search is a new session,
  // so it replaces the panel, and its steps fill in as the pipeline records
  // them.
  const runId = newRunId();
  const turn = startTurn("search", state.query);
  renderTrace(state.turns);
  watchTrace(runId, turn);

  let data;
  document.getElementById("spinner").hidden = false;
  try {
    data = await recommend(payload, runId);
  } catch (err) {
    renderResults([]);
    renderSummary(null);
    if (resetThread) {
      resetConversation(null);
      renderConversation(state.conversation);
    }
    document.getElementById("results-head").textContent = err.message;
    state.turns = [];
    renderTrace(state.turns);
    return;
  } finally {
    stopWatchingTrace();
    document.getElementById("spinner").hidden = true;
  }

  // Capture the stable full price bounds the first time we see an unfiltered
  // result, so the slider track does not collapse as filters narrow it.
  if (!hasFilters()) {
    const price = (data.facets ?? []).find((f) => f.type === "range");
    if (price) state.priceBounds = niceBounds({ min: price.min, max: price.max });
  }

  renderResults(data.products ?? []);
  state.sessionId = data.session_id ?? null;
  if (resetThread && hasConversationUi()) {
    resetConversation(data.summary);
    renderConversation(state.conversation);
  }
  renderSummary(data.summary);
  renderFilters(data.facets ?? [], state.filters, state.priceBounds);
  renderChips(state.filters);
  settleTurn(turn, data.trace);
  renderTrace(state.turns);
  renderSearchMode(data.trace);
  // A pipeline that failed still answers with its turn: say so where the
  // result count goes, and let the panel show how far it got.
  if (data.trace?.error) {
    document.getElementById("results-head").textContent = data.trace.error;
  }
}

// Stop the dragged thumb from crossing the other one.
function clampThumbs(dragged) {
  const lo = document.getElementById("price-min");
  const hi = document.getElementById("price-max");
  if (Number(lo.value) > Number(hi.value)) {
    if (dragged === lo) lo.value = hi.value;
    else hi.value = lo.value;
  }
}

function priceFromInputs() {
  const lo = Number(document.getElementById("price-min").value);
  const hi = Number(document.getElementById("price-max").value);
  // Treat "full range" as no filter, so it does not show up as a chip.
  const bounds = state.priceBounds;
  if (bounds && lo <= bounds.min && hi >= bounds.max) clearPrice();
  else setPrice(lo, hi);
}

function selectOnly(button, selector) {
  const group = button.parentElement;
  for (const peer of group.querySelectorAll(selector)) {
    const selected = peer === button;
    peer.classList.toggle("is-selected", selected);
    peer.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function bindFilterPopover() {
  const button = document.getElementById("refine-button");
  if (!button) return;

  const panel = document.getElementById("filters-panel");
  const close = document.getElementById("filters-close");
  const anchor = button.closest(".refine-anchor");

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    anchor.classList.toggle("is-open", open);
  }

  button.addEventListener("click", () => setOpen(panel.hidden));
  close?.addEventListener("click", () => setOpen(false));

  document.addEventListener("pointerdown", (e) => {
    if (panel.hidden || anchor.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

export function bindEvents() {
  bindFilterPopover();

  const conversationForm = document.getElementById("conversation-form");
  conversationForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("conversation-input");
    const text = input.value;
    if (!text.trim()) return;
    input.value = "";
    submitConversationText(text);
  });

  document.getElementById("conversation-thread")?.addEventListener("click", (e) => {
    const button = e.target.closest("[data-conversation-suggestion]");
    if (!button) return;
    submitConversationText(button.dataset.conversationSuggestion ?? button.textContent ?? "");
  });

  document.getElementById("conversation-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      conversationForm?.requestSubmit();
    }
  });

  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("query").value.trim();
    if (!value) return;
    setQuery(value);
    // A brand-new search starts from a clean filter set and its own
    // history entry.
    clearFilters();
    state.priceBounds = null;
    syncUrl("push");
    runQuery({ resetThread: true });
  });

  window.addEventListener("popstate", applyUrl);

  // Live feedback while dragging either thumb (no network call).
  document.getElementById("filters").addEventListener("input", (e) => {
    if (e.target.matches('input[type="range"]')) {
      clampThumbs(e.target);
      updatePriceUI();
    }
  });

  document.getElementById("filters").addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('input[type="checkbox"][data-field]')) {
      toggleFacetValue(t.dataset.field, t.dataset.value);
      runQuery();
    } else if (t.matches('input[type="range"]')) {
      clampThumbs(t);
      priceFromInputs();
      runQuery();
    }
  });

  document.getElementById("chips").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.removeField !== undefined) {
      removeFacetValue(t.dataset.removeField, t.dataset.removeValue);
      runQuery();
    } else if (t.dataset.removePrice !== undefined) {
      clearPrice();
      runQuery();
    } else if (t.classList.contains("chip-clear")) {
      clearFilters();
      runQuery();
    }
  });

  document.getElementById("results").addEventListener("click", (e) => {
    const swatch = e.target.closest(".swatch");
    if (swatch) {
      const card = swatch.closest(".product-card");
      const img = card.querySelector(".product-image");
      if (img && swatch.dataset.image) {
        img.src = swatch.dataset.image;
        img.alt = `${card.dataset.productName} in ${swatch.dataset.colorName}`;
      }
      selectOnly(swatch, ".swatch");
      return;
    }

    const pill = e.target.closest(".storage-pill");
    if (pill) {
      const card = pill.closest(".product-card");
      const price = card.querySelector('[data-role="price"]');
      if (price) price.textContent = pill.dataset.priceLabel;
      selectOnly(pill, ".storage-pill");
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    clearFilters();
    runQuery();
  });

  document.getElementById("copy-trace").addEventListener("click", async () => {
    const json = JSON.stringify(state.turns, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      window.prompt("Copy trace JSON:", json);
    }
  });

  // A step unfolds in place and nothing else moves: no query, no re-render, so
  // the results and every other open step stay exactly as they were.
  document.getElementById("trace").addEventListener("click", (e) => {
    const tab = e.target.closest(".step-tab");
    if (tab) {
      showPane(tab);
      return;
    }
    const schema = e.target.closest(".schema-toggle");
    if (schema) {
      showSchema(schema);
      return;
    }
    const text = e.target.closest(".text-toggle");
    if (text) {
      showLiteral(text);
      return;
    }
    const record = e.target.closest(".doc-name");
    if (record) {
      showRecord(record);
      return;
    }
    const row = e.target.closest(".step-row");
    if (row) toggleStep(row);
  });

  // The frame is measured in pixels, so a window that changes size has to be
  // measured again — the turn's head rewraps and every pinned row moves with it.
  window.addEventListener("resize", reframe);

  // Width is a class on the shell and nothing more: no re-render, so whatever
  // the reader has unfolded survives the toggle.
  document.getElementById("trace-width").addEventListener("click", () => {
    state.traceWide = !state.traceWide;
    setTraceWidth(state.traceWide);
  });
}

// One step is open at a time: the panel's shape is worth more than reading two
// details at once, which a rail this narrow could not show side by side anyway.
// A step that is still running carries no detail, so its row opens nothing.
function toggleStep(row) {
  if (row.closest(".step-item").classList.contains("is-open")) closeStep();
  else openStep(row);
}

// The schema block swaps between the type view and the JSON Schema the
// provider was sent. The button names the view it will give you, never the one
// already on screen.
function showSchema(button) {
  const [tree, json] = button.closest(".detail-block").querySelector(".schema-view").children;
  const raw = tree.hidden;
  tree.hidden = !raw;
  json.hidden = raw;
  button.textContent = raw ? "json" : "types";
  button.title = raw ? "show the JSON Schema as sent" : "show the type view";
}

// The input block swaps between the folded document and the string as sent,
// on the same terms as the schema's toggle: the button names the view it will
// give you, never the one already on screen.
function showLiteral(button) {
  const input = button.closest(".detail-block").querySelector(".detail-input");
  const folded = input.querySelector(".folded-text");
  const literal = input.querySelector(":scope > .detail-text");
  const raw = folded.hidden;
  folded.hidden = !raw;
  literal.hidden = raw;
  button.textContent = raw ? "text" : "folded";
  button.title = raw ? "show the input as sent" : "show the folded view";
}

// A folded record opens under the name that stands for it, and every other
// record stays where it is: this is a list being read, not a step being
// chosen, so there is nothing to be gained by closing the neighbours.
function showRecord(button) {
  const item = button.closest(".doc-item");
  const open = !item.classList.contains("is-open");
  item.classList.toggle("is-open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
  item.querySelector("pre").hidden = !open;
}

function showPane(tab) {
  const detail = tab.closest(".step-detail");
  for (const other of detail.querySelectorAll(".step-tab")) {
    const active = other === tab;
    other.classList.toggle("is-active", active);
    other.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const pane of detail.querySelectorAll(".step-pane")) {
    pane.hidden = pane.dataset.pane !== tab.dataset.pane;
  }
}

function setTraceWidth(wide) {
  const button = document.getElementById("trace-width");
  document.getElementById("app").dataset.traceWidth = wide ? "full" : "rail";
  button.textContent = wide ? "collapse" : "expand";
  button.setAttribute("aria-pressed", wide ? "true" : "false");
  button.setAttribute("aria-label", wide ? "Shrink trace to the rail" : "Grow trace to full width");
  // The panel just changed width, so the open turn's head sits on a different
  // number of lines and everything pinned below it has moved.
  reframe();
}
