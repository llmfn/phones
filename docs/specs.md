# Design Spec: `phones.llmfn.com`

## Overview

A single Python web app that serves the UI and owns the backend API. The app is
a **product-search interface, not a chatbot**: one search box, a results grid of
phones, and a filter rail, with a trace panel that exposes what ran underneath.

The eight course layers (search, prompt, schema, context, state, memory, tools,
evals) each change this same surface. **Which layer is active is owned by the
backend** — there is no layer selector in the UI. The frontend sends a query and
renders whatever products, facets, and trace come back.

The visual design (zero state, search state, filter-selected state) lives in
`docs/mockups.md`. This spec owns behavior and the `POST /api/recommend`
contract.


## Tech Stack

- **Backend:** Python (Flask), a single app serving both the UI and the API.
- **Frontend:** server-rendered `index.html` plus plain CSS and browser-native
  JavaScript modules served by the Python app.
- **Styling:** `app/static/css/styles.css`
- **State:** plain JavaScript state object plus localStorage for session/UI state.
- **Frontend module layout:**
  - `app/static/js/app.js` — app bootstrap and top-level orchestration
  - `app/static/js/api.js` — `fetch` wrappers for backend endpoints
  - `app/static/js/state.js` — in-memory state, persistence helpers
  - `app/static/js/render.js` — DOM rendering for results, filters, and trace
  - `app/static/js/events.js` — event binding and user interaction handlers
- **No:** SvelteKit, frontend build step, separate frontend deployment, or
  client-configured backend URL. All API calls are same-origin.


## Layout — two states, three zones

The UI has two states and the search box is the anchor that persists across both
(see `docs/mockups.md` for the ASCII layouts):

- **Zero state:** a bare, centered search box. No catalogue, filters, or trace.
- **Search state:** the box slides up into a slim top bar at the **same width**,
  and three zones resolve around the results:

```
┌────────────────────────────────────────────────────────────┐
│                       [ search box ]                       │
├──────────────┬───────────────────────────┬─────────────────┤
│ Filters      │ Results grid              │ Trace           │
│ (fixed rail) │ (flexes, capped ~1200px)  │ (fixed rail)    │
└──────────────┴───────────────────────────┴─────────────────┘
```

The shell is fixed-width (~1200px) and centered. The two side rails are fixed;
only the results column flexes.


## Zone — Search box (top bar)

- A single search box, constant width in both states; only its position changes.
- Placeholder carries the app's identity (e.g. "Find a phone — describe what you
  need"). Placeholder wording may vary by active layer; the empty page is
  otherwise identical across layers.
- **Active filter chips** render directly below the search box once any filter is
  applied: `[brand: Apple x]  [clear all]`. Each chip's `x` removes that one
  filter; `clear all` removes them all. Removing a filter re-queries.


## Zone — Filters (left rail)

- **Brand:** checkboxes with facet counts in parentheses, e.g. `Apple (1)`.
  Counts come from the API response and reflect the **current result set**.
- **Price:** a dual-thumb range slider selecting a `{min, max}` window. Its
  bounds come from the API's `price` facet, rounded outward to the nearest ₹500
  so every step lands on a clean value (step ₹500). The bounds are taken from
  the first unfiltered response and held stable, so the track does not shrink as
  filtering narrows the facet. Leaving both thumbs at the full range applies no
  price filter.
- **Reset** clears all filters.
- Applying or changing any filter **re-queries the backend** (see contract):
  filters are sent in the request; the response returns a narrowed result set and
  recomputed facets. Active filters are also mirrored as chips under the search
  box.


## Zone — Results grid (center)

- A grid of phone cards. Each card shows **image, brand, name, and price**.
- A result count header (e.g. `6 results`).
- No match score is shown on cards.
- Empty results render an inline empty state (e.g. keyword search returning
  nothing for a vibe query at Layer 1).


## Zone — Trace (right rail)

- Header is just a `TRACE` label and a "copy as JSON" button. **No layer
  selector** — the active layer is read from the trace rows, not chosen here.
- A vertical timeline of named steps, one row per layer.
- Each step row: layer badge + layer name + latency ms + status.
- Expandable: shows raw input JSON → raw output JSON.
- Layers above the active layer render as grey/skipped rows, not hidden.
- Color coding:
  - Green: success
  - Yellow: fallback triggered
  - Red: error
  - Grey: layer skipped
- The UI renders whatever trace array comes back — the backend owns trace logic
  entirely.


## API Contract

Every query (initial search or re-filter) sends one POST to `/api/recommend`.

**Identity is carried in a header, not the body.** The frontend generates a UUID
once per browser, persists it, and sends it on every request as a dummy bearer
token:

```
Authorization: Bearer <uuid>
Content-Type: application/json
```

This stands in for real auth: there is no verification, but the backend reads the
UUID to identify the user so the state/memory layers can attribute history to
them. Keeping it in a header (rather than the payload) keeps it seamless and out
of the per-query body.

Request body:

```json
{
  "query": "good phone for my mom",
  "filters": {
    "brands": ["Apple"],
    "price": { "min": 10000, "max": 90000 }
  }
}
```

- `query` — the user's search text.
- `filters` — optional; omitted or empty on the first search. `brands` is a list
  of selected brand values; `price` is the selected `{min, max}` range.

The backend decides which layer is active (via its own config); the frontend
does not send a layer.

Expected response:

```json
{
  "products": [
    {
      "id": "samsung-a54",
      "name": "Galaxy A54",
      "brand": "Samsung",
      "price": 38999,
      "image": "https://.../a54.jpg"
    }
  ],
  "facets": [
    {
      "type": "categorical",
      "field": "brand",
      "values": [
        { "value": "Samsung", "count": 2 },
        { "value": "Apple",   "count": 1 }
      ]
    },
    { "type": "range", "field": "price", "min": 13499, "max": 52999 }
  ],
  "trace": [
    {
      "layer": 2,
      "name": "Prompt",
      "input": {},
      "output": {},
      "status": "success",
      "latency_ms": 120
    },
    {
      "layer": 3,
      "name": "Schema",
      "input": {},
      "output": {},
      "status": "skip",
      "latency_ms": 0
    }
  ]
}
```

- `products` — the ranked result set. Each product carries `id`, `name`, `brand`,
  `price`, and `image`. No score field.
- `facets` — a list of facet objects, discriminated by `type`, so new facets are
  added by appending data rather than changing the shape. A `categorical` facet
  (e.g. `brand`) carries a `field` and a list of `{value, count}` scoped to the
  current result set; a `range` facet (e.g. `price`) carries a `field` and
  `{min, max}` bounds. Facets are authoritative from the backend.
- `trace` — array of step objects; backend-owned. `status` is one of `success`,
  `fallback`, `error`, `skip`.

There is no `answer` field. If a later layer needs a natural-language summary, it
is added deliberately.


## State & Persistence (localStorage)

| Key | Value |
|---|---|
| `llmfn_user_id` | stable uuid, generated once, sent as the `Authorization: Bearer` header on every request |
| `llmfn_last_query` | the last submitted query (to restore the search state) |
| `llmfn_last_filters` | the last applied `filters` object |

There is no chat history — the app is not a chatbot.


## Routing

- `GET /` — the single page (zero state on load; resolves to search state after
  the first query).
- `POST /api/recommend` — the contract above.

No other pages. No auth. No navigation.


## Constraints

- Minimal chrome: no app title or URL in the UI; the placeholder carries identity.
- Fixed-width, centered shell (~1200px); side rails fixed, results column flexes.
- The search box is constant width across both states — it moves, not resizes.
- No SvelteKit or frontend framework build requirement; no separate frontend
  deployment.
- Keep JavaScript modular; avoid a single large unstructured `app.js`.
- All frontend API calls are same-origin; the Python app serves both UI and API,
  so CORS is not part of the primary local path.
