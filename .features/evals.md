---
status: in-progress
created: 2026-08-08
---

# Evals (evals)

A flat YAML file of query-and-expectation pairs, scored by an LLM judge against
whatever a layer returns. Any `app.py` runs it against itself with
`--eval`; students add cases by appending to the file. This is Layer 8 — the
measurement layer of the course.

## Design

### The one decision everything rests on

**Expectations describe the product's job, never a pipeline stage.** A case
says what a good answer to a user's query looks like — not that Pass 1 emitted
a persona, not that the summary names three phones. Nothing in the file
mentions a layer or a function.

That constraint is what makes one file runnable against every layer, and it is
the demonstration Layer 8 exists for: run it against `solutions/layer1` and "a
phone for my mom" fails; run it against `solutions/layer4` and it passes. Cases
turning yes across layers is the course's closing argument. An expectation
written against a stage would break that and is a review reject.

### The app runs its own evals

`app.py --eval` scores the eval file against that app. No separate runner
script, no `--app` flag pointing at someone else's file: which layer gets
measured is which `app.py` you invoke.

```sh
uv run python app.py --eval                    # your app
uv run python solutions/layer4/app.py --eval   # a worked solution
```

`Application.run()` dispatches on argv — a mode its docstring already promises
("CLI when invoked with a query, the dev server otherwise"). `--eval` is the
first argv mode to land.

This also settles a wiring question. `solutions/layer2`–`layer7` assign
`app.search` inside `if __name__ == "__main__":`, so importing those modules
yields an `Application` with `search=None` — which would have blocked any
out-of-process runner and forced an edit to seven files students read. Running
in-process from inside the guard needs no such change. (Checked separately: the
guard is not a reloader workaround. Werkzeug re-executes the file as `__main__`
on every restart, so module-level and in-guard assignment behave identically
under `debug=True`.)

### The judge is closed-book

The judge sees the query, the expectation, and exactly what the app returned:
each product's name, brand, price, colors, and a compact spec projection, plus
the summary when the layer produces one. It does not see the catalogue.

Decided, not overlooked. A judge that can browse all 136 phones becomes a
second recommender, and a disagreement then has two possible causes — the app
missed a phone, or the judge decided it should have been there — with no way to
tell them apart. Closed-book grading is also reproducible and cheap. Prose
expectations about prices and counts still work, because the prices are in the
evidence. Giving the judge the catalogue is a deliberate later step
(`evals.catalogue-tool`), taken once baselines are stable enough to compare
against.

### Scoring is yes or no

The judge returns `passed` and a one-line reason. Nothing is averaged and
nothing is ranked: the headline is a pass count, `4/6 passed`.

An anchored 0–5 score was tried first and dropped. The extra resolution was not
worth the extra rubric to read and maintain, and a per-case verdict is what the
page and the exit code both need. A case moving from no to yes across layers
carries the lesson on its own.

### Layout

- `evals.yml` — the flat case file at the repo root, the only thing most people
  touch, shared by every layer
- `prompts/eval.md` — the judge prompt, read and edited like any other prompt.
  It lives beside each app's other prompts, so a layer can change how it is
  judged the same way it changes how it summarizes
- `phonekit/evals.py` — the machinery `Application.run()` dispatches into, plus
  the browser endpoint's per-case entry point

The case file sits at the repo root, not beside a layer's `app.py`: `read_file`
anchors to the layer directory and would give each layer its own copy, which is
exactly what this feature must not have. `phonekit/evals.py` resolves it the
way `catalog.py` resolves `data/phones/`. The judge prompt goes the other way
on purpose — it is a prompt, and phonekit holds no prompts. A judge you cannot
read is a judge you cannot trust; reading it is part of the lesson.

### The file stays small

The eval file will not grow past about 50 cases. It is a hand-written set that
has to stay readable and cheap enough to run on every prompt change, not a
corpus.

Worth knowing because it settles questions that would otherwise need designing
around: one layer-4 case's trace is ~16KB, so holding every case's trace costs
under a megabyte, and a run costs a couple of minutes at worst. Neither needs
sampling, paging, or a store.

### Non-goals for this version

Single-query only: each case runs one query through the layer's `search`. It
therefore never exercises chat, memory, or tool use, so layers 5–7 are measured
only through their opening search. Named rather than hidden. The case schema
leaves room for a later `turns:` list beside `query:`, so nothing written now
is invalidated by adding multi-turn cases.

### The browser runs one case at a time

The web interface runs the same root `evals.yml` against the `Application` that
is serving it. It does not upload or edit cases, select another layer, or keep
a run history. The YAML remains the source people review and change; the page
makes the existing run easier to start and read.

`GET /evals` renders the cases before any model calls are made.
`POST /api/evals/<index>` runs and judges exactly one case and returns its
`Result` — query, expect, passed, reason, latency, and the app trace.

The browser owns the loop. It walks the rows in file order, awaiting one
request at a time, so each row turns yes or no while the run is still going and
the status line can say "Running 3 of 6..." truthfully rather than inventing a
progress percentage. This is what a whole-run endpoint could not do: a single
`POST /api/evals` returning everything at once leaves the page blank for the
length of the run and needs a second execution system — background jobs,
polling, persistence — to say anything in the meantime. Per-case requests get
live progress with no machinery at all, and the natural retry is just pressing
the button again.

Because one browser run is one request at a time, no run-level lock is needed
and there is no `409` to return. A second tab would interleave requests rather
than multiply a run.

The page is the recommender shell with the eval list in place of the results
column, and it keeps the trace rail: selecting a completed case shows the same
trace the home page shows, which is the reason the `Result` carries one.
Templates, CSS, and JS are eval-specific (`evals.html`, `evals.css`,
`evals.js`) rather than the recommender's event modules, whose binding assumes
the `/` DOM; only `render.js`'s trace rendering is reused. Its states are:

- **Idle:** title, a short closed-book explanation, `Run evals`, and the
  source-ordered query/expectation list.
- **Running:** the same list stays visible, the button is disabled, the list is
  `aria-busy`, and completed rows fill in behind the case being run.
- **Results:** pass count is the headline, with wall time beside it; every row
  carries its verdict, judge reason, and latency, and can be selected for its
  trace.
- **Error:** a case that fails to run is an ordinary `no` row carrying the error
  text, as it is in the CLI. A case file that will not load renders as a page
  error above an empty list.

Verdicts are always written as text rather than encoded only by colour.
Model-written reasons and errors are inserted as text, and the page has a real
`main`, `h1`, visible focus states, and a status region.

## Tasks

### [DONE] basic: score the eval file against any layer

`app.py --eval` runs every case in `evals.yml` through this app's `search`,
judges each closed-book against the app's `prompts/eval.md`, and prints one
yes/no line per case with its reason, followed by a summary line —
`4/6 passed | 19.2s`. Exit non-zero when any case fails, so it can gate a
prompt change.

A case is `query` (the user's words, as typed) and `expect` (prose describing a
good answer). Seed cases spanning the query kinds the course uses: literal
model lookups Layer 1 already handles, vibe queries only Layers 2+ can serve,
budget-constrained queries, persona queries. The mix matters — a file where
everything fails at Layer 1 shows no progression, one where everything passes
measures nothing.

Judge evidence is capped at the top 5 products and excludes narratives: the
judge grades the recommendation, not the catalogue's marketing copy. Each case
goes through `Application.run_query`, and a pipeline exception, a trace error,
an empty result set, or a judge failure each become a `no` with the reason,
so one bad case reports why instead of aborting the run.

**Acceptance Criteria:**

- [x] `uv run python solutions/layer1/app.py --eval` and the layer 4 equivalent
      both produce a table, and layer 4's pass count is the higher of the two
- [x] Every `expect` reads as a statement about the answer a user wanted, with
      no mention of a layer, pass, prompt, schema field, or function
- [x] A test with a stubbed client asserts the judge evidence carries no
      narrative text and at most 5 products
- [x] A case whose pipeline raises appears in the output as a `no` with the
      error text, and the remaining cases still run
- [x] Bare `uv run python app.py` still serves, and reload still works

### [DONE] web: run and read evals in the browser

The report page and per-case JSON endpoint above, added to the existing Flask
application. `EvalsView` renders `evals.html` from `load_cases`; `EvalCaseView`
runs one case through the same `run_case` the CLI uses, so scoring, failure
handling, and the verdict have one implementation. `run_evals` stays the CLI
adapter that loops, prints, and returns an exit code.

Eval-specific template, CSS, and browser-native JavaScript, reusing only the
trace renderer. Evals sits beside Playground in the root tool navigation.

Editing cases, choosing a case subset, sorting or filtering results, comparing
layers, retaining history, exporting reports, and cancellation are non-goals.
`evals.catalogue-tool` remains a separate scoring change and must not be folded
into the page.

**Acceptance Criteria:**

- [x] Route tests find the Evals navigation, an accessible `GET /evals` report,
      and the shipped cases without making a model call
- [x] With search and judge stubbed, `POST /api/evals/<index>` returns the
      documented result including its trace, and an unknown index returns 404,
      without creating sessions or making network calls
- [x] The CLI output, summary, and exit behavior are still covered while using
      the same `run_case` as the API
- [ ] Manual checks cover idle, running, results, and case-failure states at
      desktop and phone widths using keyboard navigation and a screen reader

### [TODO] memory-isolation: keep eval runs out of the user's profile

`phonekit.memory` reads and writes one fixed `data/memory/memory.json` through
a module-global `_path`. `configure_path` exists as a seam but has no callers,
so an eval run against layers 6–7 — from the CLI or from the browser — reads
and overwrites the profile of whoever is using the app, and cases can teach
each other.

Setting the global for the duration of a run is not a fix once the server is
in play: it would redirect unrelated requests being served at the same time.
Path selection has to become context-scoped, the same shape as
`Session.configure_root`, with each eval case running against its own scratch
profile and the caller's context restored afterwards.

**Acceptance Criteria:**

- [ ] A full run against `solutions/layer6` leaves `data/memory/memory.json`
      unchanged, from both `--eval` and the browser
- [ ] Tests overlap an eval with ordinary memory access and assert distinct
      eval cases, the user profile, and the configured caller path remain
      isolated

### [TODO] catalogue-tool: let the judge check the catalogue

An opt-in tool the judge can call to list catalogue phones with selected
fields, so an expectation can be about what the app *missed* rather than only
about what it returned. Off unless asked for, because a browsing judge is
slower, non-reproducible, and makes a disagreement unattributable between the
app and the judge.

Not worth starting before `evals.basic` has produced comparable numbers across
at least two layers — the tool exists to measure a recall failure, and that
needs something to measure against.

**Acceptance Criteria:**

- [ ] Default runs make no tool call
- [ ] With the tool on, verdicts for the same eval file are recorded beside the
      closed-book verdicts for at least two layers, so the divergence is visible

## Handover

`evals.basic` and `evals.web` are done. `evals.memory-isolation` is the next
thing to pick up and is the one real gap in what shipped;
`evals.catalogue-tool` has not been started.

The harness works end to end: `evals.yml` at the repo root holds the cases (6
at present), each app's `prompts/eval.md` holds the judge prompt,
`phonekit/evals.py` holds the machinery, and `Application.run` dispatches
`--eval` before it reaches Flask. `make eval` runs it against the skeleton.
`tests/test_evals.py` covers the loader, evidence, failure paths, CLI, page,
and endpoint with the judge stubbed, so the suite makes no network calls.

Two loose ends from the workshop, neither blocking:

- An empty `evals/` directory is left over from the earlier layout, where the
  case file and judge prompt were going to live together. Nothing reads it.
- `test_shipped_cases_load_from_the_repo_root` hard-codes the case count and
  fails whenever someone appends a case — which is the one thing students are
  told to do.

Three things a reader should know before continuing:

**The layer 1 baseline is not the baseline the course describes.**
`solutions/layer1/app.py` calls `search_semantic`, not `search_bm25`, so the
"before" in the demo is already layer 2's retrieval and its pass count is
flattering. A true BM25 baseline would score far lower and the climb would be
much steeper. Whether the solution or the docs are wrong is a question for the
course, not for this feature, so nothing here was changed.

**Exact model lookups fail at both layers.** "samsung galaxy s24 fe" and
"oneplus 13" fail whether or not the LLM is in the loop, because cosine
similarity does not privilege an exact name. This is the hybrid-search argument
in `docs/teaching.md` showing up as a number, and it is the most useful thing
the run currently says.

**The judge already catches summary hallucinations.** Several layer 4 cases
failed on a summary claiming something the specs contradict, unprompted by the
expectation. That is `docs/teaching.md`'s fidelity dimension arriving for free,
and worth keeping in mind when writing new cases: they do not need to ask for
grounding to measure it.

Earlier measured baselines (11/20 and 16/20 for layers 1 and 4) were taken
against a 20-case file under an anchored 0–5 judge and do not compare to
anything the current harness prints. `evals.catalogue-tool` needs fresh
baselines before it starts.
