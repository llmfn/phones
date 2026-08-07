# phones

The phone recommender app built layer by layer in the
[llmfn](https://llmfn.com/) course.

> This repo is being updated for edition 2 of the llmfn course, planned
> for August 8, 2026. For the version taught on June 13, 2026 (edition 1),
> see the [edition-01](../../tree/edition-01) tag.

## Overview

We build one product recommender and improve it layer by layer. The system
evolves from search to prompts, schema, context, state, memory, tool use, and
evals. Each layer reveals what the system needs next. We learn by building,
breaking and refining the systems together.

You build the app yourself, from the ground up. Each layer is a small,
self-contained version of it: the same product, one capability richer than the
layer before it. A worked solution for every layer lives in `solutions/` to
check yourself against.

## The layers

| Layer | Name | What it adds |
|-------|------|--------------|
| 1 | Search | BM25 keyword search over the catalogue. Literal queries work ("samsung 5g"); vibe queries ("a phone for my mom") whiff — the limitation the next layers fix. |
| 2 | Prompt | An LLM rewrites the user's query before semantic search, so vibe queries land near the right narratives. |
| 3 | Schema | The LLM call returns structured output (pydantic): a rewritten query plus hard filters and a persona extracted from the request. |
| 4 | Context | A second LLM pass takes the top-3 results, gets their full catalogue records as context, and writes a short recommendation paragraph grounded in them. |
| 5 | State | Follow-up chat turns get the session's message history, so a conversation carries across turns. HTTP and LLM calls stay stateless — the app appends each turn to a transcript and passes it back in. |
| 6 | Memory | A profile that outlives the session. Loaded before both passes, so a returning user's budget and priorities shape every recommendation; the model reports what it learned each turn and the layer saves it. |
| 7 | Tool use | The assistant can call a local store finder — asking for a city when it needs one, then grounding its reply in what the tool returned. |
| 8 | Evals | Upcoming. |

## Layout

- `app.py` — the app you build. It starts as a skeleton whose `search()`
  returns nothing; you grow it a layer at a time.
- `phonekit/` — the building blocks `app.py` composes: the search engines
  (`search_bm25`, `search_semantic`), the LLM helper (`llmfn`), filtering and
  facets (`apply_filters`), sessions and memory, the trace, and `Application`
  (the Flask server, templates, and frontend). phonekit is a library, not a
  framework — your `app.py` owns its pipeline top-to-bottom.
- `solutions/layer1/` … `solutions/layer7/` — a worked `app.py` per layer, a
  few dozen lines each plus its prompt files, from the first edition of the
  course. Each reads on its own; `diff` two of them and the lesson is the
  difference.
- `data/phones/` — the catalogue, one JSON document per phone.
- `docs/specs.md` — the design spec and the source of truth for the
  `POST /api/recommend` contract; `docs/mockups.md` covers the visual surface,
  and `docs/teaching.md` the eight layers and the story each one tells.

## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/), so there is
nothing to install explicitly. Configure your OpenAI credentials once:

```sh
cp settings.py.example settings.py   # then fill in OPENAI_API_KEY
```

BM25 keyword search runs without a key; semantic search and everything from
Layer 2 on call OpenAI for query rewriting, embeddings, and summaries.

## Running it

Serve your app at http://127.0.0.1:5000:

```sh
make run          # or: uv run python app.py
```

Any worked solution runs the same way, so you can compare against one as you
go:

```sh
make layer4       # or: uv run python solutions/layer4/app.py
```

## The X-Ray trace

Every response carries a trace of what the app did to answer the query: BM25
per-token match counts, cosine scores, each LLM call's instructions and output,
status, and latency. The UI renders it beside the results — it is the course's
main debugging tool, showing exactly which step helped or hurt a query.

## Data & catalogue

The catalogue is the per-phone JSON documents in `data/phones/`, loaded into
memory at startup — there is no database or build step. Restart the app after
changing the catalogue data.

Narrative embeddings for semantic search are cached in
`data/cache/phones_embeddings.json` (gitignored). The cache maintains itself:
on startup the app re-embeds any phone whose narrative changed (and prunes
deleted ones), so queries are the only per-request embedding cost.
