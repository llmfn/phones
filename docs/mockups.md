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
