// DOM rendering: results grid, filter facets, active-filter chips, and the trace.
// The shell (search box, empty zone containers) is server-rendered in
// index.html; everything data-driven lives here.

import DOMPurify from "../vendor/purify.es.mjs";
import { marked } from "../vendor/marked.esm.js";
import { niceBounds } from "./state.js";

const inr = new Intl.NumberFormat("en-IN");
const rupees = (n) => "₹" + inr.format(n);

function storageText(option) {
  const storage = formatCapacity(option.gb);
  if (option.ram_gb) return `${option.ram_gb} GB + ${storage}`;
  return storage;
}

function formatCapacity(gb) {
  if (gb >= 1024 && gb % 1024 === 0) return `${gb / 1024}TB`;
  if (gb >= 1000 && gb % 1000 === 0) return `${gb / 1000}TB`;
  return `${gb} GB`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderMarkdown(content) {
  return DOMPurify.sanitize(marked.parse(content));
}

// --- App state (zero vs search) ---

export function setAppState(name) {
  document.getElementById("app").dataset.state = name;
}

// --- Results ---

export function renderSummary(summary) {
  const div = document.getElementById("summary");
  if (conversationEnabled()) summary = null;
  if (summary) {
    div.textContent = summary;
    div.style.display = "";
  } else {
    div.textContent = "";
    div.style.display = "none";
  }
}

function conversationEnabled() {
  return document.getElementById("app").dataset.conversationUi === "left_sidebar";
}

export function renderConversation(messages) {
  const thread = document.getElementById("conversation-thread");
  if (!thread) return;

  thread.innerHTML = "";
  if (!messages.length) {
    thread.appendChild(el("div", "conversation-empty", "Search to start a conversation."));
    return;
  }

  for (const message of messages) {
    const row = el("div", `message-row ${message.role}`);
    const stack = el("div", "message-stack");
    const bubble = el("div", "message-bubble");
    if (message.role === "assistant") {
      bubble.classList.add("markdown");
      bubble.innerHTML = renderMarkdown(message.content);
    } else {
      bubble.textContent = message.content;
    }
    stack.appendChild(bubble);

    if (message.role === "assistant" && message.suggestions?.length) {
      const suggestions = el("div", "message-suggestions");
      for (const suggestion of message.suggestions) {
        const button = el("button", "message-suggestion", suggestion);
        button.type = "button";
        button.dataset.conversationSuggestion = suggestion;
        suggestions.appendChild(button);
      }
      stack.appendChild(suggestions);
    }

    row.appendChild(stack);
    thread.appendChild(row);
  }

  thread.scrollTop = thread.scrollHeight;
}

export function renderResults(products) {
  const head = document.getElementById("results-head");
  const grid = document.getElementById("results");
  const count = products.length;
  head.textContent = `${count} result${count === 1 ? "" : "s"}`;
  grid.innerHTML = "";

  if (!count) {
    grid.appendChild(el("div", "empty", "No phones match — try a broader search."));
    return;
  }

  for (const p of products) {
    const card = el("div", "product-card");
    card.dataset.productName = p.name ?? "Phone";
    if (p.image) {
      // The well div owns the tinted background; the image multiplies onto it
      // (see styles.css) so baked-in white backgrounds match the well exactly.
      const well = el("div", "image-well");
      const img = el("img", "product-image");
      img.src = p.image;
      img.alt = p.color_name ? `${p.name ?? "Phone"} in ${p.color_name}` : p.name ?? "";
      well.appendChild(img);
      card.appendChild(well);
    }
    if (p.brand) card.appendChild(el("div", "brand", p.brand));
    card.appendChild(el("div", "name", p.name ?? ""));
    const price = el("div", "price", rupees(p.price ?? 0));
    price.dataset.role = "price";
    card.appendChild(price);
    card.appendChild(colorSwatches(p));
    card.appendChild(storageOptions(p));
    grid.appendChild(card);
  }
}

function colorSwatches(product) {
  const row = el("div", "swatches");
  row.setAttribute("aria-label", "Colours");

  for (const color of product.colors ?? []) {
    const button = el("button", "swatch");
    button.type = "button";
    button.title = color.name ?? color.family ?? "Colour";
    button.setAttribute("aria-label", `Show ${button.title}`);
    button.dataset.image = color.image ?? "";
    button.dataset.colorName = color.name ?? color.family ?? "Colour";

    if (color.hex) button.style.setProperty("--swatch-color", color.hex);
    else button.classList.add("swatch-empty");

    const selected = product.color_name
      ? color.name === product.color_name
      : color.family === product.color_family;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    row.appendChild(button);
  }

  return row;
}

function storageOptions(product) {
  const row = el("div", "storage-options");
  row.setAttribute("aria-label", "Storage options");

  for (const option of product.storage_options ?? []) {
    const button = el("button", "storage-pill", storageText(option));
    button.type = "button";
    button.dataset.priceLabel = rupees(option.price ?? 0);
    const selected = option.gb === product.storage_gb && (option.ram_gb ?? null) === (product.ram_gb ?? null);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    row.appendChild(button);
  }

  return row;
}

// --- Filters (facets) ---

export function renderFilters(facets, filters, priceBounds) {
  const root = document.getElementById("filters");
  root.innerHTML = "";
  for (const facet of facets ?? []) {
    if (facet.type === "categorical") root.appendChild(categoricalFacet(facet, filters));
    else if (facet.type === "range") root.appendChild(rangeFacet(facet, filters, priceBounds));
  }
  updatePriceUI();
}

// API facet field → the key in the filters object, and the rail heading.
const FACET_KEYS = { brand: "brands", color: "colors" };
const FACET_TITLES = { brand: "Brand", color: "Colour" };

function categoricalFacet(facet, filters) {
  const group = el("div", "facet-group");
  const fallback = facet.field.charAt(0).toUpperCase() + facet.field.slice(1);
  group.appendChild(el("h3", null, FACET_TITLES[facet.field] ?? fallback));

  const key = FACET_KEYS[facet.field];
  const selected = key ? filters[key] : [];
  for (const v of facet.values) {
    const label = el("label", "checkbox");
    const box = el("input");
    box.type = "checkbox";
    if (key) {
      box.dataset.field = key;
      box.dataset.value = v.value;
    } else {
      box.disabled = true; // facet this frontend does not know how to filter on
    }
    box.checked = selected.includes(v.value);
    label.appendChild(box);
    if (v.hex) {
      const dot = el("span", "facet-swatch");
      dot.style.setProperty("--swatch-color", v.hex);
      label.appendChild(dot);
    }
    label.appendChild(el("span", "value", v.value));
    label.appendChild(el("span", "count", `(${v.count})`));
    group.appendChild(label);
  }
  return group;
}

function rangeFacet(facet, filters, priceBounds) {
  // Slider track uses the stable full bounds; the handles reflect the selected
  // range (or the full bounds when no price filter is active). Two range inputs
  // are overlaid on one track to make a dual-thumb slider; updatePriceUI paints
  // the band between them and keeps the labels in sync.
  const bounds = priceBounds ?? niceBounds({ min: facet.min, max: facet.max });
  const sel = filters.price ?? { min: bounds.min, max: bounds.max };
  const step = 500;

  const group = el("div", "facet-group");
  group.appendChild(el("h3", null, "Price"));

  const range = el("div", "range");
  range.dataset.min = String(bounds.min);
  range.dataset.max = String(bounds.max);
  const fill = el("div", "range-fill");
  fill.id = "price-fill";
  range.appendChild(el("div", "range-track"));
  range.appendChild(fill);
  range.appendChild(slider("price-min", bounds, sel.min, step));
  range.appendChild(slider("price-max", bounds, sel.max, step));

  const labels = el("div", "price-labels");
  const lo = el("span", null, rupees(sel.min));
  lo.id = "price-min-label";
  const hi = el("span", null, rupees(sel.max));
  hi.id = "price-max-label";
  labels.appendChild(lo);
  labels.appendChild(hi);

  group.appendChild(range);
  group.appendChild(labels);
  return group;
}

function slider(id, bounds, value, step) {
  const input = el("input");
  input.type = "range";
  input.id = id;
  input.min = String(bounds.min);
  input.max = String(bounds.max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

// Paint the selected band and update the labels from the two thumbs' current
// values. Also lifts the min thumb above the max thumb when it nears the top,
// so it stays grabbable where the two inputs overlap.
export function updatePriceUI() {
  const range = document.querySelector(".range");
  if (!range) return;
  const lo = document.getElementById("price-min");
  const hi = document.getElementById("price-max");
  const min = Number(range.dataset.min);
  const max = Number(range.dataset.max);
  const span = max - min || 1;
  const a = Number(lo.value);
  const b = Number(hi.value);

  const left = ((a - min) / span) * 100;
  const right = ((b - min) / span) * 100;
  const fill = document.getElementById("price-fill");
  fill.style.left = left + "%";
  fill.style.width = Math.max(0, right - left) + "%";

  document.getElementById("price-min-label").textContent = rupees(a);
  document.getElementById("price-max-label").textContent = rupees(b);

  lo.style.zIndex = a > min + span / 2 ? "5" : "";
}

// --- Active-filter chips ---

export function renderChips(filters) {
  const root = document.getElementById("chips");
  root.innerHTML = "";

  const chips = [];
  for (const brand of filters.brands) {
    chips.push(chip(`brand: ${brand}`, { removeField: "brands", removeValue: brand }));
  }
  for (const color of filters.colors) {
    chips.push(chip(`colour: ${color}`, { removeField: "colors", removeValue: color }));
  }
  if (filters.price) {
    chips.push(chip(`price: ${rupees(filters.price.min)}–${rupees(filters.price.max)}`, { removePrice: "1" }));
  }

  for (const c of chips) root.appendChild(c);
  if (chips.length) {
    const clear = el("button", "chip-clear", "clear all");
    clear.type = "button";
    root.appendChild(clear);
  }
}

function chip(text, data) {
  const span = el("span", "chip");
  span.appendChild(el("span", null, text));
  const x = el("button", null, "×");
  x.type = "button";
  Object.assign(x.dataset, data);
  span.appendChild(x);
  return span;
}

// --- Search-mode badge ---

// The badge on the search bar reflects which engine the layer actually ran,
// read off the trace step names rather than any config the frontend holds.
export function renderSearchMode(turn) {
  const badge = document.getElementById("search-mode");
  const names = (turn?.steps ?? []).map((step) => step.name ?? "");
  const semantic = names.some((n) => n.includes("search_semantic"));
  const keyword = names.some((n) => n.includes("search_bm25"));
  const mode = semantic && keyword ? "hybrid" : semantic ? "semantic" : keyword ? "keyword" : null;
  badge.hidden = !mode;
  badge.textContent = mode ?? "";
}

// --- Trace ---

// Steps are grouped under the turn that produced them: one <li> per turn,
// carrying the input the student typed and a pill per pipeline step in the
// order it ran. Latency is the only number the panel shows.

const KNOWN_STATUSES = ["success", "fallback", "error", "skip"];

// The panel is redrawn every time the run reports a change, so rendering
// patches what is there rather than rebuilding it. That is not an
// optimisation: a step the reader has unfolded holds its open state in the
// DOM, and replacing its node mid-query would close it under them. A node is
// left strictly alone while its key is unchanged, and replaced outright the
// moment anything about it moves.

export function renderTrace(turns) {
  const list = document.getElementById("trace");

  if (!turns || !turns.length) {
    list.innerHTML = "";
    list.appendChild(el("li", "empty", "No trace yet."));
    return;
  }
  list.querySelector(".empty")?.remove();

  turns.forEach((turn, index) => {
    const existing = list.children[index];
    if (existing?.dataset.turnId === String(turn.id)) {
      patchTurn(existing, turn);
      return;
    }
    const item = traceTurn(turn);
    if (existing) list.replaceChild(item, existing);
    else list.appendChild(item);
  });
  while (list.children.length > turns.length) list.lastElementChild.remove();

  startClocks();
}

// The turn's shell, filled by the same patch every later render uses — one
// place writes the content, so a turn built live and a turn built settled
// cannot say different things.
function traceTurn(turn) {
  const item = el("li", "trace-turn");
  item.dataset.turnId = String(turn.id);
  const head = el("div", "turn-head");
  head.appendChild(el("span", "turn-input"));
  head.appendChild(el("span", "latency"));
  item.appendChild(head);
  item.appendChild(el("ol", "turn-steps"));
  patchTurn(item, turn);
  return item;
}

function patchTurn(item, turn) {
  const running = turn.status === "running";
  item.className = `trace-turn ${running ? "running" : turn.status === "error" ? "error" : "success"}`;

  const head = item.querySelector(".turn-head");
  head.querySelector(".turn-input").textContent = turn.input || "(no query)";
  setClock(head, running, turn.latency_ms);

  patchSteps(item.querySelector(".turn-steps"), turn.steps ?? []);

  // "No steps" is a fact about a finished turn; a turn that is still working
  // simply has not recorded any yet.
  const steps = turn.steps ?? [];
  toggleNote(item, "turn-empty", !running && !steps.length ? "no steps recorded" : "");
  // The literal error the pipeline raised — shown whether or not it landed
  // inside a step, since a throw between steps has no pill to carry it.
  toggleNote(item, "turn-error", turn.error || "");
}

// A one-line note under a turn: created when it has something to say, removed
// when it does not, so nothing empty is left sitting in the panel.
function toggleNote(item, className, text) {
  const existing = item.querySelector(`.${className}`);
  if (!text) {
    existing?.remove();
    return;
  }
  if (existing) existing.textContent = text;
  else item.appendChild(el("div", className, text));
}

function patchSteps(list, steps) {
  steps.forEach((step, index) => {
    const key = stepKey(step, index);
    const existing = list.children[index];
    if (existing?.dataset.stepKey === key) return;
    const node = stepPill(step);
    node.dataset.stepKey = key;
    if (existing) list.replaceChild(node, existing);
    else list.appendChild(node);
  });
  while (list.children.length > steps.length) list.lastElementChild.remove();
}

// What makes a pill the same pill: its place, what ran, and where it got to.
// A settled step never changes again, so its node — and anything the reader
// has opened inside it — survives every later render of the turn.
function stepKey(step, index) {
  return [index, step.name, step.status, step.latency_ms].join("|");
}

function stepPill(step) {
  const item = el("li", "step-item");

  if (step.status === "running") {
    // A running step is not a control: it has no detail to open yet, so it is
    // not a button and nothing about it invites a click.
    const pill = el("span", "step-pill is-running");
    pill.appendChild(el("span", "step-dot"));
    pill.appendChild(el("span", "step-label", step.label || step.name || "step"));
    pill.appendChild(el("span", "latency"));
    setClock(pill, true, null);
    item.appendChild(pill);
    return item;
  }

  const status = KNOWN_STATUSES.includes(step.status) ? step.status : "success";
  const pill = el("button", `step-pill ${status}`);
  pill.type = "button";
  pill.setAttribute("aria-expanded", "false");
  pill.appendChild(el("span", "step-label", step.label || step.name || "step"));
  // Success is carried by the pill's colour alone; anything else says so.
  if (status !== "success") pill.appendChild(el("span", "step-status", status));
  pill.appendChild(el("span", "latency", `${step.latency_ms ?? 0} ms`));
  item.appendChild(pill);
  item.appendChild(stepDetail(step));
  return item;
}

// --- The running clock ---

// While a step runs, its latency is the browser's own count from the moment
// the panel first saw it — the wait is the thing worth showing, and a blank
// where the number goes would hide it. The server's measurement replaces it
// the instant the step settles, and that is the number the panel keeps.

let clockTimer = null;

function setClock(node, running, latency) {
  const readout = node.querySelector(":scope > .latency");
  if (running) {
    if (!node.dataset.started) node.dataset.started = String(performance.now());
    return;
  }
  delete node.dataset.started;
  readout.textContent = `${latency ?? 0} ms`;
}

function startClocks() {
  tickClocks();
  if (clockTimer === null) clockTimer = setInterval(tickClocks, 100);
}

function tickClocks() {
  const running = document.querySelectorAll("#trace [data-started]");
  if (!running.length && clockTimer !== null) {
    clearInterval(clockTimer);
    clockTimer = null;
    return;
  }
  const now = performance.now();
  for (const node of running) {
    const readout = node.querySelector(":scope > .latency");
    if (readout) readout.textContent = `${Math.round(now - Number(node.dataset.started))} ms`;
  }
}

// --- Step detail ---

// One shell for every step kind: a body rendered by what the step is, the
// values it carries as a name-value list, and a raw tab holding the step
// exactly as it came over the wire. A step whose shape we don't recognise
// falls back to formatted JSON rather than showing nothing.

const STEP_BODIES = {
  search_bm25: bm25Body,
  search_semantic: semanticBody,
  llmfn: llmBody,
};

function stepDetail(step) {
  const detail = el("div", "step-detail");
  detail.hidden = true;

  const tabs = el("div", "step-tabs");
  tabs.appendChild(tab("formatted", true));
  tabs.appendChild(tab("raw", false));
  detail.appendChild(tabs);

  const formatted = el("div", "step-pane");
  formatted.dataset.pane = "formatted";
  const built = (STEP_BODIES[step.name] ?? fallbackBody)(step);
  formatted.appendChild(built.node);
  const attributes = attributeList(step, built.consumed);
  if (attributes) formatted.appendChild(attributes);
  detail.appendChild(formatted);

  const raw = el("div", "step-pane");
  raw.dataset.pane = "raw";
  raw.hidden = true;
  // Scrolled like every other long block: an llm step's raw payload carries the
  // provider's whole response object, which would otherwise run for thousands
  // of pixels and bury the steps under it.
  raw.appendChild(scroller(jsonPre(step)));
  detail.appendChild(raw);

  return detail;
}

function tab(name, active) {
  const button = el("button", `step-tab${active ? " is-active" : ""}`, name);
  button.type = "button";
  button.dataset.pane = name;
  button.setAttribute("aria-selected", active ? "true" : "false");
  return button;
}

function block(label, node) {
  const wrap = el("div", "detail-block");
  wrap.appendChild(el("div", "io-label", label));
  wrap.appendChild(node);
  return wrap;
}

// Everything the body did not already show, as long as it is a single value:
// nested structures would only repeat the body or the raw tab.
function attributeList(step, consumed) {
  const list = el("dl", "attr-list");
  for (const source of [step.input ?? {}, step.output ?? {}]) {
    for (const [key, value] of Object.entries(source)) {
      if (consumed.includes(key)) continue;
      if (value === null || typeof value === "object") continue;
      list.appendChild(el("dt", null, key.replace(/_/g, " ")));
      list.appendChild(el("dd", null, String(value)));
    }
  }
  return list.children.length ? list : null;
}

// One colour per matching token, shared by its row and its share of every
// ranked bar, so a token can be followed from "how often it hit" to "how much
// of the score it carried".
const TOKEN_COLORS = [
  "var(--trace-step-bar)",
  "var(--trace-num)",
  "var(--trace-str)",
  "var(--trace-bool)",
  "var(--trace-key)",
];

// Keyword search in two bands, because the step runs on two mechanisms and
// mixing them is what makes the numbers unreadable. The token band is the
// catalogue: how many phones hold each word and the weight its rarity earns,
// both identical for every result, ending in the AND that decides which phones
// qualify at all. The ranked band is the documents: what differs between the
// survivors, and so what put them in this order.
function bm25Body(step) {
  const tokens = step.output?.tokens;
  if (!Array.isArray(tokens) || !tokens.length) return fallbackBody(step);

  const size = step.output?.catalogue_size;
  const colors = new Map();
  for (const facts of tokens) {
    if (facts?.matches) colors.set(facts.token, TOKEN_COLORS[colors.size % TOKEN_COLORS.length]);
  }

  const node = el("div", "detail-body");
  node.appendChild(block("query as sent", el("div", "detail-text", step.input?.query ?? "")));

  const rows = el("ul", "token-matches");
  const head = el("li", "token-row is-head");
  head.appendChild(el("span", "token", "token"));
  head.appendChild(el("span", "token-count", "in catalogue"));
  head.appendChild(el("span", "token-weight", "weight"));
  rows.appendChild(head);

  for (const facts of tokens) {
    const matches = facts?.matches ?? 0;
    const row = el("li", `token-row${matches ? "" : " is-miss"}`);
    const name = el("span", "token");
    if (matches) {
      const swatch = el("span", "token-swatch");
      swatch.style.background = colors.get(facts.token);
      name.appendChild(swatch);
    }
    name.appendChild(el("span", null, facts.token));
    row.appendChild(name);
    const held = size ? `${matches} of ${size} phones` : `${matches} phones`;
    row.appendChild(el("span", "token-count", matches ? held : "no matches"));
    // A token in no document still has an idf -- a large one, since the formula
    // rewards rarity -- and showing it would read as "this word counts for a
    // lot" about a word that counts for nothing at all.
    const weight = matches ? (Number(facts?.weight) || 0).toFixed(2) : "—";
    row.appendChild(el("span", "token-weight", weight));
    rows.appendChild(row);
  }

  // The line the counts above do not add up to on their own: a phone qualifies
  // only by holding every word, so this is never merely the smallest count.
  const results = step.output?.results ?? 0;
  const every = el("li", `token-row is-total${results ? "" : " is-miss"}`);
  every.appendChild(el("span", "token", tokens.length === 1 ? "holding that token" : "holding every token"));
  every.appendChild(el("span", "token-count", `${results} phones`));
  rows.appendChild(every);
  node.appendChild(block("tokens", rows));

  const ranked = step.output?.top_scores;
  if (Array.isArray(ranked) && ranked.length) {
    node.appendChild(block("what that ranked", rankedChart(ranked, colors)));
    node.appendChild(
      el(
        "div",
        "cand-legend",
        "bar = each token's share of the score · rare words weigh more, repeats saturate, long records dilute"
      )
    );
  }
  return { node, consumed: ["query", "tokens", "catalogue_size", "results", "top_scores"] };
}

// One row per surviving phone: its total, a bar split into a segment per token
// carrying that token's contribution, and under it the three things that
// actually differ between rows -- how often each word repeats, and how long the
// record is.
function rankedChart(ranked, colors) {
  const axis = Math.max(...ranked.map((row) => Number(row.score) || 0)) * 1.05 || 1;
  const chart = el("ol", "rank-chart");
  for (const entry of ranked) {
    const row = el("li", "rank-row");
    row.appendChild(el("span", "rank-name", entry.name ?? entry.id ?? ""));
    row.appendChild(el("span", "rank-score", (Number(entry.score) || 0).toFixed(2)));

    const track = el("span", "rank-track");
    const parts = [];
    for (const facts of entry.tokens ?? []) {
      const segment = el("span", "rank-bar");
      segment.style.width = `${((Number(facts?.score) || 0) / axis) * 100}%`;
      segment.style.background = colors.get(facts.token) ?? "var(--trace-step-bar)";
      segment.title = `${facts.token}: ${facts.score}`;
      track.appendChild(segment);
      parts.push(`${facts.token} ×${facts?.count ?? 0}`);
    }
    row.appendChild(track);
    parts.push(`${entry.length ?? 0} words`);
    row.appendChild(el("span", "rank-meta", parts.join(" · ")));
    chart.appendChild(row);
  }
  return chart;
}

// Semantic search: the cosine ranking as a bar chart. The bars run against the
// full 0..1 cosine scale rather than the top candidate, so a best match of
// 0.36 reads as the weak match it is instead of filling the track the way 0.75
// would. The dashed line is the minimum score the engine kept, so the
// candidates dimmed below it are the ones this step dropped -- present,
// because seeing what just missed is the point of showing the ranking at all.
const COSINE_TICKS = [0, 0.25, 0.5, 0.75, 1];

function semanticBody(step) {
  const candidates = step.output?.shown_scores;
  if (!Array.isArray(candidates) || !candidates.length) return fallbackBody(step);

  const minScore = Number(step.input?.min_score ?? 0);

  const node = el("div", "detail-body");
  node.appendChild(block("query as sent", el("div", "detail-text", step.input?.query ?? "")));

  const chart = el("ol", "cand-chart");
  for (const candidate of candidates) {
    const score = Number(candidate.cosine) || 0;
    const row = el("li", `cand-row${score < minScore ? " is-below" : ""}`);
    row.appendChild(el("span", "cand-name", candidate.name ?? candidate.id ?? ""));
    const track = el("span", "cand-track");
    if (minScore > 0) track.style.setProperty("--cutoff", `${minScore * 100}%`);
    const bar = el("span", "cand-bar");
    // Negative cosines exist in principle; the scale starts at 0, so clamp.
    bar.style.width = `${Math.max(0, Math.min(1, score)) * 100}%`;
    track.appendChild(bar);
    row.appendChild(track);
    row.appendChild(el("span", "cand-score", score.toFixed(3)));
    chart.appendChild(row);
  }
  chart.appendChild(cosineAxis());
  node.appendChild(block("cosine ranking", chart));
  if (minScore > 0) {
    node.appendChild(el("div", "cand-legend", `bars run 0 to 1 on the cosine scale · dashed line: min score ${minScore} — dimmed candidates were dropped`));
  }
  return { node, consumed: ["query", "shown_scores"] };
}

// The ruler under the chart: without it a 0..1 scale is just short bars, and
// the reader has no way to see where a score sits between "unrelated" and
// "identical".
function cosineAxis() {
  const row = el("li", "cand-row cand-axis");
  row.appendChild(el("span"));
  const track = el("span", "cand-scale");
  for (const tick of COSINE_TICKS) {
    const mark = el("span", "cand-tick", String(tick));
    mark.style.left = `${tick * 100}%`;
    track.appendChild(mark);
  }
  row.appendChild(track);
  row.appendChild(el("span"));
  return row;
}

// An LLM call by role, never as one JSON blob: what the model was told, what
// it was given, what it said. Every string here is read straight out of the
// request the provider received, and rendered as text -- a prompt's newlines
// are newlines, and a prompt carrying JSON shows that JSON indented rather
// than as one escaped line.
function llmBody(step) {
  const request = step.input?.request;
  if (!request) return fallbackBody(step);

  const node = el("div", "detail-body");
  if (request.instructions) {
    node.appendChild(block("system", scroller(el("div", "detail-text", request.instructions))));
  }
  node.appendChild(block("input", scroller(llmInput(request.input))));

  // The shape the model was required to answer in, which is not the shape it
  // answered with: optional fields, and the descriptions the layer wrote to
  // steer each one, are only visible here.
  if (request.text_format) {
    node.appendChild(block("schema asked for", scroller(jsonPre(request.text_format))));
  }

  // Structured output: the object the schema produced, which is what the
  // layer's own code goes on to use. Plain text otherwise.
  const parsed = step.output?.parsed;
  let response;
  if (parsed) {
    response = jsonPre(parsed);
    response.className = "wrapped";
  } else {
    response = el("div", "detail-text", step.output?.text ?? "");
  }
  node.appendChild(block("response", scroller(response)));

  return { node, consumed: ["request", "text", "parsed", "response"] };
}

// The input as the model received it: one literal string, or the message list
// a chat turn sends. The list is shown whole -- windowing it here would hide
// the growth that is the whole point of looking.
function llmInput(input) {
  if (!Array.isArray(input)) return el("div", "detail-text", String(input ?? ""));

  const list = el("ol", "msg-list");
  for (const message of input) {
    const row = el("li", "msg-row");
    row.appendChild(el("span", "msg-role", message?.role ?? "message"));
    row.appendChild(el("div", "detail-text", contentText(message?.content)));
    list.appendChild(row);
  }
  return list;
}

// A message's content is a string on the way in, but comes back from the
// provider as typed parts; both have to read as the text they are.
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? "").join("");
  return JSON.stringify(content ?? "", null, 2);
}

// Long content scrolls inside its own block rather than being cut short: a
// system prompt must be readable in full at either width, and it cannot be
// allowed to bury every step under it in the rail.
function scroller(node) {
  const wrap = el("div", "detail-scroll");
  wrap.appendChild(node);
  return wrap;
}

// Any step we have no view for yet: its input and output as formatted JSON,
// so a new step kind joins the panel readable rather than blank. The JSON
// already shows every value, so nothing is left for the attribute list.
function fallbackBody(step) {
  const node = el("div", "detail-body");
  node.appendChild(block("input", jsonPre(step.input ?? {})));
  node.appendChild(block("output", jsonPre(step.output ?? {})));
  const consumed = [...Object.keys(step.input ?? {}), ...Object.keys(step.output ?? {})];
  return { node, consumed };
}

// A <pre> of pretty-printed JSON with syntax-coloured spans (.tok-*). Built
// from text nodes, never innerHTML, so values cannot inject markup.
const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

function jsonPre(value) {
  const json = JSON.stringify(value, null, 2);
  const pre = el("pre");
  let last = 0;
  for (const m of json.matchAll(JSON_TOKEN)) {
    if (m.index > last) pre.append(json.slice(last, m.index));
    if (m[1] !== undefined) {
      // A string is a key when followed by a colon; the colon stays plain.
      pre.append(el("span", m[2] ? "tok-key" : "tok-str", m[1]));
      if (m[2]) pre.append(m[2]);
    } else if (m[0] === "true" || m[0] === "false") {
      pre.append(el("span", "tok-bool", m[0]));
    } else if (m[0] === "null") {
      pre.append(el("span", "tok-null", m[0]));
    } else {
      pre.append(el("span", "tok-num", m[0]));
    }
    last = m.index + m[0].length;
  }
  pre.append(json.slice(last));
  return pre;
}
