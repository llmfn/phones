# Features

Everything about planning a piece of work lives in this directory. Each `<id>.md`
file is one feature — its plan, its tasks, and its running status, all in one place,
for the whole life of the capability. The plan and the work are the same artifact, so
they can't drift apart.

## Directory Layout

- **`<id>.md`** — one feature, cradle to grave. Its frontmatter `status:` is the only
  marker of where it stands.
- **`archive/`** — frozen records of past work, outside the conventions below.

There's no hand-maintained registry — the directory is the list. From `.features/`, run
`grep '^status:' *.md` to see every feature and its state; `grep -n '\[TODO\]' <id>.md`
shows a feature's remaining work.

## Lifecycle

A feature is **fat while in flight, thin once shipped.**
`status:` marks where it sits:

- **draft** — being shaped; design or tasks still incomplete.
- **ready** — fully specced, not started.
- **in-progress** — being built.
- **done** — shipped.

## The feature file

A feature file always needs a title with a one-line gloss and a `## Tasks` list. Once
someone starts building it, it also needs a `## Handover`. That's the spine.

Everything else is optional. Add ordinary headings, such as a local `## Backlog`, only
when the feature actually needs them. There's no fixed template to fill in, so no
sections get filled out of habit.

Two names are fixed for a reason. `## Tasks` keeps related work grouped consistently,
and `## Handover` gives active work a predictable place for current state. The
`[TODO]` / `[DONE]` task prefixes are what make `grep '\[TODO\]'` answer "what's left."

**Title + gloss.** `# Human Name (id)`, with the id repeated in the title so a reader
seeing only the contents — a diff, a paste — still knows it. Under it, a line or two:
lead with the subject, say concretely what it operates on and returns, then where it's
used.

**Tasks.**

Each substantial task is a heading carrying a status, a short task name, and a short title.
Put the description and acceptance criteria in the body.

```
### [TODO] hybrid-search: blend BM25 and cosine scores

task description

**Acceptance Criteria:**
- [ ] one
- [ ] two
```

Refer to a task from elsewhere as `<feature-name>.<task-name>` (`layer8-evals.golden-set`),
not by its title. Feature names and task names should be either one word or two words
joined by a hyphen.
`[TODO]` / `[DONE]` as a heading prefix means `grep '\[TODO\]'` answers "what's left."

Add an `**Acceptance Criteria:**` checklist when a task has a concrete finish line worth
spelling out — common for technical work — and skip it when the description already says it.
Avoid the temptation to push requirements here. Requirements should be part of the task description
and the acceptance criteria should only tell you how to find if the task is complete.

The difference is whether the line tells you what to build or how to check:

- ✗ `A failed attempt leaves the address sendable` — a requirement; belongs in the description
- ✓ `Tests cover a failed attempt and a corrected address` — how you find out it's done

The edition-1 record in `archive/` predates this convention and carries longer, behavioral
criteria. Don't pattern-match from it.

## Handover

Once building starts, the feature carries a `## Handover` — where it stands in plain
words: what's done, what's next, and anything a reader needs to continue safely. It's
written for a reader, not as a log. Three rules keep it honest:

- It appears when building starts, not before. A feature still being planned has
  nothing to hand off.
- It's rewritten each time a task finishes, so it's never more than one task stale.
- It's deleted when the feature ships. A finished feature has no "next step."

## Archive

`archive/` holds frozen records of work that is over — `first-edition.md` is the
edition-1 build log, kept as written under a short header. Archived files are deliberately
outside every convention above: they don't carry a `status:`, their task headings
don't follow the `[TODO]` / `[DONE]` form, and the greps don't reach them. Nothing
in `archive/` is ever picked up again; if old work turns out to still be live, it
gets shaped as a fresh feature.

## No tooling

Plain markdown is the whole interface. There is no CLI. Creating a feature is writing a
file shaped like the illustrative template below; changing state is editing a heading
or the frontmatter. Don't build a `create` / `close` / `archive` layer — a tool that
knows about the files is the thing that drifts away from them.

## Frontmatter

`status:` and `created:`, nothing more.

## Template

```markdown
---
status: draft
created: 2026-07-06
---

# Feature Name (feature-id)

One-line gloss: lead with the subject, say what it operates on and returns, then
where it's used.

## Design / Approach

<!-- optional: the shape, and the one decision everything else rests on -->

## Tasks

### [TODO] first-task: what it does

Task description.

**Acceptance Criteria:** <!-- optional; add when there's a concrete finish line -->

- [ ] a concretely verifiable condition

## Handover

<!-- added once building starts; rewritten as each task lands; deleted when shipped -->
```
