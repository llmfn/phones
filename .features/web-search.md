---
status: in-progress
created: 2026-08-17
---

# Web Search (web-search)

The recommender pipeline running inside the Worker: the config document that
decides what runs, the bundled catalogue, filters and facets, and the search
engines a site can select between — served behind `POST /api/recommend` to the
student's public site and to the admin's Try-it pane.

This is what makes the student homepage's search box do something. It has been
a styled control wired to nothing since the hosted app went up.

## Design / Approach

### The one decision everything rests on

**A revision is immutable and every save makes a new one.** There is no draft
state and nothing is ever edited in place. Saving appends revision `n+1` and
points the site at it; restoring an old one appends a *copy* rather than
rewinding a pointer. History is a complete ordered record of everything a
student tried, and "show me the site at revision 3" is always answerable.

That record is the teaching artifact. The workshop's argument is that changing
a retrieval method or a prompt changes what the user gets, and the only way to
show it is to put two versions of the same site side by side. Everything here
exists to make that cheap.

### This app stands alone

The Python app is being retired. `phonekit` is the source these ports are read
from, but it is reference material, not a dependency: nothing in the build, the
tests, or the runtime executes Python, and no script here reads anything the
Python app produces at runtime.

That rules out the obvious way to check a port — running both and comparing —
so correctness is established against the definition instead. BM25 is a closed
formula, so its arithmetic is asserted on a small synthetic corpus with the
numbers worked out by hand. Ranking over the real catalogue is then frozen as a
golden file generated from this implementation once it is reviewed, which makes
it a regression test rather than a parity test.

A one-time cross-check against `phonekit` while it still exists is worth doing
inside `web-search.bm25`, and is a step in that task rather than a standing
dependency.

### The default config is the naive first attempt

A site resolves to the built-in defaults: `search.method` is `substring_match`, every
prompt is empty. `substring_match` is not a stub that returns nothing — it is substring
matching on the phone's name, returning every match. What someone writes before
they know about ranking.

That is a better starting point than an empty engine, for two reasons. An empty
result set is indistinguishable from a broken endpoint, so it proves nothing
about the wiring; real phones prove the catalogue loaded, the projection
works, and the grid renders. And it gives the engines that follow something to
actually beat, so the workshop's arc is three steps rather than two: naive
substring, then real keyword ranking, then meaning.

`substring_match` works just often enough to be misleading. `iphone` returns iPhones and
looks like a search engine. `apple` returns nothing, because the brand is not in
the name. `iphone 16 pro` works only if that exact string appears in that exact
order. `a phone for my mom` returns nothing. Every one of those failures is
fixed by a later task, which is why it is the default a student starts on.

### Defaults are filled on read, not on write

A stored revision holds only what was set. `parseSiteConfig` fills absent
fields from the current defaults at read time, so adding a field leaves every
existing revision loadable — which is what "define the schema upfront, with
minor changes going forward" requires.

The cost is named rather than hidden: **a revision is not a byte-faithful
snapshot of past behaviour.** Add a field with a non-inert default and every
old revision starts rendering with it. That is the right trade when the
alternative is migrating every student's history on every schema change, but it
means a revision reproduces past *configuration*, not past *output*. Anything
that must be reproducible exactly — a recorded eval run — stores its own result
rather than trusting a re-run.

### Addressing a revision

Design settled here, built in `admin.persist`. The seam it plugs into —
`hooks.server.ts` setting `locals.config` — exists from `web-search.substring-match`, so
this adds a revision argument to a resolution that already happens rather than
introducing one.

Resolution happens in exactly one place, `hooks.server.ts`, which puts
`locals.config` and `locals.revision` on the request. No route handler reads the
query string or the header itself, because two spellings of one input is two
chances to disagree.

- `GET /?r=3` — a query parameter, so the URL is shareable and a page at an old
  revision can be linked to.
- `POST /api/recommend` with `X-Phones-Revision: 3` — a header, so the request
  body stays purely the query and its filters. Everything is same-origin, so a
  custom header costs no preflight.
- The header wins when both are present. One resolution order, everywhere.
- **An unknown revision is a 404**, never a silent fall back to live. A demo
  that quietly shows the current site when asked for revision 99 is a demo that
  lies.

Viewing a past revision is public, like the student's live site. Only writes
need a session.

### The schema

Defined upfront, in one module, with a `version` integer stamped on every stored
revision so a future breaking change has something to dispatch on.

```ts
{
  version: 1,
  prompts: { rewrite: string, summarize: string, eval: string, chat: string },
  search: {
    method: 'substring_match' | 'bm25' | 'semantic_search',
    search_params: Record<string, unknown>   // validated per method
  },
  design: { CHIPS_POSITION: string, FILTER_UI: string, CONVERSATION_UI: string }
}
```

`search_params` is validated against the *selected* method rather than a union
of every engine's knobs, so `min_score` on a BM25 config is a rejected save
instead of a silently ignored field. For `bm25` those knobs are `k1` and `b`;
for `semantic_search`, `min_score`. Both are real dials a student can turn and
watch the ranking move, which is why they are exposed rather than hard-coded.

`design` mirrors the registry in `phonekit/design_flags.py` — same flag names,
same options, first option the default.

Secrets never go in this document. The shared OpenAI credential is a Worker
secret; a versioned, viewable, restorable document is the worst possible place
for a key.

### Configuration comes from a bundle first, D1 later

The config document's *schema* is defined upfront here — its type, its defaults,
and `parseSiteConfig` — but its *source* starts as a module bundled with the
Worker, identical for every site. Revisions, the store, and `?r=` addressing
arrive with `admin.persist`, once there is an admin to write them.

**The discipline that makes that swap cheap:** even now, config is resolved per
request through one seam onto `locals.config`, though the answer never varies.
Engines read `locals.config` and nothing imports the config module directly. The
swap is then one function body rather than a refactor of everything that reads
config — free to do this way from the start, expensive to retrofit.

There is a real consequence: until `admin.persist`, nothing a student does can
change their site. This is a build phase with no half-usable intermediate state
to hand anyone.

### The catalogue is bundled, and nothing queries it

136 read-only records, 544K, identical for every student, never written at
runtime. A generated module built from `data/phones/` — which stays the source
of truth — loaded once per isolate.

There is no database on the search path at all. BM25 ranks over an in-memory
index built once per isolate, exactly as `catalog_index()` is `lru_cache`d once
per process; filters and facets run over the result set in memory. A D1 read
before every search would buy nothing, because nothing is ever queried — the
whole catalogue is needed to build the index regardless. D1 arrives with
`admin.persist`, carrying configuration and nothing else.

### BM25 is hand-rolled, not FTS5

`bm25.py`'s own docstring makes the argument, and it holds here:

> Hand-rolled rather than a library (or SQLite FTS5) so the scoring is fully
> inspectable: `token_scores` returns each query token's contribution per
> document, which is what lets the X-Ray trace show *why* a query matched — or
> why a token like "mom" matched nothing. FTS5 only exposes a final rank.

The trace is the product here, not a by-product. A student sees a vibe query die
and the panel names the word that killed it, how many phones hold it, and what
rarity earned it — which is the whole lesson of the retrieval layer. An engine
that returns a score cannot say any of that.

FTS5 was considered and rejected on those grounds. It would also have fixed
`k1` at 1.2 where `phonekit` uses 1.5, tokenized with `unicode61` rather than
`[A-Za-z0-9]+`, and indexed named columns rather than one flat document — so
"the same engine, in SQL" was never on offer. It would have been a different
search engine with a quieter trace.

### The response contract

`docs/specs.md` is stale and is **not** the reference for this work. The shape
is read off `phonekit`'s `Product`, `Facet`, and `SearchResult` in `schema.py`,
which is source that can be read without running anything.

### The trace shape is settled

The trace is not redesigned here. `phonekit/trace.py` and the `TraceStep` /
`TraceTurn` shapes in `phonekit/schema.py` are the reference, and the port
carries the same step and turn structure, the same field names, and the same
grouping of steps under the turn that produced them. `trace` owns the panel's
design; this is the mechanism underneath it, moved.

The one substitution the runtime forces: `ContextVar` becomes
`AsyncLocalStorage`, so a step recorded deep in an engine still finds the run
without threading a parameter through every call. The `nodejs_als` compatibility
flag is already enabled in `wrangler.jsonc`.

Not carried over in this version: the live polling that lets a panel watch a
query while it runs. A Worker request is short and the admin renders the trace
that comes back with the response, so the machinery has nothing to buy yet.
Named rather than dropped — the step shape is identical, so adding it later
changes how steps are delivered and not what they are.

### Every task ends on screen

The tasks below are vertical: each one ends with a query typed into the search
box giving back something better than the task before. The substrate — the
catalogue, the config seam, the trace, the endpoint, the results grid, the trace
panel — rides with `substring_match`, whose engine is small enough that the task is
honestly about the wiring, and real enough that working wiring is visible on
screen.

Nothing here is a layer to be built and set aside. If a task cannot be finished
by running a query and seeing the result change, it is cut in the wrong
direction.

## Tasks

### [DONE] substring-match: serve the pipeline end to end with substring matching

The whole path, with the smallest engine that visibly works.

The catalogue: a generated module built from `data/phones/` — which stays the
source of truth, with the module regenerated rather than hand-edited — plus the
projection turning a catalogue document into the product shape a card needs:
colours, storage options, and the initial selected colour and storage.

The engine: a case-insensitive substring match on the phone's name, returning
every match in catalogue order. An empty query returns the full catalogue, so
clearing the box still shows everything. It records a trace step carrying what
it matched on, the first names in catalogue order, and how many rows matched —
small, but enough that the trace panel has real content from the first task.

There is no ranking here at all, deliberately. Results stay in catalogue order,
so their order is arbitrary. Ranking is `bm25`'s contribution and this is what
it improves on.

The config: its type, its defaults, and `parseSiteConfig`, which takes unknown
JSON and returns a fully populated config — filling absent fields from the
defaults, rejecting values outside the allowed set, and validating
`search_params` against the selected method. Its source is a bundled module for
now, but it is resolved per request through one seam onto `locals.config`.
Engines read configuration only from there and nothing imports the config module
directly — that rule is what lets `admin.persist` replace the body of the seam
and touch nothing else.

The trace: `phonekit/trace.py` ported onto `AsyncLocalStorage`, with the step
and turn shapes unchanged, so every engine and model call from here on records
what it did without its return type carrying it. It lands with `substring_match` because
the engines that follow are only legible through it.

The surface: `POST /api/recommend` reading query and filters from the body,
dispatching on `locals.config.search.method`, and returning products and the
trace; the student homepage's search state rendering the result set; and the
trace panel carrying the Python app's shape. A submitted query is mirrored to
`?q=` without reloading the app. Opening that URL runs the search, and browser
Back and Forward restore searches while preserving parameters such as `?r=`.

Implement this in three checkpoints, each independently verifiable:

1. **Search API.** Generate the bundled catalogue from `data/phones/`; define
   the config, request, and response types; resolve config onto `locals.config`;
   port `Product.from_entry`; implement the handwritten `search` pipeline and
   `searchSubstringMatch`; and expose it through `POST /api/recommend`. Verify
   the endpoint directly: `iphone` returns every matching name, `apple` returns
   none, an empty query returns the full catalogue,
   every phone can be found by its complete name, and the response carries all
   colour and storage options needed by a card.
2. **Search results UI.** Connect the existing student search box to the
   endpoint and port the Python app's zero-to-search layout, result count,
   empty/loading/error states, product grid, and card interactions. Colour
   selection changes the card image locally and storage selection changes its
   price locally. Verify the transition and interactions in both desktop and
   narrow layouts. Do not add the filter rail in this checkpoint.
3. **Trace end to end.** Port the query-scoped trace collector to
   `AsyncLocalStorage`, wrap the pipeline as `Application.run_query` does,
   instrument substring matching with one timed step, return the settled turn,
   and port the Python trace rail: turn grouping, step status and latency,
   expandable formatted/raw detail, and copy-as-JSON. Omit live polling and
   engine-specific BM25/semantic detail renderers. Verify that overlapping
   requests cannot see each other's steps and that pipeline failures return an
   inspectable error turn.

No filter rail yet — it is driven by facets, so it arrives with them.

Typing `iphone` into a freshly deployed site returns iPhones and shows what it
did — which is the point of doing it this way rather than with an empty engine,
because it proves every part of the path at once.

**Acceptance Criteria:**

- [x] `iphone` returns only phones whose name holds it, `apple` returns nothing,
      and an empty query returns rows
- [x] Every phone in `data/phones/` can be found by searching its name
- [x] The trace panel shows one step for the query, with the time it took
- [x] Overlapping requests never see each other's trace steps
- [x] A copied `?q=` URL restores the search without a full-page navigation

### [TODO] facets: show what the results hold

`computeFacets(products) -> Facet[]`, porting `_compute_facets` in
`phonekit/app.py`: brand counts, colour-family counts carrying the family's hex,
and price bounds spanning the matching storage tiers — all scoped to the current
result set rather than the catalogue. The discriminated `categorical` / `range`
shape comes from `phonekit/schema.py`, so a new facet is added by appending data
rather than by changing the response.

This is where the filter rail appears, because the rail is a rendering of the
facets and cannot precede them. It reports what the current results hold —
brands with counts, colour swatches with counts, the price range — and changes
as the query changes. Nothing is clickable yet; narrowing is `filters`.

**No trace step.** A step records what the pipeline did to the data, and
computing facets changes nothing — it derives a view of a result set that is
already decided. The same reasoning `apply_filters` uses when it declines to
record a step for an empty filter set: a row the reader has to open to discover
it did nothing is worse than no row.

One detail to port rather than improve: counts are incremented per colour
*option*, so a phone offered in two blues counts twice toward `blue`. The stale
`docs/specs.md` describes it as counting products instead. Match the code, and
if that is wrong it is a catalogue-wide decision to take on purpose.

**Acceptance Criteria:**

- [ ] A phone with two options in one colour family contributes twice to that
      family's count
- [ ] Searching a narrower query changes the counts and the price bounds

### [TODO] filters: narrow by clicking the rail

`applyFilters(products, filters)`, porting `apply_filters` in
`phonekit/app.py`: keep each product whose options survive every active
dimension, trim it to the survivors, and re-derive its lead colour and storage
from them, so a phone filtered to red opens on its red photo and a phone
filtered by price opens on the first tier inside the range. Brand is a parent
property; colour matches an option's family and price a storage tier's price.

Facets are then computed over the survivors, so the rail's counts reflect the
narrowed set and the two functions compose in that order.

Unlike facets, this **does** get a trace step — it changes the result set, and
the step reports how many went in, how many were kept, and how many each
dimension removed. Following the Python implementation, a product is counted
under the first dimension that excluded it, so the removals and the survivors
add up to the input rather than double-counting a phone that was both the wrong
brand and too expensive. Also following it: no step at all when no filter is
active, rather than a row saying it let everything through.

Filtering is orthogonal to ranking — `bm25` and `semantic` change the order rows
come back in and nothing else.

**Acceptance Criteria:**

- [ ] Narrowing by brand, colour, and price changes the result set, and clearing
      a filter restores it
- [ ] A phone filtered to one colour leads with that colour's image, and one
      filtered by price leads with a tier inside the range
- [ ] The removal counts in the trace and the survivors add up to what went in
- [ ] A query with no active filter records no filter step

### [TODO] bm25: rank by keyword matching

The port of `phonekit/search/bm25.py` and `index.py`, whole:

- `tokenize` — `/[a-z0-9]+/g` over the lowercased string. No stemming, no
  stopwords. Both the indexer and the query side use it.
- `flattenTokens` — walk a phone's raw JSON depth-first and tokenize every
  scalar, with no field list, so a richer record shape is searchable the moment
  it appears in `data/phones/`. Everything is searchable, image URLs and id
  slugs included; that is the existing behaviour and pruning is a data-shape
  question, not this task's.
- `BM25Index` — `k1` 1.5, `b` 0.75, precomputed per-document term counts,
  document lengths, average length, and document frequencies.
  `idf = log(1 + (N - df + 0.5) / (df + 0.5))`.
- `tokenScores` — per document, each query token's individual contribution,
  omitting tokens the document lacks. Returning the breakdown rather than a
  total is the whole design: it lets the engine rank by summing and explain by
  inspecting, from one call.

Built once per isolate. Every query token must appear for a phone to qualify,
and results rank by total score. The trace carries what the Python one does:
catalogue size, average length, `k1`, `b`, per-token match counts and idf
ordered misses-first, and per-result term counts, lengths, and contributions.

This is where a student sees what search buys them. Against `substring_match`, the same
queries improve for reasons they can point at: `apple` works because the whole
record is indexed and not just the name, `pro iphone 16` works in any word order
because the query is tokenized rather than matched as a string, and results come
back *ranked*.

It is also where the course's central limitation shows up on their own screen.
`a phone for my mom` still returns nothing — the same failure as `substring_match`, but
now the trace names the word that killed it and how many phones hold it, which
turns "it doesn't work" into "it can't work, and here's why."

While `phonekit` still exists, run both engines over the same queries once and
diff the rankings. That check is worth having at the moment of porting and is
not repeatable afterwards, so do it here rather than intending to.

**Acceptance Criteria:**

- [ ] `idf` and a token's score contribution match values computed by hand over
      a small synthetic corpus, so the arithmetic is checked against the formula
      rather than against another implementation
- [ ] `apple` returns iPhones and `pro iphone 16` returns the iPhone 16 Pro —
      the two queries `substring_match` gets wrong
- [ ] `a phone for my mom` returns nothing, and the trace names the token that
      no phone holds, with the misses ordered first
- [ ] A committed golden file of query-to-ranked-ids over the real catalogue is
      reproduced exactly
- [ ] The one-time diff against `phonekit` is run and its result recorded

### [TODO] semantic: rank by embedding similarity

Cosine similarity over per-phone narrative embeddings, with the query embedded
at request time through a shared OpenAI credential held as a Worker secret, and
`min_score` cutting the irrelevant tail. The trace shows the top cosine scores,
how many candidates were ranked, and how many qualified.

The vectors ship as a committed artifact, int8-quantized — 4.2MB of JSON down to
around 209KB — read once per isolate. Quantization perturbs scores slightly
without changing what a student sees; the tolerance goes in the test rather than
being discovered later.

A TypeScript script generates the artifact: read `data/phones/`, embed each
narrative, quantize, write. It reads nothing the Python app produces and is run
by hand when narratives change. The artifact stamps each phone with a hash of
the narrative it embedded and the model used, so the loader can refuse vectors
that no longer describe the phone they are attached to — a silent failure
otherwise, since stale vectors still return plausible-looking results.

This is the answer to the failure `web-search.bm25` puts on screen: the same
vibe query that returned nothing now returns something sensible, and the trace
shows cosine scores where it showed a missing token.

**Acceptance Criteria:**

- [ ] Quantized and unquantized vectors rank a fixed query identically down to a
      stated depth, so quantization drift is bounded rather than assumed
- [ ] The vibe query that returns nothing under BM25 returns results here, by
      changing only the configured method
- [ ] Editing a narrative in `data/phones/` without regenerating the artifact
      fails the load rather than ranking against the old vector
- [ ] A site selecting this method with no credential configured fails with a
      message naming what is missing

## Handover

`web-search.substring-match` is complete. The generated catalogue, config seam,
product projection, traced substring pipeline, instance-only endpoint, result
grid, card interactions, and trace rail now form one end-to-end path. The
query-scoped collector uses `AsyncLocalStorage`; each response carries a settled
turn, pipeline failures return an inspectable error turn, and each new search
replaces the previous search turn in the rail, with formatted/raw detail and
copy-as-JSON.

`npm run check:catalogue`, `npm test`, `npm run check`, and `npm run build` pass
from `web/` (15 test files, 52 tests). The overlap test runs two asynchronous
traces concurrently and verifies that neither receives the other's step. Next
is `web-search.facets`, which adds result-derived counts and the filter rail's
first read-only surface.
