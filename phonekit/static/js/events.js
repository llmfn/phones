// Event binding and the query orchestration. Every search and every filter
// change re-queries the backend (see docs/specs.md); the response drives the
// results grid, facets, chips, and trace.

import { recommend } from "./api.js";
import {
  state,
  hasFilters,
  niceBounds,
  setQuery,
  toggleFacetValue,
  removeFacetValue,
  setPrice,
  clearPrice,
  clearFilters,
  buildPayload,
} from "./state.js";
import {
  setAppState,
  renderResults,
  renderSummary,
  renderFilters,
  renderChips,
  renderTrace,
  renderSearchMode,
  updatePriceUI,
} from "./render.js";

export async function runQuery() {
  setAppState("search");
  const payload = buildPayload();

  let data;
  try {
    data = await recommend(payload);
  } catch (err) {
    renderResults([]);
    renderSummary(null);
    document.getElementById("results-head").textContent = err.message;
    renderTrace([]);
    return;
  }

  // Capture the stable full price bounds the first time we see an unfiltered
  // result, so the slider track does not collapse as filters narrow it.
  if (!hasFilters()) {
    const price = (data.facets ?? []).find((f) => f.type === "range");
    if (price) state.priceBounds = niceBounds({ min: price.min, max: price.max });
  }

  renderResults(data.products ?? []);
  renderSummary(data.summary);
  renderFilters(data.facets ?? [], state.filters, state.priceBounds);
  renderChips(state.filters);
  state.lastTrace = data.trace ?? [];
  renderTrace(state.lastTrace);
  renderSearchMode(state.lastTrace);
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

export function bindEvents() {
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("query").value.trim();
    if (!value) return;
    setQuery(value);
    // A brand-new search starts from a clean filter set.
    clearFilters();
    state.priceBounds = null;
    runQuery();
  });

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
    const json = JSON.stringify(state.lastTrace, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      window.prompt("Copy trace JSON:", json);
    }
  });
}
