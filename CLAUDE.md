# phones

Phone recommender app for the [llmfn](https://llmfn.com/) course — its own repo.
One product recommender that students improve layer by layer (search → prompts →
schema → context → state → memory → tool use → evals), with config flags to
enable/disable each layer.

## Layout

- `web/` — static SvelteKit frontend (Cloudflare Pages, no server logic): the
  three-zone UI (layer sidebar, chat canvas, trace panel). See `web/ARCHITECTURE.md`.
- `api/` — the layered recommender backend that owns the 8 layers and builds the
  trace. Stack not yet chosen. See `api/ARCHITECTURE.md`.
- `docs/specs.md` — the product design spec, and the **source of truth for the
  `POST /api/recommend` contract** that joins `web/` and `api/`.

Neither `web/` nor `api/` exists yet — the repo is currently at the spec stage.

### Docs boundary

- `docs/specs.md` = *what* the system should do (design spec, API contract).
- `web/ARCHITECTURE.md` / `api/ARCHITECTURE.md` = *how/why* each side is built
  (tech choices, internal structure). They reference the contract in
  `docs/specs.md` rather than redefining it.

## Task tracking (`.tasks/`)

Work is tracked as plain markdown files in `.tasks/`. Read them, follow these
conventions, and keep them up to date as you work.

### Model

- Everything is a **task**. There is no separate "story" type.
- A task may have **subtasks**. A task that has subtasks acts as a story: the
  parent captures the user-facing intent, the subtasks are the concrete work.
- Two levels only — parent tasks and their subtasks.

### Files & numbering

- **One file per task**, named by its id: `.tasks/T01.md`, `.tasks/T01.1.md`.
- Parent tasks: `T01`, `T02`, … (two-digit, zero-padded).
- Subtasks: `<parent>.<n>` → `T01.1`, `T01.2`, …
- A parent's subtasks are every file matching `T01.*.md`.

### File format

Every task file — parent or subtask — has the same shape:

```markdown
---
status: open        # open | in-progress | done
depends_on: []      # task ids that must be done first, e.g. [T01.1, T02]
---

# <short title>

## DESCRIPTION

Free-form prose describing what and why. May use sub-headings for longer tasks.

## ACCEPTANCE CRITERIA

- [ ] checklist bullet
- [ ] checklist bullet
```

- `status` — `open`, `in-progress`, or `done`.
- `depends_on` — list of task ids this task is blocked by. Empty list = no blockers.
- **DESCRIPTION** is required: what & why, free text, optional sub-headings.
- **ACCEPTANCE CRITERIA** is required: checklist bullets. They are the source of
  truth for "done" — tick them (`- [x]`) as each is met.

### Working with tasks

- **List** — read the files in `.tasks/`.
- **Pick next** — the lowest-numbered task with `status: open` whose every
  `depends_on` id is `done`. Finish a parent's subtasks before moving on.
- **Start** — set `status: in-progress` before working on it.
- **Finish** — tick all acceptance criteria, then set `status: done`.
- **Create** — add a file with the next free id, fill in DESCRIPTION +
  ACCEPTANCE CRITERIA, set `status: open`, and list any `depends_on` blockers.

### Conventions

- Keep DESCRIPTION accurate if scope changes; the acceptance criteria define done.
