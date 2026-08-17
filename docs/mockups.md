# Mockups

Low-fidelity ASCII layouts for the phone recommender UI. These capture the
*visual* design only — the surface a student sees and how it changes. The
`POST /api/recommend` contract and per-layer backend behavior live in
`specs.md`.

The app is a **product-search interface**, not a chatbot. There is one search
box, a results grid of phones, and a filter sidebar. The eight course layers
(search, prompt, schema, context, state, memory, tools, evals) each change this
same surface; the trace panel exposes what ran underneath. Which layer is active
is owned by the backend — there is no layer selector in the UI.

Design principles in force:

- **Minimal.** Anything that can be removed is removed. No app title or URL in
  the chrome — the search box placeholder carries the app's identity.
- **Fixed-width shell.** Content is capped (~1200px) and centered, not fluid
  edge-to-edge. The side panels are fixed rails; only the results column flexes.
- **One search box that moves, not resizes.** It is a constant width in both
  states — it only changes position.

(Diagrams below are ASCII-only inside the frames so the borders stay aligned in
any monospace renderer.)


## 1. Zero state

The first thing a student sees. A bare page with a single centered search box.
No catalogue, no filters, no trace, no title — nothing to configure or read.
The placeholder text is the only label, and it does double duty: it tells you
this is about phones and invites a natural-language description.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
│                 ┌────────────────────────────────────────┐                  │
│                 │ Find a phone - describe what you need  │                  │
│                 └────────────────────────────────────────┘                  │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- No layer selector is shown anywhere. The backend owns which layer is active;
  the student reads it from the trace rows once results appear.
- The placeholder wording can vary by active layer (e.g. keyword-flavored
  "Search phones" at Layer 1 vs "describe what you need" once the LLM layer is
  on), but the empty page is otherwise identical across layers.


## 2. Search state

After the first query the page resolves into a three-zone layout. The search
box slides up from center into a slim top bar — **same width, new position** —
and the two side panels fade in around the results.

- **Left rail (fixed):** filters. Brand checkboxes with facet counts, and a
  price range slider.
- **Center (flexes, capped):** the results grid of phone cards, each with image,
  name, price, colour swatches, and storage pills.
- **Right rail (fixed):** the trace. Its header is just a `TRACE` label and a
  "copy as JSON" button — no layer selector, since the backend owns the active
  layer. The student reads which layer ran from the rows themselves.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ┌────────────────────────────────────────┐                  │
│                 │ good phone for my mom                  │                  │
│                 └────────────────────────────────────────┘                  │
├───────────────┬──────────────────────────────────────────┬──────────────────┤
│FILTERS        │ 6 results                                │TRACE             │
│               │                                          │                  │
│Brand          │ ┌──────────┐ ┌──────────┐ ┌──────────┐   │2 Prompt   120ms  │
│[ ] Samsung (2)│ │ [img]    │ │ [img]    │ │ [img]    │   │  success         │
│[ ] Apple   (1)│ │ Galaxy   │ │ Pixel    │ │ iPhone   │   │  in:  query      │
│[ ] Google  (1)│ │ A54      │ │ 8a       │ │ SE       │   │  out: y0         │
│[ ] OnePlus (1)│ │ ₹38,999  │ │ ₹52,999  │ │ ₹49,900  │   │────────────────  │
│[ ] Moto    (1)│ │ o o o    │ │ o o o o  │ │ o o      │   │3 Schema    skip  │
│               │ │128 256   │ │128 256   │ │64 128    │   │  (skipped)       │
│Colour         │ └──────────┘ └──────────┘ └──────────┘   │────────────────  │
│[ ] black   (4)│ ┌──────────┐ ┌──────────┐ ┌──────────┐   │8 Evals     skip  │
│[ ] blue    (2)│ │ [img]    │ │ [img]    │ │ [img]    │   │  (skipped)       │
│[ ] green   (1)│ │ Nord     │ │ Galaxy   │ │ Moto     │   │                  │
│               │ │ CE4      │ │ M14      │ │ G84      │   │[copy as JSON]    │
│Price          │ │ ₹24,999  │ │ ₹13,499  │ │ ₹17,999  │   │                  │
│o─────────o    │ │ o o      │ │ o        │ │ o o      │   │                  │
│₹10k  ₹90k     │ │128 256   │ │64        │ │128 256   │   │                  │
│               │ └──────────┘ └──────────┘ └──────────┘   │                  │
│               │                                          │                  │
│[Reset]        │                                          │                  │
└───────────────┴──────────────────────────────────────────┴──────────────────┘
```

Notes:

- **Facet counts** (the numbers in parentheses) reflect the *current result
  set* — how many of these results belong to each brand or colour family — so
  they update with every query and re-filter, standard faceted-search behavior.
  The colour facet lists canonical families (`black`, `blue`, ...), not
  marketing names.
- **Cards** show the selected colour image, name, selected storage price,
  swatches (`o o o` in the drawing), and storage pills (`128 256` in the
  drawing). Clicking these card controls changes only that card; filters still
  re-query through the left rail and chips. There is no match score on cards.
- **Trace rows:** the active layer and every prior layer run as `success` rows
  (expandable to raw input → output JSON); later, skipped layers render as
  greyed `skip` rows rather than disappearing, so the student sees the full
  stack and what is currently off.
- The top bar keeps empty space flanking the centered box. That is deliberate
  breathing room for now; it is also the natural slot for a small logo or a
  "simulate failure" control if those are added later.


## 3. Filter-selected state

Selecting a brand checkbox (or dragging the price slider) **re-queries the
backend** with the chosen filters. The applied filters appear as **chips
directly under the search box** — each removable via its `x`, plus a `clear all`
— and the results grid and facet counts narrow to the filtered set.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ┌────────────────────────────────────────┐                  │
│                 │ good phone for my mom                  │                  │
│                 └────────────────────────────────────────┘                  │
│                 [brand: Apple x]  [clear all]                               │
├───────────────┬──────────────────────────────────────────┬──────────────────┤
│FILTERS        │ 1 result                                 │TRACE             │
│               │                                          │                  │
│Brand          │ ┌──────────┐                             │2 Prompt   120ms  │
│[x] Apple   (1)│ │ [img]    │                             │  success         │
│               │ │ iPhone   │                             │  in:  query      │
│Price          │ │ SE       │                             │  out: y0         │
│o─────────o    │ │ ₹49,900  │                             │────────────────  │
│₹10k  ₹90k     │ │ o o      │                             │3 Schema    skip  │
│               │ │64 128    │                             │  (skipped)       │
│[Reset]        │ └──────────┘                             │                  │
│               │                                          │[copy as JSON]    │
└───────────────┴──────────────────────────────────────────┴──────────────────┘
```

Notes:

- The chip row sits between the search box and the three-zone divider, aligned
  to the box's left edge. It is the canonical readout of "what is filtering the
  results right now"; the left-rail checkboxes and these chips stay in sync.
  Colour filters chip the same way (`[colour: red x]`).
- **Facet counts** reflect the now-filtered result set, so the brand list shows
  only the brands still present (here, just `Apple (1)`).
- Removing a chip (or hitting `Reset` / `clear all`) re-queries and returns to
  the broader result set.


## 4. Transition (zero → search)

One continuous gesture rather than a page swap:

1. The centered search box slides up to the top bar at the same width.
2. The filter rail and trace rail fade in on the left and right.
3. The results grid populates in the center.

The box is the visual anchor that persists across both states, so the move
reads as "the same search, now with its results" rather than a new screen.


## Per-layer variations (to come)

The states above are layer-agnostic. The point of the course is that each layer
changes this same surface — keyword-only search returning nothing for a vibe
query at Layer 1, the filters auto-populating from natural language once state
is involved, action buttons on cards at the tools layer, a quality score at
evals, and so on. Those per-layer drawings will be added here as separate headed
sections as the behavior is pinned down.


## 5. Evals

The eval report keeps the existing trace panel on the right. Cases complete in
file order; their rows change from neutral to green or red. Selecting a finished
row loads that case's trace into the panel.

```text
┌──────────────────────────────────────────┬──────────────────────────────┐
│ Phones                       Playground  │ TRACE  copy as JSON  expand  │
│                                          ├──────────────────────────────┤
│ Can the app answer these shoppers?       │ search                      │
│                            [ Run evals ]  │ a phone for video calls      │
│                                          │                              │
│ 01  samsung galaxy s24 fe          YES   │  semantic search      120 ms │
│     The named phone leads.                │  llm call              800 ms│
│                                          │                              │
│ 02  a phone for video calls         NO   │  [formatted] [raw]           │
│     Front camera and battery matter.      │                              │
│     The returned phones miss the need.    │  ...selected step...         │
│                                          │                              │
│ 03  compact phone                 running│                              │
│ 04  fast charging                 waiting│                              │
└──────────────────────────────────────────┴──────────────────────────────┘
```

On narrow screens the trace returns to normal document flow below the case
list, matching the home page's responsive trace behavior.


## 6. Studio

The student's console at `/studio`, on their own hostname, behind their session.
It edits configuration and nothing else — there is no query box and no results
here, because the public site is the only place the site runs. The working loop
is two tabs: save here, reload there.

The header names the site, the revision being viewed and whether it is live, and
links to the public site at that revision. One rail entry per section of the
config document — Search, Prompts, Design, Evals — and no other entries; a rail
entry appears once its panel is built.

```text
┌──────────────────────────────────────────────────────────────┐
│ alice-phones                    rev 7 live        View app > │
├──────────────┬───────────────────────────────────────────────┤
│ Search     | │  SEARCH                                       │
│ Prompts      │  How your site finds phones.                  │
│ Design       │                                               │
│ Evals        │  SEARCH METHOD                                │
│              │   o substring_match                           │
│              │     Case-insensitive match on the phone name. │
│              │   * bm25                                      │
│              │     Keyword ranking over the whole record.    │
│              │   o semantic_search                           │
│              │     Cosine similarity over each narrative.    │
│              │                                               │
│              │  PARAMETERS                                   │
│              │   k1 - term frequency saturation              │
│              │   [ 1.5                          ]            │
│              │   b - length normalisation                    │
│              │   [ 0.75                         ]            │
│              │  ---------------------------------------------│
│              │  WHAT CHANGED                                 │
│              │   [ Switched to keyword ranking  ]            │
│              │   [ SAVE ]   Unsaved edits                    │
└──────────────┴───────────────────────────────────────────────┘
```

Notes:

- Only the selected method's parameters are shown. Choosing another method
  swaps them; there is never a knob on screen that the site would ignore.
- Every save appends a revision and makes it live. There is no draft state and
  no publish button, so a panel is either matching what is saved or holding
  unsaved edits — and the line beside Save says which. The note is what makes
  the history readable later.
- Clicking the revision indicator opens the history (see `.features/studio.md`).

## 6a. Studio at a past revision

Opening the studio at `?r=3` shows that revision's configuration, read only.
The controls are disabled rather than hidden, so the shape of the configuration
is still legible, and the save row is gone entirely.

```text
┌──────────────────────────────────────────────────────────────┐
│ alice-phones                    rev 3 archived    View app > │
├──────────────┬───────────────────────────────────────────────┤
│ Search     | │  SEARCH                                       │
│              │  How your site finds phones.                  │
│              │  Revision 3 is not live, so it is read only.  │
│              │  Revision 7 is what your site serves.         │
│              │                                               │
│              │  SEARCH METHOD          (disabled)            │
│              │   * substring_match                           │
│              │   o bm25                                      │
│              │   o semantic_search                           │
└──────────────┴───────────────────────────────────────────────┘
```

**View app** carries `?r=3`, so the pair of tabs stays on the same revision.

## 6b. Studio at phone width

The rail turns from a column into a strip of tabs above the panel, and the save
row stacks. Nothing is dropped.

```text
┌───────────────────────────┐
│ alice-phones              │
│ rev 7 live     View app > │
├───────────────────────────┤
│ [Search] Prompts  Design  │
├───────────────────────────┤
│ SEARCH                    │
│ How your site finds       │
│ phones.                   │
│                           │
│ SEARCH METHOD             │
│  o substring_match        │
│  * bm25                   │
│  o semantic_search        │
│                           │
│ WHAT CHANGED              │
│ [                       ] │
│ [         SAVE          ] │
│ Unsaved edits             │
└───────────────────────────┘
```

## 7. Admin groups and participants

The instructor console at the apex lists training groups newest first. Creating
a group expands the compact action into a name form; selecting a row opens the
group, where its name can be changed and participants managed. Counts include
active participants only. Archive controls arrive with their own task rather
than appearing as inert UI.

```text
┌──────────────────────────────────────────────────────────────┐
│ Phones | Admin                                      Log out │
├──────────────────────────────────────────────────────────────┤
│ PHONES / ADMIN                         [ New group ]          │
│ Training groups.                                           │
│                                                            │
│ edition-03             12 participants  active     [ Edit ] │
│ ---------------------------------------------------------- │
│ edition-02             15 participants  archived   [ Edit ] │
│ ---------------------------------------------------------- │
│ edition-01             10 participants  archived   [ Edit ] │
└──────────────────────────────────────────────────────────────┘
```

On a phone, the heading and create control stack, while each group keeps its
status beside its name and moves Edit onto the following line.

```text
┌───────────────────────────┐
│ Phones | Admin    Log out │
├───────────────────────────┤
│ PHONES / ADMIN            │
│ Training groups.          │
│ [       New group       ] │
│                           │
│ edition-03         active │
│ 12 participants           │
│ [ Edit ]                  │
│ ------------------------- │
│ edition-02       archived │
│ 15 participants           │
│ [ Edit ]                  │
└───────────────────────────┘
```

The group detail lists active participants first and keeps deleted rows visible
with only a Restore action. Add and Edit expand into forms for name, email, and
subdomain; the generated subdomain is shown after creation.

```text
┌──────────────────────────────────────────────────────────────┐
│ Phones | Admin                                      Log out │
├──────────────────────────────────────────────────────────────┤
│ ← Groups                                                     │
│ edition-03                                          active   │
│ Rename group [ edition-03                 ] [ Save name ]    │
│                                                              │
│ Participants                         [ Add participant ]     │
│ Ada Lovelace      ada@course.test    adalovelace active     │
│                                                [Edit] [Delete]│
│ Grace Hopper      grace@course.test  grace       deleted    │
│                                                     [Restore]│
└──────────────────────────────────────────────────────────────┘
```

On a phone, participant identity, subdomain, and actions stack. Expanded add
and edit forms use full-width fields and controls.
