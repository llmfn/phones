# phones

Phone recommender app for the [llmfn](https://llmfn.com/) course — its own repo.
One product recommender, built layer by layer (search → prompts → schema →
context → state → memory → tool use → evals). In edition 2 students build the
app from the ground up: each layer is written from scratch in `app.py`, against
the building blocks in `phonekit`.

## Edition 3

The next version of the app lives in `web/` — a Cloudflare Worker, deployed to
`phones.llmfn.com`, where each student gets their own instance on a subdomain.
It becomes the main app for this repo. Everything below describes edition 2,
including the note that there is no separate `web/` deployment.

## Layout

- `app.py` — the app being built. Starts as a skeleton: a `search(q, filters)`
  that returns no products, handed to `Application`. This is the file students
  grow layer by layer.
- `phonekit/` — the building blocks `app.py` composes: catalogue loading,
  search engines (`search_bm25`, `search_semantic`), the LLM helper (`llmfn`),
  filters and facets, sessions, memory, the trace, and `Application` — Flask
  server and CLI runner in one, serving `/` and `POST /api/recommend`.
  Templates, CSS, and the browser-native JS modules (`app.js`, `api.js`,
  `state.js`, `render.js`, `events.js`) live under `phonekit/templates/` and
  `phonekit/static/`.
- `solutions/layer1/` … `solutions/layer7/` — one reference `app.py` per layer
  plus its prompt files, from edition 1. Read-only reference for what each
  layer arrives at; nothing imports them.
- `data/phones/` — the catalogue, one JSON document per phone, loaded into
  memory at startup.
- `docs/specs.md` — the product design spec, and the **source of truth for the
  `POST /api/recommend` contract**.
- `docs/mockups.md` — low-fidelity ASCII layouts (the visual surface only).
- `docs/teaching.md` — the eight layers and the story each one tells.

phonekit is a library, not a framework: `app.py` owns its pipeline
top-to-bottom, and phonekit holds no prompts and no layer-specific logic.
There is no separate `web/` or `api/` deployment — one Python app serves the UI
and the API same-origin.

### Docs boundary

- `docs/specs.md` = *what* the system should do (design spec + API contract).
- `docs/mockups.md` = the *visual* surface only (ASCII layouts of each UI state);
  it references the contract in `docs/specs.md` rather than redefining it.

## Features

Development is tracked in `.features/` — one markdown file per feature, holding its
plan, its tasks, and its status together. Read `.features/README.md` for the
conventions and keep the files current as you work.

`.features/archive/` is frozen history, not live work — never pick anything up from it.

Never refer to feature files, feature names, or task names in the code or docstrings.