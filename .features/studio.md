---
status: in-progress
created: 2026-08-17
---

# Studio (studio)

The student's studio at `/studio` on their own hostname: four panels
that edit the sections of their siteconfig, each save appending a revision that
goes live, and a history hanging off the revision indicator. Nothing runs here
— the public site is where the site runs.

## Design / Approach

### The one decision everything rests on

**The studio edits configuration and does nothing else.** No query box, no
results, no trace rendering — one run surface exists, the public site, and the
studio is the console that changes what it does. The working loop is two tabs:
save here, reload there.

That keeps one rendering of results and one trace panel to build and trust,
both delivered by `web-search`, instead of a second copy living inside the
studio and drifting from the first. And it keeps the studio's own scope
honest: every control on every panel writes the config document, and anything
that doesn't is in the wrong place.

### The rail is the siteconfig

One panel per section of the schema — Search, Prompts, Design, Evals — and no
other entries. A student who has read the config document knows the whole
studio, and a new section of the schema is a new panel rather than a redesign.

Prompts is the one section that expands: each prompt gets its own rail entry
and its own page, because each is edited on its own and the editor wants the
room. The heading still names the section, so the rail still reads as the
config document.

Evals earns its place in the rail because the case list is configuration: the
queries and expectations the site is judged against, stored and versioned like
any other setting. The panel edits the list; running it belongs to `web-evals`
and happens on the public site, not here.

History is not in the rail because it is not a setting. It hangs off the
revision indicator in the header — the thing that names the current revision
is the thing that opens the list of all of them.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ alice-phones                    rev 7 (live) ▾    View app ▸ │
├──────────────┬───────────────────────────────────────────────┤
│ Search     ● │  ┌─ Search method ──────────────┐             │
│ Prompts      │  │ ○ substring_match            │             │
│ Design       │  │ ● bm25                       │             │
│ Evals        │  │ ○ semantic_search            │             │
│              │  └──────────────────────────────┘             │
│              │                                               │
│              │  [ Save ]                                     │
└──────────────┴───────────────────────────────────────────────┘
```

The header names the site, the revision being viewed and whether it is live,
and links to the public site at that revision. Clicking the revision indicator
opens the history. The public site links back with a button labelled
**llmfn studio**.

The ASCII layouts go in `docs/mockups.md` beside the public app's, because that
is where this repo keeps its visual surface. The studio reuses the terracotta
tokens and self-hosted fonts already in `web/src/app.css` — no studio-specific
palette. Writes sit behind the student's login; viewing stays public like
the site itself.

### Saving

Every save appends a revision and makes it live, per `web-search`'s design.
There is no draft state and no publish button, so a panel has exactly two
states: matching the saved config, or holding unsaved edits — and it shows
which. A save takes a short note, which is what makes the history readable
later.

Panels validate against `parseSiteConfig` before saving, so an invalid config
never reaches the store and the error names the field.

### Storage

Two tables, singular names — the first D1 tables in the app, so they set the
convention:

```sql
CREATE TABLE site (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE siteconfig (
  id         INTEGER PRIMARY KEY,
  site_id    INTEGER NOT NULL REFERENCES site(id),
  revision   INTEGER NOT NULL,
  config     TEXT NOT NULL,   -- the JSON document
  note       TEXT,            -- what changed, for the history list
  created_at TEXT NOT NULL,
  UNIQUE (site_id, revision)
);
```

A row in `siteconfig` is a config document stamped with its revision number.
`config` is opaque JSON — nothing ever queries inside it, validity is
`parseSiteConfig`'s job at write time, and the schema `version` is stamped in
the document itself, so no column mirrors it.

**Live is the newest revision, defined rather than stored.** Every save
appends and goes live, and restore is also an append, so the live config is
always the row with the greatest `revision` for the site. There is no live
pointer to update, which means a save is a single insert deriving
`revision` inside it — nothing to get out of order when two tabs save at
once — and the storage obeys the same invariant as the API: the only way
config changes is by appending.

A site with no revisions serves the defaults. Whether creating a site seeds
revision 1 is a provisioning decision, left open here.

### Viewing a past revision

Opening the studio at `?r=3` shows that revision's configuration, read-only,
with a Restore action. Restoring appends a copy as a new revision rather than
rewinding — nothing in the history ever changes. This keeps a single rule: the
only way config changes is by appending.

### Every task ends with a save

The tasks are vertical: each one ends with a save that changes what the
public site does. The substrate — the frame, the store, the revision
addressing — rides with `search-panel`, the first save.

### Non-goals for this version

No side-by-side diff between two revisions, no config export or import, no
multi-user presence, no undo beyond restoring a revision, and no run surface
of any kind — no query box, no eval runner, no trace display.

Given the one-day workshop, comparing two revisions on the same screen is the
most likely thing to want next; it is deliberately not in this version because
the history plus a second browser tab already answers it.

## Tasks

### [DONE] search-panel: build the studio shell with the Search panel

Build the studio shell with its first panel: Search, where the student selects
the search method their site uses.

Saving appends a revision and the public site serves it: configuration starts
coming from D1 instead of the bundled module, and revisions become addressable
— `?r=` on the site, the header on the API, 404 on an unknown one — per the
design settled in `web-search`. The panel offers the params belonging to the
selected method and nothing else. The frame layout goes to `docs/mockups.md`.

**Acceptance Criteria:**

- [x] Choosing a method and saving changes what the public site returns for the
      same query
- [x] Two saves racing each other take distinct revision numbers
- [x] A slug with no rows serves the defaults, an unknown revision 404s, and
      the header wins over `?r=` when they disagree
- [x] Params belonging to a different method are refused with an error naming
      the field
- [x] The frame works at desktop and phone widths with the panel rail reachable
      by keyboard and focus visible throughout

### [DONE] prompts-panel: edit the prompts

Add the Prompts panel: edit the site's prompts.

An editor per prompt in `config.prompts`, holding default text from the
start, saved as a revision like everything else. The panel only edits text —
what runs a prompt, and when, is not decided here.

**Acceptance Criteria:**

- [x] A new site's editor shows the default prompt text
- [x] Editing a prompt and saving appends a revision, and reopening the panel
      at that revision shows the edited text

### [TODO] design-panel: switch the layout flags

Add the Design panel: pick each layout flag's variant for the public site.

The three flags in `config.design`, each a choice among its registered
options; the registry mirrors `phonekit/design_flags.py`.

**Acceptance Criteria:**

- [ ] Each flag offers exactly its registered options and refuses anything else
- [ ] Saving a flag changes the variant the public site renders

### [TODO] evals-panel: edit the case list

Add the Evals panel: edit the list of eval cases — `query` and `expect`, as
in `evals.yml`.

An untouched site holds the seed cases carried over from `evals.yml`. Nothing
runs here; the runner, the judge, and the page that executes this list belong
to `web-evals`.

**Acceptance Criteria:**

- [ ] An untouched site's panel shows the seed cases from `evals.yml`
- [ ] Adding, editing, and removing a case each save a revision, and reopening
      the panel at that revision shows the edited list
- [ ] A case with an empty query or expectation is refused with an error naming
      the case at fault

### [TODO] history: list, view, and restore revisions

Add the revision history behind the header's revision indicator: view any
revision, open the site at it, restore it.

Every revision, newest first, with its note and timestamp; each opens the
public site or the studio at that revision. Restore appends a copy, per Design.
The live revision is marked.

**Acceptance Criteria:**

- [ ] Restoring an old revision leaves every existing revision untouched and
      appends a new one that becomes live
- [ ] Each row opens the public site at its own revision
- [ ] The list works at desktop and phone widths under keyboard navigation

## Handover

`studio.search-panel` is complete. `/studio` replaces `/admin` (the old
addresses 308 to the new ones) and holds the shell — header, rail, panel — with
the Search panel as its first entry. Configuration now comes from D1: `site`
and `siteconfig` in `web/migrations/0001_site_config.sql`, read and written
through `web/src/lib/server/revisions.ts`. `appendRevision` derives the number
inside a single insert, with `UNIQUE (site_id, revision)` behind it.

`hooks.server.ts` is the only place a revision is resolved — `X-Phones-Revision`
first, then `?r=`, unknown or malformed is a 404 — and it sets `locals.config`
and `locals.revision`. `resolveSiteConfig` still fronts it, so nothing else
reads the store on the request path. Opening a site pins the API to the
revision the page was rendered at. A slug with no rows serves the defaults; the
first authenticated studio visit creates the site and seeds revision 1 with
them, so history always starts at 1.

Local D1 comes from `wrangler.dev.toml` through adapter-cloudflare's
`platformProxy`; tests use `node:sqlite` behind D1's interface, applying the
real migration (`web/test-support/database.ts`).

`studio.prompts-panel` is complete, and brought the shell out of the Search
route with it. `web/src/lib/server/studio.ts` holds `requireStudio`,
`loadPanel`, `savePanel`, and `logout`; `web/src/lib/StudioFrame.svelte` holds
the header and the rail, whose entries are one array. A panel route is now a
thin `load` plus a `save` that hands its own patch to `savePanel` — which
builds the patch from the live document, so a panel can only change what it
edits. Adding Design or Evals is a rail entry and a route.

Each prompt is edited on its own page — `/studio/prompts/[name]`, one rail
entry per prompt under a Prompts heading, `/studio/prompts` redirecting to the
first. So the rail is no longer one entry per config section: prompts are
listed individually because they are edited individually.

Every default and every knob's bounds and copy live in
`web/src/lib/site-defaults.ts`; `site-config.ts` validates against that table
and the panels render from it, so `DEFAULT_SITE_CONFIG` is now just
`parseSiteConfig({})`. Default prompt text is the four files in `prompts/`,
hardcoded there — `eval` arrives written, the other three as the one-line
comment naming what the student has to write.

`npm test` (18 files, 85 tests), `npm run check`, and `npm run build` pass.

Two things left for whoever picks this up. **The production database is not
provisioned**: `wrangler.jsonc` carries a placeholder `database_id`, so
`wrangler d1 create phones`, pasting the id, and
`wrangler d1 migrations apply phones --remote` have to happen before a deploy.
And selecting `bm25` or `semantic_search` currently makes the site return an
error turn rather than better results, because those engines land in
`web-search.bm25` and `web-search.semantic` — the wiring is proven, the engines
are not there yet.

Next is `studio.design-panel`, which adds the third rail entry.
