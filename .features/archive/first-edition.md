# First Edition — build log (archived)

This was `PLAN.md`, the plan the app was built against for edition 1 of the course
(taught June 13, 2026). It is kept as written, as a record of what was built and why.

It predates the `.features/` conventions and does not follow them: no `status:`
frontmatter, and task headings use `## Task N: … (DONE)` rather than `[TODO]` /
`[DONE]`. The greps described in `.features/README.md` deliberately don't reach it.
Its status markers had already drifted from the repo by the time it was archived —
read it as history, not as a description of the code. Nothing here gets picked up
again; work that is still live is shaped as a fresh feature.

---

The plan of what needs to be build, organized as tasks.

Each tasks specified what need to be build and the acceptance criteria, if needed. The task should not get into the details of how it should be built, or the low-level details. They are left to the implementation stage. 

This file serves as a way to review what is going to be built and making sure it is in the right direction.

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

NOTE: This task is deprecated in favor of getting specs from brand websites and creating narrative from there.

~100 hand-curated real phone models, records drafted by an LLM via a one-off
script (no scraping). Specs need only be plausible, not certified accurate —
the dataset is the source of truth the course grounds against.

**Status:** docs, record shape, variant selection, and the frontend (colour
facet, "+N colours" hint) are done, exercised on the 16 existing phones
hand-migrated to the new shape (3 fully enriched as few-shot examples for the
generation script). The curated list (`data/models.yaml`, 94 models) and the
generation script (`scripts/generate_phones.py`, runs on a Claude
subscription via `claude -p`) are in, smoke-tested on one record.

**TODO (can run in parallel with later tasks):**

- [ ] Pilot batch: `uv run python scripts/generate_phones.py --limit 10`,
      review the records, tune the prompt / few-shot examples if narratives
      or specs look off
- [ ] Full batch: the remaining ~77 models (~1h of `claude -p` calls;
      idempotent, re-run picks up failures)
- [ ] BM25 token exclusions: the indexer flattens the whole record, so `id`
      slugs and image URLs get tokenized; exclude those keys, keep
      `color_name` / `color_family` / narrative / specs indexed
- [ ] Narrative review pass: narratives are the teaching material for the
      semantic-search demo — each demo persona needs strong matches, and no
      record may contain "mom"/"mother"/"grandma" (script enforces this at
      generation time; re-check anything hand-edited)
- [ ] Real images for variants (deferred; placeholder tints in use)

**Raw source data:** added a Samsung India raw-data fetcher that uses public
Samsung finder/spec/buy-page JSON sources. A limited Galaxy S smoke run writes
one JSON file per model/SKU variant under `data/raw/samsung/`, with aggregate
endpoint/page payloads under `data/raw/samsung/_raw/`.

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

## Task 7: Typed trace (X-Ray) (DONE)

* Replace `trace: Any` with a `TraceStep` model — shaped as docs/specs.md
  already specified (`layer`, `name`, `input`, `output`, `status`,
  `latency_ms`), which is also what the frontend renders
* Layer 1 emits the first real step: BM25 tokens and per-token match counts

**ACCEPTANCE CRITERIA**
- "something for my mom who struggles with technology" shows zero token
  matches in the trace

## Task 8: Semantic search (Layer 1, Level 2) (DONE)

* `SEARCH_MODE = "bm25" | "semantic"` flag in config; layer1 branches.
  Default is `bm25` so the app runs without any key
* Vendor decision: **OpenAI** for embeddings and the Layers 2+ LLM — one key
  (`OPENAI_API_KEY` from the environment, loaded into config).
  Model: `text-embedding-3-small`
* Embed only the parent `narrative`; cosine similarity in memory, top-k
  (`SEMANTIC_TOP_K`, no similarity threshold — that's hybrid-search territory)
* Cache corpus embeddings in `data/phones_embeddings.json`, keyed by phone id
  + narrative hash + model name; commit the cache so students only pay for
  query-time embeddings. The app maintains the cache itself at startup
  (re-embeds stale narratives, prunes deleted phones) — no separate script
* Trace emits the query and top-k phones with cosine scores

**TODO:** generate and commit the initial `data/phones_embeddings.json` (needs
`OPENAI_API_KEY`; run one semantic query, or just start the app in semantic
mode and search)

**ACCEPTANCE CRITERIA**
- "something for my mom who struggles with technology" returns 0 results in
  bm25 mode and sensible phones in semantic mode, visible in the trace
  (bm25 half verified; semantic half pending the API key)

## Task 9: Layer 2 — Prompt (Pass 1: LLM query rewriting) (DONE)

Pattern: stateless LLM, `f(query) → y0`. The first LLM call: Pass 1 rewrites
the raw query into a query that lands well in embedding space, then the
existing semantic search runs on the rewrite. No UI change — same box, same
cards; the X-Ray trace is where the layer shows its work.

* Layer 2: an LLM (a small/cheap OpenAI chat model, per the Task 8 vendor
  decision) rewrites the user's query, then Layer 1's semantic search runs on
  the rewrite. Layer 2 always searches semantically — rewriting for BM25
  token space isn't the lesson
* The three course prompts (zero-shot, few-shot, chain-of-thought) ship in
  the layer's source code; students switch levels by editing the file. No
  config flag — the prompt is the artifact, and the deliberate hand-edit is
  the teaching device
* Deliberately **no** output schema, no consistency engineering: run-to-run
  inconsistency of the rewrite is the failure moment that motivates Layer 3
* The trace shows the rewrite step (raw query, active prompt, rewritten
  query) followed by the semantic-search step with its cosine scores
* If the LLM call fails, search falls back to the raw query, visibly marked
  as a fallback in the trace. An empty query skips the LLM, as today
* Layer 2 becomes the active layer

**Depends on:** the committed `data/phones_embeddings.json` (Task 8 TODO).
Works on the 16 existing phones; the full Task 6 dataset only makes the demo
richer.

**ACCEPTANCE CRITERIA**
- "something for my mom who struggles with technology": trace shows raw →
  rewritten query and cosine scores; results are sensible phones (vs. 0
  results in Layer 1 bm25)
- Running the same query twice shows two different rewrites in the trace —
  the Layer 3 motivation, visible
- Stopping the LLM (bad key at request time / network off) degrades to a
  `fallback` trace step searching the raw query, not a 500

## Task 10: Data model — colours and storage as separate arrays (DONE)

Split the flat `variants` cross-product into two dedicated arrays on the
catalogue record: `colors` (each with `name`, `family`, `hex`, `image`) and
`storage_options` (each with `gb`, `label`, `price`). Update the catalogue
loader, filter logic, and generation script to match.

**Depends on:** Apple phone generation (Task 6 continuation — records already
being generated with real image URLs per colour)

**Acceptance criteria:**
-[x] Catalogue loads and validates with the new shape
-[x] Colour filter and price filter work as before against the new arrays
-[x] Generation script outputs the new shape; existing Apple records regenerated

## Task 11: Card — image, colour swatches, and storage options (DONE)

Enrich each result card with the phone's photo, interactive colour swatches,
and a storage picker.

- Card shows the lead colour's photo (real image URL from the catalogue)
- A row of small circular colour swatches below the image — one per colour,
  filled with the colour's hex code when available, grey placeholder until it
  lands; clicking a swatch swaps the photo to that colour's image
- Storage options shown as a pill row below the swatches — `128 GB | 256 GB |
  512 GB | 1TB` for Apple-style (no RAM published), or `6 GB + 128 GB | 8 GB +
  256 GB` when RAM is known; clicking a pill updates the displayed price
- Update `docs/mockups.md` to reflect the new card anatomy

**Depends on:** Task 10 (colours and storage as separate arrays); hex codes per
colour (deferred — UI degrades gracefully to grey circles without them)

**Acceptance criteria:**
- [x] Clicking a colour swatch swaps the card photo and keeps the swatch highlighted
- [x] Clicking a storage pill updates the price shown on the card
- [x] Without hex codes: grey circles; with hex codes: filled circles in the right colour

## Task 12: Layer 3 — Schema (DONE)

Pass 1 now returns a strict typed object every call instead of a free-form string.

* `layer3_schema.py` — uses OpenAI structured output to enforce the Pass 1 response
  shape: `{ query, filters, persona }`
  * `filters`: `max_price`, `min_battery_mah`, `os` (each nullable)
  * `persona`: one of `elderly`, `teen`, `camera-lover`, `gamer`, `value-seeker`, or null
* The three prompt levels from Layer 2 carry over — students still edit `ACTIVE_PROMPT`
* Trace shows the validated structured object
* `CURRENT_LAYER` → 3

**ACCEPTANCE CRITERIA**
- Same query run twice produces the same shape (even if the rewritten query text varies)
- An invalid API response is caught and falls back gracefully (trace shows `fallback`)

## Task 13: Persona re-ranking (DONE)

Use the `persona` extracted by Layer 3 to re-rank semantic search results.

* After semantic search returns top-N candidates, if persona is non-null, re-rank using
  the `signals` field on each catalog record (e.g. "elderly" scores up phones with a
  matching `personas` signal)
* Persona and re-ranking are visible in the trace

**ACCEPTANCE CRITERIA**
- Persona "elderly" surfaces a different top-3 than running the same query without persona
- No persona → order identical to Layer 3 semantic ranking

## Task 14: Layer 4 — Context (DONE)

Adds Pass 2: a second LLM call that generates a grounded natural-language summary
above the cards.

* `layer4_context.py` — builds on Layer 3; after search retrieves top 3 phones, injects
  them as context into Pass 2
* Context is selective: only `name`, `price`, `narrative`, and specs fields relevant to
  the query — not the full record
* Pass 2 generates a short recommendation paragraph grounded strictly in the 3 injected
  records
* API response gains a `summary` field; add it to `docs/specs.md`
* UI: render `summary` above the results grid when present (no structural change
  otherwise); `summary` absent in Layers 1–3 responses — conditional render
* Trace shows context injected (the 3 condensed records), Pass 2 input/output, latency
* `CURRENT_LAYER` → 4

**ACCEPTANCE CRITERIA**
- Response cites only facts present in the injected context records
- `summary` is absent in Layers 1–3 responses (field omitted, not null) — UI renders
  correctly in both cases
- Pass 2 latency visible in trace
- If Pass 2 fails, cards still render normally and `summary` is omitted (trace marks
  `error`)

## Task 15: Refactor — phonekit library + self-contained layer directories (DONE)

Restructure so each layer is a self-contained directory at the repo root that
constructs its app from `phonekit`, a shared library of building blocks.
Library, not framework: each layer's `app.py` owns its control flow,
top-to-bottom; phonekit never calls into layer code beyond the single
dispatch. Replaces the Layer class hierarchy.

Rough shape — illustrative only, file layout is the implementer's call:

```
phonekit/            # library + server: catalogue, search engines, LLM
                     # helper, response/trace building, CLI runner,
                     # Flask app, templates/static
layer0/app.py
layer1/app.py        # BM25 ↔ semantic per SEARCH_MODE
layer2/app.py  system_prompt.txt  prompts/  play.py
layer3/app.py  system_prompt.txt  prompts/  schema.json  play.py
layer4/app.py  system_prompt.txt
```

Each `app.py` exposes `search(query, filters)` and doubles as the CLI via a
trivial `__main__` guard (`cd layerN && uv run app.py "phone for my mom"`);
the server serves whichever layer `CURRENT_LAYER` names. phonekit is an
editable install (pyproject), so imports resolve from any directory; layer
dirs are plain script folders — no `__init__.py`.

Principles:

* Lesson-bearing code (prompts, schemas, pipeline composition, fallback
  policy) lives in layer dirs, deliberately duplicated so each layer reads
  complete — `diff layer2/app.py layer3/app.py` is the lesson. Plumbing
  lives in phonekit, never duplicated. No layer imports another layer;
  phonekit contains no prompts and no layer-specific logic.
* Each layer is self-contained and decides how it is implemented using the
  building blocks.
* Prompt files contain only the prompt — everything in the file goes to the
  model; switching instructions live in `app.py` docstrings.
* Layer docstrings tell teaching.md's story, not an invented one.

Docs in the same task: `docs/teaching.md` (repo anatomy + how to work a
layer, real record shape, embeddings as local cache, Layer 3 = schema.json),
`CLAUDE.md` layout, Makefile/README entry point. `docs/specs.md` contract
unchanged — verify, don't rewrite.

**ACCEPTANCE CRITERIA**
- Pure refactor: UI behavior unchanged at every layer 0–4
- `cd layerN && uv run app.py "query"` prints cards + trace for every layer,
  no Flask
- Overwriting `system_prompt.txt` changes behavior with no Python edit
- No prompts or layer-specific logic in phonekit; no cross-layer imports

## Task 16: Layer 5 — Conversation

Layer 4 ends with a recommendation paragraph. Layer 5 turns that into a
conversation: Pass 2 generates a response that closes with a question, and the
UI replaces the filters sidebar with a chat panel where the conversation
accumulates turn by turn. The cards update on each reply.

**Backend changes from Layer 4:**
- Pass 2 prompt instructs the model to always end with a clarifying question
- Both Pass 1 and Pass 2 receive the full conversation history (alternating
  user/assistant turns) on every call
- The API accepts a `history` field in the request body alongside `query` and
  `filters`

**Frontend changes:**
- The filters sidebar becomes a conversation panel at Layer 5
- The first assistant message (summary + question) appears in that panel;
  subsequent replies and responses are appended below
- A reply input sits at the bottom of the panel; submitting fires the next
  call with history appended
- The main search bar resets the conversation (clears the panel, returns to
  fresh state)
- Conversation history lives in JS session state only — gone on page refresh

**The teaching moment:** The X-Ray trace shows the message array growing with
each turn. By turn 5–6 the payload is noticeably larger — the natural setup
for the sliding-window / summarisation discussion.

**ACCEPTANCE CRITERIA**
- Pass 2 always ends with a question on every turn
- Filters sidebar is replaced by the conversation panel; first assistant
  message appears after the initial query
- Replying appends to the thread and updates the cards
- The main search bar resets the conversation
- X-Ray trace shows the full message array and growing token count per turn
- Page refresh clears the conversation; no regression at Layer 4

**Current scaffold:**
- [x] Each search response includes a UUID `session_id`
- [x] Search responses are persisted under `data/state/<session_id>/`
- [x] Conversation turns post to a backend endpoint and append to server-side history
- [x] Placeholder backend reply is `message received` without an LLM call
- [x] Frontend queues messages submitted while a conversation call is in flight

## Task 17: Layer 7 — Tool Use

Layer 7 extends the memory-enabled chat assistant with a local store-finder
tool. When the user asks where to buy a recommended phone, the assistant asks
for the city if needed, calls the tool when the city is known, and replies with
the three stores returned by the tool.

**ACCEPTANCE CRITERIA**
- [x] The store-finder tool is defined inside the Layer 7 app code
- [x] The LLM helper accepts a `tools=[...]` argument
- [x] A known city leads to a tool call and a reply grounded in the tool result
- [x] A missing city leads to a clarifying question before any tool call
- [x] Existing conversation and memory behavior remains unchanged
