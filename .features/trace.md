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

`llm-detail` is built and green. An llm step opens into System / Input /
Response as literal text, its model and schema in the same name-value list the
search step uses, and a raw tab holding the request the provider received and
the response it sent back.

The step is no longer produced by the `trace.trace_function` decorator, and
that is the whole slice. The decorator recorded `llmfn`'s own arguments, which
is why the panel showed a prompt as `"You are...\n\nRules:\n- ..."` and layer
4's summarize input as a JSON string holding another one. `llmfn` now curates
its step with `new_step`, and what it records is the **request itself**:
`_create_response` is split into `_build_request`, which returns the keyword
arguments, and `_send`, which runs them. The step's `input.request` is that
same dict, so the formatted view and the raw tab read one object and the panel
cannot drift from what was sent. `trace._jsonable` became `trace.jsonable` for
the same reason -- a step curating its own payload needs it.

The payload is `input: {model, request}` and
`output: {text, parsed, response_id, response}`. `text` and `parsed` are what
the body renders literally; `response` is `Response.model_dump()`, the whole
object, which is what the raw tab shows and where `tool-calls` will find its
rounds. It carries `usage`, so token counts arrive as attributes whenever they
are wanted, with no design change. Note the provider resolves the model alias:
the request asks for `gpt-5.4-mini` and the response says
`gpt-5.4-mini-2026-03-17`. Both are visible, which is the point.

**`text_format` is the one place the trace departs from the literal kwargs.**
`_traceable` expands the schema class into `model_json_schema()`, because a
class name is the one thing in the request a reader cannot act on: "Schema"
says a schema was used without saying what was asked for. The expansion is what
the provider is actually given, and it carries the field descriptions the layer
wrote, so the panel renders it as a **schema asked for** block sitting between
the input and the response -- the contract next to the answer. Everything else
in `request` is the kwargs verbatim, and a test pins that the two differ in
exactly this one key.

The line the raw tab draws is still the SDK call, not the HTTP body. Going a
layer lower means hooking the client's transport, which is not worth it in a
teaching app.

`llmBody` in `render.js` renders the three roles off `request`. Structured
output shows `parsed` pretty-printed rather than the raw JSON text, since that
object is what the layer's own code goes on to use. `llmInput` renders a
message list as role-labelled rows -- enough that layer 5 does not fall apart
today; the count line and the highlighted memory are `chat-turn`'s work.

Two blocks of CSS matter. `.detail-scroll` caps long literal content and lets
it scroll inside itself -- 260px in the rail, 460px at full width, so the toggle
changes the room and never the content. It wraps the **raw pane too**, which is
not cosmetic: an llm step's raw payload holds the entire provider response, and
before the cap an open raw tab measured 5,593px tall and buried every step
under it. `pre.wrapped` wraps the structured response's long strings instead of
giving an already-scrolling block a second scrollbar; the raw tab keeps its
side-scroll, where structure is what you are scanning for.

Labels landed with it, as the last handover asked. `llmfn` takes `label=`, and
`solutions/layer2`, `layer3`, and `layer4` name their calls "rewrite" and
"summarize" -- layer 4 no longer shows two pills that both read "llm call".
Layers 5-7 still pass none; theirs belong with `chat-turn` and `tool-calls`.

Three tests in `tests/test_trace.py` pin it, all offline against a stub
provider (the `fake_llm` fixture): that the traced request is the same dict the
client was handed, that a prompt carrying newlines and indented JSON survives
as itself, and that structured output records an object, expands the schema,
and lets `label=` override the default. The untracked `tests/test_llm_tools.py` exercises the
tool-round path through the refactor and passes unchanged -- worth landing, but
it is yours to stage.

Verified end to end in headless Chrome against layer 4 on a spare port, at 1440
rail, 1440 full, and 900. Both llm steps open showing system/input/response,
the rewrite step carrying its schema block between them; attributes read
`model` and `response id` and nothing else; no escaped `\n` anywhere; the
summarize input renders its embedded catalogue JSON indented.
Open steps and the selected tab survive the width toggle, only the scroll cap
changes (260 to 460), collapsing leaves the 69 results untouched, and nothing
overflows horizontally at either width. The raw-pane height was the one real
bug the browser caught, and only after clicking through to the raw tab -- worth
doing on every future step kind, since the formatted view is the one you look
at by habit.

Things worth knowing before the next slice:

- **Open state lives in the DOM** (`.step-item.is-open`), not `state.js`,
  because nothing re-renders a turn once it lands. `live-steps` changes that:
  appending steps mid-turn means lifting that state or appending to the
  existing list rather than rebuilding it. `stepDetail` is a pure step -> node
  function either way.
- **Flask serialises with `sort_keys=True`.** Anything whose order carries
  meaning must be a list, not an object -- that killed a whole slice once, when
  the fixture page and the browser disagreed because only one of them went
  through Flask. The attribute list iterates `Object.entries`, so its rows are
  alphabetical in the browser and insertion-ordered in a fixture; nothing
  should depend on that order.
- **A tool call's step is recorded before the `llmfn` step that contains it**,
  since `new_step` writes on exit. `tool-calls` has to render the call inside
  the response, so it will need to read the rounds out of `output.response`
  rather than trust the flat order.
- **Two criteria above are stale, not the panel.** `search-detail` says
  "top-k" where the cosine chart draws the engine's `min_score` (0.3);
  `turn-steps` says three pills where layer 4 shows four -- `rerank` is a real
  traced step.

`live-steps` is next.
