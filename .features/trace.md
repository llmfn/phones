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
search pill, layer 4 shows four.

**Acceptance Criteria:**

- [x] Running the layer-1 solution, a query shows one turn: its input and a
      single labeled search pill
- [x] A layer-4 query shows one turn with a pill per step in pipeline order, each
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
shows the ranked cosine bar chart with the dashed min-score cutoff, below-cutoff
candidates dimmed. The generic attribute list arrives here (engine, min score),
as does the raw wire tab showing the step's actual payload.

**Acceptance Criteria:**

- [x] Over BM25, "samsung 5g" shows which tokens matched and how often;
      "a phone for my mom" visibly matches nothing
- [x] Over semantic search, the step shows bars with scores and a dashed
      cutoff at the min score, candidates below it dimmed but present
- [x] The step's attributes render as a name–value list in its detail
- [x] The raw tab shows the step's actual payload; collapsing the step
      returns the rail to pills, results untouched
- [x] An unfolded step stays unfolded when the panel changes width

### [DONE] llm-detail: the llm-call step opened up

The layers-2-through-4 experience completed. An llm-call step's detail
renders by role — System, Input, Response — as literal text, its attributes
(such as the model used) in the same generic list the search step uses, and
a raw tab showing the exact provider payload.

**Acceptance Criteria:**

- [x] No double-encoded JSON or escaped `\n` anywhere in the llm detail
- [x] The step's attributes render in the same name–value list as the search
      step's, with no bespoke treatment
- [x] The raw tab matches what actually went to the provider

### [DONE] live-steps: steps appear as the pipeline runs

Liveness across the whole panel, landing now that the layer-4 pipeline gives
it something to dramatize. Steps show up when they start, the active one
marked running, and settle with status and latency when they finish — the
response no longer has to land before the turn appears. A running step offers
no detail; its detail becomes available when it settles.

Both actions a session is made of, not just the opening search: from layer 5
on the follow-up is where most of the pipeline runs, and a panel that went
quiet after the first query would be showing the smaller half of the work.
Chat turns therefore get an envelope and appear as turns of their own here;
what a chat step *contains* stays with `chat-turn`.

**Acceptance Criteria:**

- [x] During a layer-4 query the steps appear one after another, the active
      one marked running
- [x] A step that errors settles live as an error while later steps never
      appear
- [x] A settled turn is identical to what the pre-liveness rendering showed
- [x] A step opened while a later one is still running is still open once the
      turn settles
- [x] A layer-5 follow-up appears as a second turn group under the first, its
      steps arriving the same way a search's do

### [TODO] chat-turn: what a chat turn shows

The layers-5-and-6 experience. The chat turn's llm step shows the full
message list, unwindowed, with the growth count line; memory folded into the
system prompt renders highlighted within that literal text. The turn itself —
appended to the session, traced, live — arrived with `live-steps`.

**Acceptance Criteria:**

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

`live-steps` is built and green, for search turns and chat turns alike.

**The shape: the panel watches a second endpoint rather than the answer's own
response.** Each action mints a run id, sends it as `X-Run-Id`, and polls
`GET /api/trace/<run_id>?since=<version>` while the work happens.
`/api/recommend` is untouched — same request, same body, same turn — which is
why "a settled turn is identical to what the pre-liveness rendering showed"
is a fact rather than an argument: the response is still what the panel
settles on. The alternative considered and dropped was streaming the turn out
of `/api/recommend` as NDJSON. It reads tidier until you notice a generator
cannot yield from inside `add_step` three frames down, so it buys liveness
with a worker thread, a queue and a sentinel; polling leaves the pipeline
running exactly where it always ran.

The poll **blocks** (`TraceRun.poll`, up to `trace.POLL_TIMEOUT`, 25s) until
the run's version passes the one the browser holds, and answers with only the
steps stamped after it. That is what keeps a six-second query to about five
requests instead of thirty — measured: layer 4 spends 8 requests on an
11-second query, the scratch pipeline 5 on a 6.5-second one. A timeout
answers with an unchanged version and an empty delta, which the panel reads
as "ask again". Per-step stamps are not decoration: changes are not
tail-only, because a step nested inside another settles behind it.

**`new_step` now records on entry, not on exit.** The step goes in as
`status: "running"` and is replaced in place when the block leaves — that is
the whole liveness mechanism, and `"running"` is the one `TraceStep` status a
finished response never carries. Two consequences worth knowing:

- Recorded order is now **start order**, so a `tool_call` lands *after* the
  `llmfn` containing it. The old handover warned `tool-calls` about the
  reverse; that warning is now void, and the new order is the one the reader
  lived through.
- `trace.collect()` reads the same list the poller is reading. There is one
  store, not two — `_run` holds a `TraceRun`, and every read and write goes
  through its condition's lock.

`run_chat` mirrors `run_query`: it resets the trace, times the turn, and
returns `(reply, TraceTurn)`, which `/api/conversation` now includes as
`trace`. A chat hook that raises answers with its own error message and an
error turn instead of a bare 500 — a small behavior change, made because a
broken chat turn should be readable in the panel.

On the browser side, **`renderTrace` patches instead of rebuilding**. It has
to: a step the reader unfolded holds its open state in the DOM, and the panel
now re-renders on every delta. A turn node survives while its client-side
`id` matches, a pill survives while `index|name|status|latency` matches, and
anything else is replaced outright. The turn id is minted by `startTurn` and
**carried across settling** (`{...settled, id: turn.id}`) — without that, the
authoritative turn looks like a different turn and the reader's open step
snaps shut at the last moment. A near-identical bug is what the browser
caught: a new search reused the previous turn's `<li>`, inheriting its
`data-started`, so the running clock read 8001 ms for a turn the server timed
at 6504 ms.

Every mutator in `state.js` takes the turn *object* and checks
`state.turns.includes(turn)`. That one check is what makes an abandoned
turn's late delta a no-op, with no generation counter to keep in step — a new
search replaces `state.turns`, and the old watcher's writes stop landing on
their own.

A running pill is a `<span>`, not a `<button>`, and carries no `.step-detail`
at all; `toggleStep` guards on the missing detail rather than on a class. Its
latency is the browser's own clock (one 100ms interval for the whole panel,
stopped when nothing is running), replaced by the server's measurement the
instant the step settles.

Verified in headless Chrome at 1440 and 1600: steps appearing one at a time
with the dot pulsing on the active one; a step opened mid-flight still open
after the turn settled; a failing pipeline settling the failing step as an
error with nothing after it; a second search abandoning the first without
leaving a turn or a poll behind; and a three-turn session — one search, two
follow-ups — with no step outside its turn. Then one real layer-4 query,
where the 8-second rewrite step is visible the whole time it runs. That is
the slice in one screenshot.

Things worth knowing before the next slice:

- **Poll deltas carry whole steps**, including an llm step's entire provider
  response. A settled step must be openable while a later one runs, so the
  payload cannot be trimmed to labels. It is re-sent once per step, not once
  per tick, so this only ever costs what the step itself weighs.
- **`copy as JSON` mid-query copies running placeholders**, which is what the
  panel is showing at that moment. Left as is deliberately.
- **`docs/specs.md` does not describe any of this**, and already carries a
  warning that its trace shape is out of date (it still shows a flat step
  array). The contract additions here — the `X-Run-Id` header, the trace
  endpoint, `trace` on the conversation response — are worth folding in
  whenever that file gets its pass.
- **Three tests use threads** (`test_a_poll_waits_for_the_pipeline_rather_than_polling_it`
  is the one that matters: it pins that a poll with nothing to say does not
  answer, and that a step landing wakes it well inside its own timeout). They
  are gated on events rather than sleeps; the first draft passed by luck and
  was rewritten.
- **Flask serialises with `sort_keys=True`** — carried forward from the last
  slice, because it still bites. Anything whose order carries meaning must be
  a list, not an object. The attribute list iterates `Object.entries`, so its
  rows are alphabetical in the browser and insertion-ordered in a fixture;
  nothing should depend on that order.

`chat-turn` is next, and it is now purely about what a chat step *shows*: the
unwindowed message list with its growth count line, and memory highlighted
inside the literal system text.
