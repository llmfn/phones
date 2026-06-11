// DOM rendering: results grid, filter facets, active-filter chips, and the trace.
// The shell (search box, empty zone containers) is server-rendered in
// index.html; everything data-driven lives here.

import { niceBounds } from "./state.js";

const inr = new Intl.NumberFormat("en-IN");
const rupees = (n) => "₹" + inr.format(n);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- App state (zero vs search) ---

export function setAppState(name) {
  document.getElementById("app").dataset.state = name;
}

// --- Results ---

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
    if (p.image) {
      const img = el("img");
      img.src = p.image;
      img.alt = p.name ?? "";
      card.appendChild(img);
    }
    if (p.brand) card.appendChild(el("div", "brand", p.brand));
    card.appendChild(el("div", "name", p.name ?? ""));
    card.appendChild(el("div", "price", rupees(p.price ?? 0)));
    // The card shows one representative variant; hint at the other colour
    // families. No variant switcher here — colours are explored via the
    // colour filter (see docs/specs.md).
    if (p.colors > 1) {
      const n = p.colors - 1;
      card.appendChild(el("div", "colors", `+${n} colour${n === 1 ? "" : "s"}`));
    }
    grid.appendChild(card);
  }
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

// --- Trace ---

const KNOWN_STATUSES = ["success", "fallback", "error", "skip"];

export function renderTrace(trace) {
  const list = document.getElementById("trace");
  list.innerHTML = "";

  if (!trace || !trace.length) {
    list.appendChild(el("li", "empty", "No trace yet."));
    return;
  }

  for (const step of trace) {
    const status = KNOWN_STATUSES.includes(step.status) ? step.status : "success";
    const row = el("details", `trace-row ${status}`);
    const summary = el("summary");
    summary.appendChild(el("span", "layer-badge", String(step.layer)));
    summary.appendChild(el("span", "layer-name", step.name ?? `Layer ${step.layer}`));
    const latency = status === "skip" ? "skip" : `${step.latency_ms ?? 0} ms`;
    summary.appendChild(el("span", "latency", latency));
    row.appendChild(summary);

    const detail = el("div", "trace-detail");
    detail.appendChild(el("div", "io-label", "input"));
    detail.appendChild(el("pre", null, JSON.stringify(step.input ?? {}, null, 2)));
    detail.appendChild(el("div", "io-label", "output"));
    detail.appendChild(el("pre", null, JSON.stringify(step.output ?? {}, null, 2)));
    row.appendChild(detail);
    list.appendChild(row);
  }
}
