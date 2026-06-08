## Design Spec: `phones.llmfn.com`

## Overview
A single Python web app that serves the UI and owns the backend API. The frontend is plain HTML, CSS, and browser-native JavaScript modules served by the Python app. No separate Svelte frontend, build step, or user-configured backend URL is required.


## Tech Stack
- **Backend:** Python web app
- **Frontend:** Server-rendered/static `index.html` plus plain CSS and browser-native JavaScript modules
- **Styling:** `static/css/styles.css`
- **State:** Plain JavaScript state object plus localStorage persistence for chat/session UI state
- **Suggested frontend module layout:**
  - `static/js/app.js` — app bootstrap and top-level orchestration
  - `static/js/api.js` — `fetch` wrappers for backend endpoints
  - `static/js/state.js` — in-memory state, persistence helpers, derived layer state
  - `static/js/render.js` — DOM rendering for chat, products, trace, and controls
  - `static/js/events.js` — event binding and user interaction handlers
- **No:** SvelteKit, frontend build step, separate frontend deployment, client-configured backend URL


## Layout — Two Panels

```
┌──────────────────────┬─────────────────────┐
│ App Canvas           │ Control + Trace     │
│ (Chat UI)            │ (Layer + Debugger)  │
│ flex-1               │ 360px               │
└──────────────────────┴─────────────────────┘
```


## Panel 1 — App Canvas

- Chat interface: message bubbles (user right, assistant left)
- Input bar pinned to bottom with Send button
- Shows product cards when recommendations are returned (image, name, price, match score)
- Error states rendered inline as a styled error bubble (not a toast)
- "Simulate API Failure" button in the top-right corner of this panel
- Sends a `simulate_failure=true` value with the next request

---

## Panel 2 — Control + Trace

Top controls:

- App title: `phones.llmfn.com`
- Current layer dropdown with layers 1–8
- Selecting Layer N automatically enables layers 1 through N
- Layers after the selected layer are disabled/skipped
- Optional phase control for the selected/current layer if the backend supports phase variants
- "Reset to defaults" button

Trace display:

- Updates after every query
- Rendered as a vertical timeline of named steps
- Each step row: layer badge + layer name + latency ms
- Expandable: shows raw input JSON -> raw output JSON
- Steps from disabled layers are rendered as grey/skipped rows, not hidden
- Color coding:
  - Green: success
  - Yellow: fallback triggered
  - Red: error
  - Grey: layer skipped
- "Copy trace as JSON" button at the top

---

## API Contract

Every query sends one POST to `/api/recommend`:

```json
{
  "query": "string",
  "current_layer": 4,
  "active_layers": [1, 2, 3, 4],
  "phase": { "4": "A" },
  "simulate_failure": false,
  "session_id": "uuid"
}
```

`active_layers` is derived from `current_layer`, so selecting Layer 4 means layers 1, 2, 3, and 4 are active. The frontend uses same-origin API calls because the Python app serves both the UI and backend routes.

Expected response:

```json
{
  "answer": "string",
  "products": [],
  "trace": [
    {
      "layer": 2,
      "name": "Prompt",
      "input": {},
      "output": {},
      "status": "success",
      "latency_ms": 120
    }
  ]
}
```

The UI renders whatever trace array comes back — the backend owns trace logic entirely.

---

## State & Persistence (localStorage)

| Key | Value |
|---|---|
| `llmfn_current_layer` | selected layer number |
| `llmfn_phase_state` | `{1: "A", 2: "B", ...}` if phase variants are enabled |
| `llmfn_chat_history` | array of message objects |

---

## Layer Dependency Rules

Enforced by the current-layer dropdown:

- Layer 1 means only Layer 1 is active
- Layer 2 means Layers 1–2 are active
- Layer 3 means Layers 1–3 are active
- This continues through Layer 8
- Previous layers are always enabled automatically
- Later layers are skipped and shown as grey/skipped rows in the trace when present

---

## Routing

Single route only: `/`

No other pages. No auth. No navigation.

---

## Constraints

- No SvelteKit or frontend framework build requirement
- No separate frontend deployment
- Keep JavaScript modular; avoid a single large unstructured `app.js`
- All frontend API calls use same-origin backend routes
- CORS configuration is not part of the primary local app path because the Python app serves both UI and API
