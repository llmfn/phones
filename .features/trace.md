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

### [TODO] search-detail: the search step opened up

Clicking a search pill unfolds the first detail view in place, accordion
style: BM25 shows the query as sent and per-token match counts; semantic
shows the ranked cosine bar chart with the dashed top-k cutoff, below-cutoff
candidates dimmed. The generic attribute list arrives here (engine, top-k),
as does the raw wire tab showing the step's actual payload.

**Acceptance Criteria:**

- [ ] Over BM25, "samsung 5g" shows which tokens matched and how often;
      "a phone for my mom" visibly matches nothing
- [ ] Over semantic search, the step shows bars with scores and a dashed
      cutoff at top-k, candidates below it dimmed but present
- [ ] The step's attributes render as a name–value list in its detail
- [ ] The raw tab shows the step's actual payload; collapsing the step
      returns the rail to pills, results untouched
- [ ] An unfolded step stays unfolded when the panel changes width

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

`turn-steps` is built and green: `tests/test_trace.py` covers grouping, labels,
and both failure shapes, and the layer-1 and layer-4 solutions were run through
the API for real.

The backend now answers with a turn, not a step list. `RecommendResponse.trace`
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
toggle deliberately does not re-render, so unfolded detail will survive it in
the next slice.

One thing to know: a layer-4 query shows **four** pills, not the three the
criterion names — `llmfn`, `search_semantic`, `rerank_by_persona`, `llmfn`. The
rerank is a real traced step, so the count in the criterion is what is stale,
not the panel.

`search-detail` is next. The panel currently renders no JSON at all, so
`jsonPre` and its `.tok-*` rules came out of `render.js` and `styles.css`; the
`--trace-key` / `--trace-num` / `--trace-dim` tokens are still in the palette
for it to pick back up.
