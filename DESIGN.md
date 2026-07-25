# Phone Recommender — Design System

A warm, editorial-flavoured app UI. Same terracotta foundations as the llmfn editorial site, adapted for an interface with search, cards, conversation, and trace output.

The aesthetic should feel like a thoughtful tool, not a consumer gadget app. Warm paper surfaces, restrained typography, no chrome. The trace panel is the one deliberate exception — dark surface to signal machine internals.

---

## 1. Design Philosophy

### Inherit from editorial

The phone recommender shares the core editorial DNA: terracotta OKLCH palette, Alegreya type stack, matte surfaces, SC labels, no shadows, no gradients. It is a sibling to the llmfn website, not a different product.

### App-specific additions

Three UI patterns extend the editorial base without breaking it:

- **Cards** — bounded result objects with structured data fields
- **Conversation** — turn-based message thread with input
- **Trace panel** — dark-surface monospace output for request internals

### What to avoid

- Consumer gadget aesthetics: ratings stars, coloured badges, glossy images
- Dashboard chrome: heavy sidebars, tab bars, status indicators
- Chat app conventions: avatars, timestamps, read receipts
- Any colour outside the terracotta token set (except the trace dark surface)

---

## 2. Colour Tokens

Same OKLCH single-hue terracotta palette as the editorial site. No new hues introduced.

```css
:root {
  --bg:            oklch(97% 0.012 55);   /* warm paper page */
  --fg:            oklch(22% 0.02 45);    /* near-black text */
  --primary:       oklch(52% 0.13 45);    /* terracotta — accents, labels, links */
  --primary-hover: oklch(45% 0.15 45);    /* darker on hover */
  --muted:         oklch(48% 0.04 50);    /* secondary body text */
  --subtle:        oklch(62% 0.03 50);    /* metadata, placeholders */
  --faint:         oklch(88% 0.02 50);    /* borders, dividers */
  --surface:       oklch(99% 0.006 55);   /* card and input backgrounds */
  --surface-alt:   oklch(95% 0.018 50);   /* assistant message bg */
  --surface-tint:  oklch(93% 0.022 50);   /* hover states on cards */

  --radius-sm: 0.2rem;
  --radius:    0.3rem;
  --radius-lg: 0.5rem;
}
```

### Trace panel — dark surface tokens

The trace panel uses an inverted dark surface. Define these separately.

```css
:root {
  --trace-bg:       oklch(20% 0.015 50);
  --trace-border:   oklch(30% 0.015 50);
  --trace-fg:       oklch(85% 0.04 55);
  --trace-muted:    oklch(60% 0.03 50);
  --trace-tab-act:  oklch(85% 0.04 55);
  --trace-step-bar: oklch(52% 0.13 45);   /* primary terracotta — left border on step labels */

  /* syntax tokens */
  --trace-key:  oklch(75% 0.08 55);   /* warm sand — JSON keys */
  --trace-str:  oklch(72% 0.12 145);  /* muted green — strings */
  --trace-num:  oklch(72% 0.12 260);  /* muted blue — numbers */
  --trace-bool: oklch(70% 0.12 30);   /* warm orange — booleans */
  --trace-null: oklch(55% 0.04 50);   /* dim — null */
  --trace-dim:  oklch(45% 0.03 50);   /* punctuation, colons */
}
```

Use raw `oklch()` values only in `styles.css` token definitions. Reference semantic tokens everywhere else.

---

## 3. Typography

Same four-family stack as the editorial site.

| Family | Role |
|---|---|
| Alegreya | Phone names, section headings, assistant message emphasis |
| Alegreya Sans | Body text, specs, conversation prose |
| Alegreya SC | Brand names, labels, badges, price tags, button text, tab labels |
| Fira Code | Trace panel — JSON keys, values, step labels |

### Load via self-hosted `@font-face` (woff2). Do not use Google Fonts CDN.

### Type roles in this app

| Element | Family | Size | Treatment |
|---|---|---|---|
| Phone name (card) | Alegreya | flow-1 | weight 700, tracking –0.01em |
| Section heading | Alegreya | flow-4 | weight 700, tracking –0.02em |
| Brand / SC label | Alegreya SC | flow-–1 | tracking 0.07em |
| Price | Alegreya SC | flow-–1 | primary colour |
| Spec text | Alegreya Sans | flow-–1 | muted colour |
| Body / message | Alegreya Sans | flow-0 | line-height 1.6 |
| Trace step label | Alegreya SC | 10px | tracking 0.06em, trace-fg colour |
| Trace JSON | Fira Code | 12px | line-height 1.65 |

Use `--text-flow-N` tokens for font sizes. Do not invent custom `clamp()` values.

---

## 4. Components

### 4.1 Search Bar

Single-line input. Semantic search — the badge signals this is not keyword search.

**Structure:** icon → input → badge

```
[ 🔍  budget phone under ₹15k…          semantic ]
```

**Rules:**
- Background: `--surface`
- Border: `1px solid var(--faint)`, `border-radius: var(--radius)`
- No border on focus — keep it quiet; a subtle border-color shift to `--faint` darkened slightly is enough
- Icon: muted colour, left-padded
- Badge: Alegreya SC, `--subtle`, `--surface-alt` background, separated by a left border
- Placeholder: Alegreya Sans, `--subtle`

The badge label should reflect the active search mode: `semantic`, `keyword`, or `hybrid`.

---

### 4.2 Phone Cards

Results rendered as a grid of cards. Each card is a bounded data object.

**Grid:** `repeat(auto-fill, minmax(180px, 1fr))`, gap 12px. Stacks to single column on narrow viewports.

**Card structure (top to bottom):**
1. Product image — `--surface-alt` well, square, no border
2. Brand — Alegreya SC, `--subtle`
3. Phone name — Alegreya serif, weight 700
4. Price — Alegreya SC, `--primary`
5. Colour swatches — round buttons, selected ring in `--primary`
6. Storage pills — bordered pills, selected in `--primary` + `--surface-tint`

**States:**
- Default: `--surface` background, `1px solid var(--faint)` border
- Hover: border shifts to `--primary`
- Selected: `1.5px solid var(--primary)` border

**Match reason:**
- Best match: `--primary` colour with a small sparkle icon
- Secondary match (e.g. "battery life", "camera focus"): `--muted` colour, no icon
- No score display. No star ratings. No percentage badges.

**Cards keep images, swatches, and storage pills** — a deliberate product
decision (catalogue variants are part of the teaching material), deviating from
the original text-only intent. Images sit in a quiet `--surface-alt` well; no
glossy treatment, no borders, no shadows.

---

### 4.3 Conversation UI

Turn-based thread. Two roles: `user` and `assistant`.

**Thread layout:** flex column, gap 12px. Messages stack top to bottom, newest at bottom.

**User message:**
- Align: right (`align-self: flex-end`)
- Background: `--primary`
- Text colour: `--surface` (light on dark)
- Border radius: `var(--radius)` except bottom-right corner: `var(--radius-sm)` — signals "sent"

**Assistant message:**
- Align: left (`align-self: flex-start`)
- Background: `--surface-alt`
- Border: `1px solid var(--faint)`
- Text colour: `--fg`
- Phone names inside assistant messages: Alegreya bold for emphasis

**Speaker label:**
- Alegreya SC, 10px, `--subtle`, rendered below the bubble
- User label: `right` aligned — `you`
- Assistant label: `left` aligned — `recommender`

**Input row:**
- Full-width text input + send button
- Input: same styling as search bar (no badge)
- Send button: Alegreya SC, `--primary` background, `--surface` text, `var(--radius)`

---

### 4.4 Trace Panel

Dark-surface panel showing request internals. Pedagogically distinct from the warm app UI — this is machine output, not user-facing content.

**Container:** `--trace-bg` background, `--radius-lg`, no border needed.

**Tab bar:**
- Tabs: `trace`, `prompt`, `response`
- Alegreya SC, 10px, tracking 0.07em
- Inactive: `--trace-muted`
- Active: `--trace-tab-act`, with a 1px bottom border in `--primary` (terracotta bleeds into the dark surface — intentional)
- Bottom border separating tab bar from body: `1px solid var(--trace-border)`

**Body:** Fira Code, 12px, line-height 1.65, `--trace-dim` for punctuation.

**Step labels:**
- Alegreya SC, 10px, `--trace-fg`
- Left border: `2px solid var(--trace-step-bar)` (terracotta)
- Padding-left: 8px
- Margin: 8px top, 4px bottom
- Numbered: `① search(query)`, `② context(retrieved)`, `③ g(query, context) → y`

**Syntax colouring:**
| Token type | CSS var |
|---|---|
| JSON keys | `--trace-key` |
| Strings | `--trace-str` |
| Numbers | `--trace-num` |
| Booleans | `--trace-bool` |
| Null | `--trace-null` |
| Punctuation | `--trace-dim` |

**Tabs — content:**
- `trace` — step-by-step execution with key values
- `prompt` — full prompt sent to the LLM (raw, no colouring)
- `response` — raw LLM response JSON

Only one tab visible at a time. Tab switching is JS-driven, post-render.

---

## 5. Layout

A fluid three-zone layout under a top nav. The page fills the viewport width
(side padding, no fixed cap); results and trace flex, the filter rail is fixed.

**Top nav:** `Phones` wordmark (Alegreya SC, `--primary`) on the left, the
search bar beside it, active-filter chips wrapping below the search input.

**Three zones (left to right):**

```
┌──────────────────────────────────────────────────────────────┐
│ Phones      [ 🔍  search …                       semantic ]  │
├──────────────────────────────┬───────────┬───────────────────┤
│ results grid (cards)         │ filters   │ trace / x-ray     │
│ minmax(0, 1fr)               │ 220px     │ minmax(320px, 32%)│
└──────────────────────────────┴───────────┴───────────────────┘
```

1. **Results** — card grid, the flexible main zone
2. **Filters** — fixed 220px rail
3. **Trace / x-ray** — dark-surface panel, flexes up to ~a third of the page

**Zero state:** on first load only the wordmark and search box show, centred in
the viewport. After the first query the same elements move into the top nav
(CSS only — the DOM does not change) and the three zones appear.

**Responsive:** under ~1100px the trace drops below the other two zones; under
~760px everything stacks to a single column (results → filters → trace).

**Section headers:** SC label + Alegreya heading, same pattern as editorial site `Intro` component — keep consistent.

---

## 6. Interaction

Same restraint as the editorial site.

- Hover: border colour shift on cards (`--faint` → `--primary`). No scale, no shadow.
- Transitions: `border-color 0.15s ease`, `opacity 0.15s ease`. Nothing faster, nothing slower.
- Card selection: border weight change only (1px → 1.5px + colour).
- Conversation send: input clears, new bubble appears at bottom.
- Trace tab switch: content swap, no slide animation.
- Trace panel expand/collapse: `opacity` + `max-height` transition, slow and calm.

No hover shadows. No card lift. No bounce.

---

## 7. CSS Guidelines

Follow the same layer architecture as the editorial site:

1. `reset`
2. `tokens` — add app-specific tokens here (trace surface, syntax colours)
3. `base`
4. `layout`
5. `components` — search bar, phone card, conversation, trace panel
6. `utilities`

**Do not:**
- Use raw `oklch()` values in components — define tokens in `styles.css`
- Use `color-mix()` in components
- Re-declare `font-family` in components (inherited)
- Add `box-shadow` anywhere except `box-shadow: 0 0 0 Npx` focus rings
- Invent spacing values outside the scale

---

## 8. JS Module Map

The UI is browser-native JS modules (no framework). The shell is
server-rendered in `index.html`; everything data-driven renders client-side.

| Module | Purpose |
|---|---|
| `app.js` | Bootstrap: bind events, restore persisted query, set zero/search state |
| `api.js` | Fetch wrapper for `POST /api/recommend` |
| `state.js` | Query, filters, persisted state, request payload |
| `render.js` | DOM rendering: cards, facets, chips, trace rows, JSON syntax spans, search-mode badge |
| `events.js` | Event binding and query orchestration |

All modules inherit global tokens and typography from `styles.css`; there are
no per-component style blocks.

---

## 9. Emotional Reference

The recommender should feel like a calm, knowledgeable shop assistant who has already done the research — not a search engine, not a chatbot, not an e-commerce product listing.

The trace panel is the one place where the machine shows its work. It should feel like looking at a circuit board through a window — interesting, legible, but clearly a different register from the warm paper surface above it.
