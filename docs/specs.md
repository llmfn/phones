## Design Spec: `phones.llmfn.com`

## Overview 
A static SvelteKit app deployed on Cloudflare Pages. No server-side logic. All LLM calls go to a user-configured local backend URL.


## Tech Stack 
- **Framework:** SvelteKit + `@sveltejs/adapter-static` 
- **Styling:** Tailwind CSS 
- **State:** Svelte stores + localStorage persistence 
- **No:** SSR, API routes, Workers, server hooks


## Layout — Three Zones

``` 
┌─────────────┬──────────────────────┬─────────────────────┐ 
│ Sidebar     │ App Canvas           │ Trace Panel         │ 
│ (Layers)    │ (Chat UI)            │ (X-Ray Debugger)    │  
│ 280px       │ flex-1               │  360px              │ 
└─────────────┴──────────────────────┴─────────────────────┘ 
```


## Zone 1 — Sidebar

- App title: `phones.llmfn.com` 
- 8 toggle switches, each with: 
  - Layer number + name 
  - A subtle "Phase A / Phase B" pill toggle per layer -
  - Disabled state if a dependency layer is off (e.g. Layer 3 requires Layer 2) 
- Bottom section: **Settings panel** 
  - API Base URL input field (placeholder: `http://localhost:8000`) 
  - Persisted to localStorage under key `llmfn_api_url` 
  - A small status indicator: `● Connected` / `○ Unreachable` (fires a `/health` ping on input change) 
  - "Reset to defaults" button

---

## Zone 2 — App Canvas

- Chat interface: message bubbles (user right, assistant left) 
- Input bar pinned to bottom with Send button 
- Shows product cards when recommendations are returned (image, name, price, match score) 
- Error states rendered inline as a styled error bubble (not a toast) 
- "Simulate API Failure" button in the top-right corner of this zone 
- sends a `?simulate_failure=true` flag with the next request

---

## Zone 3 — Trace Panel

- Updates after every query 
- Rendered as a vertical timeline of named steps: 
- Each step row: layer badge + layer name + latency ms 
- Expandable: shows raw input JSON → raw output JSON 
- Steps from disabled layers are rendered as grey/skipped rows (not hidden) 
- Color coding: 
  - Green: success 
  - Yellow: fallback triggered 
  - Red: error 
  - Grey: layer skipped 
- "Copy trace as JSON" button at the top

---

## API Contract

Every query sends one POST to `{apiBaseUrl}/api/recommend`:

```json 
{ 
 "query": "string", 
 "active_layers": [1, 2, 4], 
 "phase": { "3": "B", "5": "A" }, 
 "simulate_failure": false, 
 "session_id": "uuid" 
} 
```

Expected response:

```json 
{ 
 "answer": "string",
 "products": [], 
 "trace": [ { 
     "layer": 2, "name": 
     "Prompt", "input": {}, 
     "output": {}, "status": 
     "success", "latency_ms": 120 
    } ] 
} 
```

The UI renders whatever trace array comes back — the backend owns trace logic entirely.

---

## State & Persistence (localStorage)

| Key | Value | 
|---|---| 
| `llmfn_api_url` | backend URL string | 
| `llmfn_layer_state` | `{1: true, 2: true, ...}` |
| `llmfn_phase_state` | `{1: "A", 2: "B", ...}` | 
| `llmfn_chat_history` | array of message objects |

---

## Layer Dependency Rules

Enforced in the sidebar toggle logic:

- Layer 2 requires Layer 1 
- Layer 3 requires Layer 2 
- Layer 4 requires Layer 3 
- Layers 5–8 require Layers 1–4 all on 
- Disabling a parent auto-disables dependents with a visual cascade

---

## Routing

Single route only: `/`

No other pages. No auth. No navigation.

---

## Constraints

- No SvelteKit server routes (`+server.ts`) 
- No `hooks.server.ts` 
- `adapter-static` only 
- All fetch calls are client-side to the user-supplied URL 
- CORS note must appear in the UI near the API URL field: *"Ensure your backend sets `Access-Control-Allow-Origin: *`"*