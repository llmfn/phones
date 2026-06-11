# PLAN

## Task 1: Create the app skeleton (DONE)

* Minimal app skeleton

## Task 2: Design Mockups (DONE)

* Design ascii mockups for the page and zero state

## Task 3: Layer abstraction and dummy data (DONE)

* Design an interface for Layer, design a response schema
    - run_query(query)
* Create dummy data and implement Layer0 in layers/layer0_dummy_data.py
* Add a config.py that specifies the current layer
* A utility to create the layer. 
* Wire it to the app

**ACCEPTANCE CRITERIA**
- The search and filters should work

## Task 4: Layer 1: Add search interface (DONE)

* Add sample phones data in data/ with each phone as a JSON document
* Added schema.sql to sqlite. Use FTS5. 
* Add a script to import the data into a database
* Add layer1 - search

## Task 5: Drop SQLite — in-memory catalogue + BM25 (DONE)

Replaces the SQLite/FTS5 approach from Task 4. Fewer moving parts, everything
transparent, and one data path that later layers (semantic search, context
injection) share.

* Add a catalogue loader: read `data/phones/*.json` at startup into memory
* Hand-roll BM25 (~40 lines, e.g. `app/search/bm25.py`) so per-token scoring
  can be exposed in the X-Ray trace later — FTS5 can't show why a query scored zero
* The indexer flattens the whole JSON record into tokens (no hard-coded field
  list), so it picks up the richer Task 6 shape (narrative, specs, variant
  colours) without code changes
* Rewire layer1 to the in-memory index
* Delete `data/schema.sql`, `phones.db`, `scripts/import_phones.py`, and `DB_PATH`

**ACCEPTANCE CRITERIA**
- Pure refactor: search and filters behave as before on the existing 16 phones

## Task 6: Dataset — variants + generation script

~100 hand-curated real phone models, records drafted by an LLM via a one-off
script (no scraping). Specs need only be plausible, not certified accurate —
the dataset is the source of truth the course grounds against.

* Extend the record shape: parent product (shared `specs`, `signals`, one
  `narrative` written for semantic search) + nested `variants` (colour and
  RAM/storage, each with own `id`, `price`, `image`). Colour gets two fields:
  marketing `color_name` + canonical `color_family` for matching
* Update `docs/specs.md` (response contract) and `docs/mockups.md` first:
  card shows the best-matching variant + "+N colours" hint; no variant
  switcher widget yet
* Variant selection logic in the Layer base class: filters decide which
  products match AND which variant represents each card ("red phone" shows
  the red variant, hides others). Colour becomes a third facet
* Curate the model list by hand: spread across price segments and brands
  (incl. a few Indian brands for the Layer 6 memory demo), several strong
  matches per demo persona (elderly, teen, camera-lover, gamer, value-seeker)
* Generation script in `scripts/`: input = curated model list, output = full
  records. Validate on ~10 models first, then run the full batch
* Re-check BM25 token choices against the new shape: index `color_name` /
  `color_family` and other new text fields; exclude image URLs and `id` slugs
* Review pass — narratives especially; they are the teaching material

## Task 7: Typed trace (X-Ray)

* Replace `trace: Any` with a minimal `TraceStep` model (stage, summary, payload)
* Layer 1 emits the first real step: BM25 tokens and per-token match counts

**ACCEPTANCE CRITERIA**
- "something for my mom who struggles with technology" shows zero token
  matches in the trace

## Task 8: Semantic search (Layer 1, Level 2)

* `SEARCH_MODE = "bm25" | "semantic"` flag in config; layer1 branches
* Embeddings via a hosted API — pick the vendor together with the LLM
  provider for Layers 2+ so students manage one key (open decision)
* Embed only the parent `narrative`; cosine similarity in memory, top-k
* Cache corpus embeddings in `data/phones_embeddings.json`, keyed by phone id
  + narrative hash + model name; commit the cache so students only pay for
  query-time embeddings
* Trace emits the query and top-k phones with cosine scores

**ACCEPTANCE CRITERIA**
- "something for my mom who struggles with technology" returns 0 results in
  bm25 mode and sensible phones in semantic mode, visible in the trace

## BACKLOG

* Hybrid search (BM25 + semantic, re-ranker) — Layer 1 "Level 3" rabbit hole
* Variant switcher widget on cards
* Grow the dataset toward 200 models if retrieval demos need it
