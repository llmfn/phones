---
status: in-progress
created: 2026-08-07
---

# Trace Panel (trace)

The X-Ray panel redesigned: a live, session-scoped trace of what the app did to
answer each turn — steps grouped under the turn that produced them, each step
rendered by what it is (LLM call, search, tool call) as literal content rather
than raw JSON. One panel at two widths — a rail beside the results, growable
to the full page — used by workshop participants to see, question, and debug
every layer's pipeline.

## Design

This is a product spec: what the participant sees and what information is
presented. How it is produced is decided when the work is shaped for building.

### Scope: one session, in full

The panel covers the current session — the initial search and every follow-up
chat turn — and accumulates as the conversation grows. A new search starts a
new session and a fresh panel.

Decided, not overlooked: there is no cross-session history and no side-by-side
comparison of past runs. At layers 1–4, where sessions are single-turn, a new
query therefore replaces the panel, as today. The redesign's promise there is
the richness of that one turn, not persistence; comparing runs across code
changes is done with two browser windows.

### The surface

One trace panel at two widths. The rail sits beside the results, about a
third of the page; a control on it grows the panel to full-page width and
back. Both widths show the same structure and content — full-page exists
because long content (prompts, message lists) is hard to see all at once in a
third of a page. It is optimized for the student reading, and it is never
entered as a side effect of clicking into a step; whatever was unfolded stays
unfolded across the toggle.

Four levels of disclosure, all available at either width:

1. **Turn summary** — one line per turn: the user's input, the sequence of
   step names, total latency. `rewrite → search → summarize · 5.96s`.
2. **Step pills** — expanding a turn shows one pill per step: purpose label,
   status, latency.
3. **Step detail** — clicking a pill unfolds its detail in place,
   accordion-style, rendered by step type (below). Other turns and pills stay
   visible; several details can be open at once.
4. **Raw wire** — inside every step detail, a raw tab: the exact payload sent
   and received, unformatted. Not just LLM steps.

### Live steps

Steps appear as the pipeline runs, not when the response lands: a completed
step shows its latency, the active step shows a running indicator, steps not
yet started are absent. A six-second query becomes six seconds of visible
work — the wait itself teaches where the time goes.

### Step types and their views

**LLM step.** Rendered by role, never as one JSON blob:

- *System* — the instructions as literal text. When memory is folded in, the
  memory sentences are highlighted within that text — not shown as a separate
  object, because the model never sees them as one.
- *Tools* — the tools available to this step as chips, shown even when none
  was called; a chip expands to the full schema. Available is distinct from
  called.
- *Input* — the literal user text, or for chat turns the full message list,
  unwindowed and unsummarized, with a count line that makes growth explicit:
  `9 messages this turn · 11 next turn`.
- *Response* — the literal output text. A tool call renders inline within the
  response as a card — tool name, arguments, return value — followed by the
  model's continuation, in the order the model experienced it:
  call → result → keep generating.
- *Attributes* — any named values the step carries (the model used; token
  usage, when added later), rendered as a plain name–value list.

**Search step.** Not a JSON array; rendered by engine:

- *BM25* — the query as sent, then per-token match counts: which tokens hit,
  how often, and what that ranked. A whiffed vibe query visibly matches
  nothing — that failure is layer 1's lesson.
- *Semantic* — a ranked bar chart: one row per candidate (name, bar length
  proportional to cosine score, score numeral), a dashed cutoff at the top-k
  boundary passed downstream, below-cutoff candidates dimmed but shown.

**Any step.** A plain-language purpose label ("rewrite", "summarize"), status
(success / fallback / error / skip) with the error message when failed, and
latency. A step's detail also renders whatever attributes it carries — a
generic name–value list (a search step's top-k, an llm-call step's model) —
so new information joins the panel as an attribute first, with no design
change. Unrecognized step shapes fall back to formatted JSON rather than
breaking the panel.

### Principles

1. **Never paraphrase.** Every string shown is the literal string sent or
   received, or is explicitly labeled as the output of a real pipeline step.
   The panel writes no editorial descriptions of its own.
2. **Group steps under the turn that produced them.** Never flat siblings
   across turns.
3. **Available tools are shown distinctly from called tools.**
4. **Tool calls render inline in the response**, in call → result →
   continuation order.
5. **Every step carries a purpose label**, not just an internal function name.
6. **Raw wire view for every step type.**

### The panel grows with the course

Layer 1's trace is a single search step, and the panel must be excellent with
exactly that — day one is where it earns trust. Each layer adds visible steps
or enriches existing ones: rewrite appears at layer 2, the summarize step at
layer 4, the message list growing at layer 5, highlighted memory at layer 6,
inline tool cards at layer 7. The panel's own before/after is each layer's
story told visually.

### Numbers and attributes

Latency is the only number with a reserved place: always visible at every
level — turn summaries and step pills carry it without any unfolding.
Everything else rides the attribute list in a step's detail, rendered the
same way for every step kind. Token usage and cost are deliberately not
specced now; when wanted, they arrive as attributes of the steps that
incurred them, with no change to the panel's design.

## Tasks

Vertical slices, built incrementally. The first slice is the skeleton — the
user's input and its steps, with no detail views at all. The next slices open
up the detail for one step kind at a time (search, then llm-call). Liveness
lands right after that — once the multi-step, multi-second pipeline it
dramatizes exists; until that slice, the panel renders when the response
lands. Then the chat turn kind, then tools. Finishing a slice always leaves
the panel demoable against real layer solutions; there are no horizontal
tasks.

### [DONE] turn-steps: turns and their steps, no detail yet

The skeleton. A query produces a turn in the rail — the user's input, then
one pill per step with its purpose label, status, and latency, in pipeline
order. Pills open nothing yet, and the turn renders when the response lands.
The width toggle also lands here: the panel grows from rail to full-page
width and back, same content with more room. Because pills need only a label
and timing, this slice already works for every step kind: layer 1 shows one
search pill, layer 4 shows three pills.

**Acceptance Criteria:**

- [x] Running the layer-1 solution, a query shows one turn: its input and a
      single labeled search pill
- [x] A layer-4 query shows one turn with three pills in pipeline order, each
      with status and latency
- [x] A query that fails still shows its turn, the failing step marked as an
      error, with no steps after it
- [x] Toggling between rail and full-page width changes nothing but the room
      the same content gets
- [x] Latency reads from the rail with nothing unfolded; no number besides
      latency appears anywhere

### [DONE] search-detail: the search step opened up

Clicking a search pill unfolds the first detail view in place, accordion
style: BM25 shows the query as sent and per-token match counts; semantic
shows the ranked cosine bar chart with the dashed top-k cutoff, below-cutoff
candidates dimmed. The generic attribute list arrives here (engine, top-k),
as does the raw wire tab showing the step's actual payload.

**Acceptance Criteria:**

- [x] Over BM25, "samsung 5g" shows which tokens matched and how often;
      "a phone for my mom" visibly matches nothing
- [x] Over semantic search, the step shows bars with scores and a dashed
      cutoff at top-k, candidates below it dimmed but present
- [x] The step's attributes render as a name–value list in its detail
- [x] The raw tab shows the step's actual payload; collapsing the step
      returns the rail to pills, results untouched
- [x] An unfolded step stays unfolded when the panel changes width

### [TODO] llm-detail: the llm-call step opened up

The layers-2-through-4 experience completed. An llm-call step's detail
renders by role — System, Input, Response — as literal text, its attributes
(such as the model used) in the same generic list the search step uses, and
a raw tab showing the exact provider payload.

**Acceptance Criteria:**

- [ ] No double-encoded JSON or escaped `\n` anywhere in the llm detail
- [ ] The step's attributes render in the same name–value list as the search
      step's, with no bespoke treatment
- [ ] The raw tab matches what actually went to the provider

### [TODO] live-steps: steps appear as the pipeline runs

Liveness across the whole panel, landing now that the layer-4 pipeline gives
it something to dramatize. Steps show up when they start, the active one
marked running, and settle with status and latency when they finish — the
response no longer has to land before the turn appears. A running step offers
no detail; its detail becomes available when it settles.

**Acceptance Criteria:**

- [ ] During a layer-4 query the three steps appear one after another, the
      active one marked running
- [ ] A step that errors settles live as an error while later steps never
      appear
- [ ] A settled turn is identical to what the pre-liveness rendering showed

### [TODO] chat-turn: the chat action as a second turn kind

The layers-5-and-6 experience. A follow-up message appends a chat turn to the
session; turns accumulate and nothing from earlier turns is lost. The chat
turn's llm step shows the full message list, unwindowed, with the growth
count line; memory folded into the system prompt renders highlighted within
that literal text.

**Acceptance Criteria:**

- [ ] A layer-5 follow-up appears as a second turn group under the first; a
      three-turn session shows three groups with no step outside its turn
- [ ] The chat step lists every prior message and states the count this turn
      and next
- [ ] In layer 6, the memory sentences are visibly highlighted inside the
      system text, not shown as a separate object

### [TODO] tool-calls: tools on llm steps

The layer-7 experience. An llm step shows its available tools as expandable
chips whether or not one was called; a call renders inline in the response as
a card — name, arguments, return value — followed by the model's
continuation, in call → result → continuation order. The raw view includes
the follow-up rounds.

**Acceptance Criteria:**

- [ ] A layer-7 store-finder turn shows the call's arguments and result
      between the model's earlier text and its final reply
- [ ] A chat step where no tool was called still shows the store finder as an
      available chip, expandable to its schema
- [ ] The raw view includes the tool-round follow-up payloads, not just the
      first request

## Handover

`search-detail` is built and green. Clicking a pill unfolds its detail in
place; several can be open at once, and collapsing one leaves the results and
every other open step alone.

The detail is one generic shell for every step kind, not a search-specific
view: `stepDetail` in `render.js` renders a formatted/raw tab pair, picks the
formatted body by step name out of `STEP_BODIES`, and appends whatever values
the body did not itself show as a name–value list. `search_bm25` and
`search_semantic` have real bodies; everything else falls to `fallbackBody`,
which prints input and output as formatted JSON — so an llm step is already
readable today, and `llm-detail` is a body function plus its CSS rather than
another shell. The raw tab is the whole step envelope as it came over the
wire, `jsonPre` and the `.tok-*` rules restored from a43a178^.

The cutoff drawn across the cosine chart is the engine's `min_score` (0.3),
not a top-k — `search_semantic` has no k. The criterion above still says
"top-k"; the panel is what is right, the wording is what is stale, but I left
it for you rather than editing the task. `shown_scores` is capped at ten, so
the chart shows the top ten of however many qualified; the attribute list
carries `ranked candidates` and `qualifying` so the gap is visible rather than
implied. A query where everything falls below the line ("a tractor for
ploughing fields") renders every row dimmed with the cutoff near the right
edge, which reads well as the failure it is.

The BM25 view is built around one thing the first version got wrong: it showed
`pink` in 15 phones, `phone` in 62, and 5 results, and those three numbers do
not compose. They are two different mechanisms — presence decides membership,
frequency and length decide rank — so the detail now shows them as two bands.
**Tokens** is the catalogue: how many phones hold each word out of how many,
and the weight rarity earns it, both identical for every result, closing on
`holding every token → 5 phones`, the AND that is never merely the smallest
count above it. **What that ranked** is the documents: a bar per phone split
into a segment per token carrying that token's contribution, and under it the
quantities that actually differ between rows — `pink ×4 · phone ×1 · 196
words`. A token that matched nothing shows no weight at all: idf rewards
rarity, so a word in zero documents scores 5.61, which would read as "this word
counts for a lot" about a word that counts for nothing.

That did need an engine change. `search_bm25` now traces `tokens`
(matches + weight per token), and per ranked phone its `length` and per token
`{count, score}` — all of it already computed in the scoring loop and
previously discarded. `k1`, `b`, and the average document length ride the
attribute list; the arithmetic is reproducible from the raw tab. The old
`token_match_counts` key is gone, replaced by `tokens`.

Both are **lists, not objects, because their order carries meaning**: heaviest
word first, so the token band reads as a ranking and each token keeps its
place — and its colour — down every bar in the chart. This is worth knowing
before adding another ordered field. The first version emitted objects and let
dict order carry it, which held inside Python and then died on the wire:
Flask serialises with `sort_keys=True`, so the panel was ordering tokens
alphabetically while the fixture page, written with plain `json.dumps`, kept
query order. The two disagreed for a whole slice because they were checked
separately. Sorting misses last is deliberate too — a word in zero documents
has the highest idf there is, so ranking on the raw weight floats exactly the
words that matched nothing to the top.

`search_semantic` needed nothing: it already traced everything its view draws.
Two tests (`tests/test_trace.py`) pin the BM25 payload, both offline — on a
query that whiffs, that the tokens nothing holds are reported and sort last;
on `pink phone`, that the result count never exceeds the smallest per-token
count, that the band is ordered by descending weight, that every ranked phone
lists its tokens in that same order, and that a phone's per-token scores sum
to its total. The semantic payload has no test: asserting it needs a query
embedding, so its shape is verified visually instead.

Verified in headless Chrome two ways: against a fixture page holding real
captured trace steps, at 1440 and 900 wide, and then end to end against
running servers — the layer-1 solution for the semantic view (one pill, ten
candidate rows, 21 results, detail still open across the width toggle, results
untouched on collapse), and a throwaway layer swapping in `search_bm25` for
the keyword view, since no solution uses that engine. Four bugs came out of
those passes and are fixed: the open step overflowed the rail until
`.step-item` got `min-width: 0` (its `<pre>` now scrolls inside itself), the
fallback body was repeating its own JSON in the attribute list, the token
band's weight column clipped its own header, and the token ordering above.
The last one is the reason to trust the browser over the fixture when they
disagree: only one of them goes through Flask.

`llm-detail` is next, and the label point below still stands — worth doing
first so layer 4 stops showing two pills that both read "llm call".

The backend answers with a turn, not a step list. `RecommendResponse.trace`
is a single `TraceTurn` — kind, the input that produced it, its steps, status,
latency, and the error message when the pipeline threw. `Application.run_query`
builds it and no longer lets a pipeline exception escape: a failed query comes
back HTTP 200 with empty products and a turn holding everything that ran up to
the failure. This is the one deliberate departure from the plan we agreed
(which said 500 with the trace in the error body) — the response is a valid
`RecommendResponse`, so the panel keeps a single render path and the failure
surfaces where it teaches.

Steps carry a `label`, the plain-language purpose the pills show, defaulted from
the step name via `trace.DEFAULT_LABELS` and overridable per call
(`trace.new_step(..., label="summarize")`). Nothing in `solutions/` was touched,
so layer 4 currently shows two pills both reading "llm call" — the rewrite and
the summarize. Making those read their real purpose means passing `label=`
through `llmfn` from the layer's own code; worth doing before `llm-detail`.

The panel is pinned to the window rather than riding in the shell grid: fixed
to the right edge, the full height of the viewport, head parked and only the
turn list scrolling. The page holds that width open through `--gutter-right`
on `.app`, the single knob every rule that cancels the reservation turns; the
rail rejoins the flow as a full-width band below 1100px. Full width is now the
pinned panel widening to `100vw`, not a grid span.

All of it was checked in headless Chrome against the layer-4 solution at 1440
and 900 wide: the panel holds the right edge at full height, the page scrolls
under it without moving it, a long turn list scrolls inside the panel with the
head staying put, and expand/collapse round-trips the same content. The width
toggle does not re-render, which is what carries an unfolded step across it.

One thing to know: a layer-4 query shows **four** pills, not the three the
criterion names — `llmfn`, `search_semantic`, `rerank_by_persona`, `llmfn`. The
rerank is a real traced step, so the count in the criterion is what is stale,
not the panel.

Open state lives in the DOM (`.step-item.is-open`), not in `state.js`, because
nothing re-renders the turn once it lands. `live-steps` changes that: when it
starts appending steps mid-turn it will need to lift that state, or append to
the existing list rather than rebuild it. `stepDetail` is a pure step → node
function so it can be reused either way.
