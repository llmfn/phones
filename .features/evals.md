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
phone for my mom" scores 1; run it against `solutions/layer4` and it scores 4.
The scores climbing across layers is the course's closing argument. An
expectation written against a stage would break that and is a review reject.

### The app runs its own evals

`app.py --eval` scores the eval file against that app. No separate runner
script, no `--app` flag pointing at someone else's file: which layer gets
measured is which `app.py` you invoke.

```sh
uv run python app.py --eval                    # your app
uv run python solutions/layer4/app.py --eval   # a worked solution
```

`Application.run()` dispatches on argv — a mode its docstring already promises
("CLI when invoked with a query, the dev server otherwise") and does not yet
implement. `--eval` is the first argv mode to land.

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
each product's name, brand, price, and a compact spec projection, plus the
summary when the layer produces one. It does not see the catalogue.

Decided, not overlooked. A judge that can browse all 136 phones becomes a
second recommender, and a disagreement then has two possible causes — the app
missed a phone, or the judge decided it should have been there — with no way to
tell them apart. Closed-book grading is also reproducible and cheap. Prose
expectations about prices and counts still work, because the prices are in the
evidence. Giving the judge the catalogue is a deliberate later step
(`evals.catalogue-tool`), taken once baselines are stable enough to compare
against.

### Scoring

The judge returns an anchored score of 0–5 and a one-line reason. The rubric
anchors live in the judge prompt: what a 0, a 3, and a 5 look like. A pass is
derived, `score >= 4`, and the headline is a pass count — an unanchored average
drifts between identical runs and cannot gate anything. The score survives
alongside it because watching a case move 1 → 3 → 4 across layers is most of
the value.

### Layout

- `evals/evals.yaml` — the flat file, the only thing most people touch, shared
  by every layer
- `evals/judge.md` — the judge prompt, read and edited like any other prompt
- `phonekit/evals.py` — the machinery `Application.run()` dispatches into

Both files sit at the repo root, not beside a layer's `app.py`: `read_file`
anchors to the layer directory and would give each layer its own copy, which is
exactly what this feature must not have. `phonekit/evals.py` resolves them the
way `catalog.py` resolves `data/phones/`. The prompt stays outside phonekit
because phonekit holds no prompts, and because a judge you cannot read is a
judge you cannot trust — reading it is part of the lesson.

### Non-goals for this version

Single-query only: each case runs one query through the layer's `search`. It
therefore never exercises chat, memory, or tool use, so layers 5–7 are measured
only through their opening search. Named rather than hidden. The case schema
leaves room for a later `turns:` list beside `query:`, so nothing written now
is invalidated by adding multi-turn cases.

## Tasks

### [DONE] basic: score the eval file against any layer

`app.py --eval` runs every case in `evals/evals.yaml` through this app's
`search`, judges each closed-book against `evals/judge.md`, and prints a table
of query, score, verdict, and reason followed by a summary line —
`17/20 passed · avg 4.1`. Exit non-zero when any case fails, so it can gate a
prompt change.

A case is `query` (the user's words, as typed) and `expect` (prose describing a
good answer). Seed roughly 15–20 spanning the query kinds the course uses:
literal model lookups Layer 1 already handles, vibe queries only Layers 2+ can
serve, budget-constrained queries, persona queries. The mix matters — a file
where everything fails at Layer 1 shows no progression, one where everything
passes measures nothing.

Judge evidence is capped at the top 5 products and excludes narratives: the
judge grades the recommendation, not the catalogue's marketing copy. Cases run
through a small `ThreadPoolExecutor` — the trace is `ContextVar`-scoped and
already isolates per thread. Each case goes through `Application.run_query`,
which turns a pipeline exception into an empty result set with the error on the
turn, so a crashing case scores 0 and reports why instead of aborting the run.

One thing to fix along the way: `phonekit.memory` reads and writes one fixed
`data/memory/memory.json`, so a run against layers 6–7 would cross-contaminate
cases and overwrite the profile of whoever is using the app. It needs a seam
for pointing at another path — the same shape as `Session.configure_root` — and
`--eval` points it at a scratch file it discards.

**Acceptance Criteria:**

- [ ] `uv run python solutions/layer1/app.py --eval` and the layer 4 equivalent
      both produce a table, and layer 4's pass count is the higher of the two
- [ ] Every `expect` reads as a statement about the answer a user wanted, with
      no mention of a layer, pass, prompt, schema field, or function
- [ ] A test with a stubbed client asserts the judge evidence carries no
      narrative text and at most 5 products
- [ ] A case whose pipeline raises appears in the table with score 0 and the
      error text, and the remaining cases still run
- [ ] A full run against `solutions/layer6` leaves `data/memory/memory.json`
      unchanged
- [ ] Bare `uv run python app.py` still serves, and reload still works

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
- [ ] With the tool on, scores for the same eval file are recorded beside the
      closed-book scores for at least two layers, so the divergence is visible

## Handover

`evals.basic` is done and `evals.catalogue-tool` has not been started. The
harness works end to end: `evals/evals.yaml` (20 cases) and `evals/judge.md`
hold the content, `phonekit/evals.py` the machinery, and `Application.run`
dispatches `--eval` before it reaches Flask. `make eval` runs it against the
skeleton. Covered by `tests/test_evals.py`, which stubs the judge, so the
suite makes no network calls.

Measured baselines, the numbers `evals.catalogue-tool` compares against:

| Layer | Passed | Avg | Wall |
|---|---|---|---|
| `solutions/layer1` | 11/20 | 3.2 | 19s |
| `solutions/layer4` | 16/20 | 4.1 | 25s |

Three things a reader should know before continuing:

**The layer 1 baseline is not the baseline the course describes.**
`solutions/layer1/app.py` calls `search_semantic`, not `search_bm25`, so the
"before" in the demo is already layer 2's retrieval and 11/20 is flattering. A
true BM25 baseline would score far lower and the climb would be much steeper.
Whether the solution or the docs are wrong is a question for the course, not
for this feature, so nothing here was changed.

**Exact model lookups fail at both layers.** "samsung galaxy s24 fe" and
"oneplus 13" score 1–2 whether or not the LLM is in the loop, because cosine
similarity does not privilege an exact name. This is the hybrid-search argument
in `docs/teaching.md` showing up as a number, and it is the most useful thing
the run currently says.

**The judge already catches summary hallucinations.** Several layer 4 cases
lost a point for a summary claiming something the specs contradict, unprompted
by the expectation. That is `docs/teaching.md`'s fidelity dimension arriving
for free, and worth keeping in mind when writing new cases: they do not need to
ask for grounding to measure it.
