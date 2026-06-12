# phones

The phone recommender app built layer by layer in the
[llmfn](https://llmfn.com/) course.

## Overview

We build one product recommender and improve it layer by layer. The system
evolves from search to prompts, schema, context, state, memory, tool use, and
evals. Each layer reveals what the system needs next. We learn by building,
breaking and refining the systems together.

Every layer is a small, self-contained app: the same product, one capability
richer than the layer before it.

## The layers

| Layer | Name | What it adds |
|-------|------|--------------|
| 1 | Search | BM25 keyword search over the catalogue. Literal queries work ("samsung 5g"); vibe queries ("a phone for my mom") whiff — the limitation the next layers fix. |
| 2 | Prompt | An LLM rewrites the user's query before semantic search, so vibe queries land near the right narratives. |
| 3 | Schema | The LLM call returns structured output (pydantic): a rewritten query plus hard filters and a persona extracted from the request. |
| 4 | Context | A second LLM pass takes the top-3 results, gets their full catalogue records as context, and writes a short recommendation paragraph grounded in them. |
| 5–8 | State, Memory, Tool use, Evals | Upcoming. |

## Layout

- `phonekit/` — the building blocks every layer composes: the search engines
  (`search_bm25`, `search_semantic`), the LLM helper (`llmfn`), filtering and
  facets (`apply_filters`), the trace, and `Application` (Flask server + CLI
  runner in one).
- `layer1/` … `layer4/` — one directory per layer: an `app.py` of a few dozen
  lines plus its prompt files. phonekit is a library, not a framework — each
  layer owns its pipeline top-to-bottom, so you can read any layer's `app.py`
  on its own.
- `data/phones/` — the catalogue, one JSON document per phone.
- `docs/specs.md` — the design spec and the source of truth for the
  `POST /api/recommend` contract; `docs/mockups.md` covers the visual surface.

## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/), so there is
nothing to install explicitly. Configure your OpenAI credentials once:

```sh
cp settings.py.example settings.py   # then fill in OPENAI_API_KEY
```

Layer 1 (BM25) runs without a key; layers 2+ call OpenAI for query rewriting,
embeddings, and summaries.

## Running a layer

Each layer runs the same way. Without arguments it serves the app at
http://127.0.0.1:5000:

```sh
uv run layer4/app.py
```

With a query it runs the same pipeline as a CLI — no server, just the ranked
cards, the summary, and the trace printed to the terminal:

```sh
uv run layer4/app.py "a phone for my mom under 30000"
```

## The X-Ray trace

Every response carries a trace of what the layer did to answer the query: BM25
per-token match counts, cosine scores, each LLM call's instructions and output,
status, and latency. The UI renders it and the CLI prints it — it is the
course's main debugging tool, showing exactly which step helped or hurt a
query.

## Data & catalogue

The catalogue is the per-phone JSON documents in `data/phones/`, loaded into
memory at startup — there is no database or build step. Restart the app after
changing the catalogue data.

Narrative embeddings for semantic search are cached in
`data/cache/phones_embeddings.json` (gitignored). The cache maintains itself:
on startup the app re-embeds any phone whose narrative changed (and prunes
deleted ones), so queries are the only per-request embedding cost.
