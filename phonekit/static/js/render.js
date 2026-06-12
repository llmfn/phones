// DOM rendering: results grid, filter facets, active-filter chips, and the trace.
// The shell (search box, empty zone containers) is server-rendered in
// index.html; everything data-driven lives here.

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

// --- App state (zero vs search) ---

export function setAppState(name) {
  document.getElementById("app").dataset.state = name;
}

// --- Results ---

export function renderSummary(summary) {
  const div = document.getElementById("summary");
  if (summary) {
    div.textContent = summary;
    div.style.display = "";
  } else {
    div.textContent = "";
    div.style.display = "none";
  }
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
      const img = el("img", "product-image");
      img.src = p.image;
      img.alt = p.color_name ? `${p.name ?? "Phone"} in ${p.color_name}` : p.name ?? "";
      card.appendChild(img);
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
