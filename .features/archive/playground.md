---
created: 2026-08-07
---

# Playground (playground) — archived

Archived 2026-08-17, when the Python app was retired in favour of the Worker
in `web/`. It shipped complete; this is the record of what was built and why.
Nothing in the Worker replaces it yet.

A page per mechanism, served by the app itself. You read it top to bottom, and
each computed table lands where the prose above has just made you want it.
BM25 first.

## Design

- **A document, not a dashboard.** Everything on screen at once is a reference
  card, and nobody learns a mechanism from a reference card. The page has a
  spine: how words are weighted, five real phones, the arithmetic behind one
  number, the knobs, and finally the query where the whole approach falls over.
- **Not the trace.** The trace says what the app just did and never
  editorialises. This explains the mechanism.
- **Computed, never narrated.** Every number comes from the real index over the
  real catalogue. No LLM call anywhere on the page.
- **What varies goes in the table.** Term frequency and document length decide
  the order, so they sit on the row. Document frequency and rarity weight are
  identical for every row, so they sit above it.
- **Curated queries first.** Most queries return a plausible ranking that
  teaches nothing, and a student typing into a box cannot tell. The chosen
  queries are the interface; free text is for afterwards.
- **Bundled with phonekit**, served by `Application` alongside `/`. `app.py`
  never mentions it.

## The shell

Every page carries a bar: the app's name on the left, going back to `/`, and
the mechanisms as tabs beside it — the current one marked, an unbuilt one named
but not linked, so the nav says what is coming without pretending it is there.
It sticks to the top, because the pages are several screens long and the way
out should never be a scroll away. The app links in from the right of its top
bar, where the trace rail begins.

## The BM25 page

Six sections, read downward. The numbers are real — `pink phone` over today's
136-document catalogue.

### 1. Pick a query

Three, each labelled with what it demonstrates. The free-text box sits below
them, not above.

```
pink phone      two common-ish words, one rarer - and a tie broken by length
samsung 5g      an exact model name, which is BM25 at its best
something for my mom who struggles with technology
                every word that carries the intent, matching nothing
```

### 2. What the words are worth

Rarity is a property of the catalogue, not of any phone, so this panel holds
still while everything below it moves.

```
136 documents . 224.7 tokens average . "Galaxy Z Fold6!" -> galaxy z fold6

token    df   weight
pink     15    2.179
phone    62    0.785
```

### 3. What actually ranks

```
phone             len     pink         phone        total
                         tf  score    tf  score
OnePlus 13s       196     4   4.07     1   0.83     4.90
Xiaomi 14 Civi    293     4   3.73     2   1.02     4.75
iPhone 15         227     4   3.95     1   0.78     4.74
Redmi 13 5G       264     3   3.48     2   1.06     4.54
Galaxy Z Fold6    278     3   3.43     1   0.71     4.14
                                            72 of 136 matched
```

The pair to look at is Civi and iPhone 15: both say `pink` four times, and the
shorter record scores higher. That comparison is why `len` and `tf` are columns
and not a tooltip — the prose points at it by name.

### 4. One score, in full

Visible from the start, for the top row. Clicking any other score retargets
this block; it never hides.

```
pink in OnePlus 13s
  rarity       log(1 + (136-15+0.5) / 15.5)     2.179
  length       196 / 224.7 = 0.872
               0.25 + 0.75 x 0.872              0.904
  saturation   (4 x 2.5) / (4 + 1.5 x 0.904)    1.867
  score        2.179 x 1.867                    4.068
```

### 5. Turn the knobs

```
k1  --[]---------  1.5      b  ---------[]--  0.75      reset

score by tf          score by length
(len 196)            (tf 4)
  1   2.31             100   4.47
  2   3.25             196   4.07
  4   4.07             225   3.96
100   5.38             400   3.42
```

Two different axes, and the page says which is which. The sliders vary the
*parameters* and reorder the table above — pull `b` toward 0 and iPhone 15
overtakes Civi, because length stops counting. The sweeps vary the *document*
at whatever `k1` and `b` currently are: repetition saturating, padding costing.

### 6. Where it breaks

The closing section, and the page's reason to exist.

```
token        df   weight
something     0     --     in no record
for         109    0.224
my            0     --     in no record
mom           0     --     in no record
who         135    0.011
struggles     0     --     in no record
with        134    0.018
technology    3    3.667

phone              len    for    who    with   technology   total
OnePlus 13R        169   0.25   0.01   0.03      4.13         4.42
Redmi Note 15 5G   255          0.01   0.03      3.46         3.50
Redmi Note 15 SE   273          0.01   0.03      3.34         3.39
Galaxy Z Flip6     179   0.43   0.01   0.03                   0.47
OnePlus 13s        196   0.42   0.01   0.03                   0.46
                                              136 of 136 matched
```

Every word carrying the intent — `something`, `my`, `mom`, `struggles` — is in
no record. BM25 still answers, and it answers with the entire catalogue ranked
by `technology` and three stopwords. Only the columns that matched are shown,
which is the sharper way to say what the ranking was built from. Not empty:
confident and wrong. That is where layer 2 starts, and the page ends on it.

(`docs/teaching.md` still says this query returns zero results. It did once; it
does not now. The page shows what the code does.)

## Authoring

A blueprint registered by `Application`, serving `/playground/`,
`/playground/bm25` and `/playground/bm25.json`.

```
phonekit/playground/__init__.py   blueprint, routes, Jinja -> markdown -> shell
phonekit/playground/bm25.py       explain(query, k1, b) -> plain dataclasses
phonekit/playground/pages/        base.html, index.md, bm25.md, macros.html
phonekit/static/playground/       playground.css, playground.js
```

`bm25.md` is a Jinja template written in markdown, rendered per request by
`markdown-it-py` (the one new dependency — the vendored `marked` is client-side
and serves a different job). Its interactive pieces are macros, so the prose
stays prose: `{{ ranked_table(e, link) }}`, `{{ derivation(e) }}`,
`{{ knobs(e, link_default) }}`.

`playground.PAGES` is the registry the nav, the index, and the "not built yet"
label all read from, so adding a mechanism is a row plus its route. Its one
outside touch is a link in `templates/index.html`.

`bm25.explain(query, k1, b)` returns everything the page shows — corpus facts,
per-token df and weight, ranked rows, the worked derivation, both sweeps.
Printable in a REPL, and the same object `/playground/bm25.json` returns.

**No numeral is ever typed in the prose.** Beyond interpolation, any sentence
that makes a *claim* is branched on the data behind it: the two-records
comparison only runs when two rows really do tie, and says something different
when `b` or `k1` has flattened the difference. A page whose prose can be made
to lie by moving a slider has not followed the rule.

All state lives in the URL — `?q=pink+phone&k1=1.5&b=0&row=18&token=pink` — so
any state, down to which score is worked through, is a link worth sending to a
room of students. Dragging a slider re-requests that same URL and swaps
`<main>`; there is deliberately no second renderer, so a drag and a reload
produce identical HTML. Without JS the form still submits.

## Tasks

### [DONE] bm25: the BM25 page

Build the page above.

**Done when:**

- [x] The page reads top to bottom as the six sections, and all three curated
      queries render
- [x] The worked derivation is on screen without clicking, and clicking another
      score moves it there
- [x] Moving `k1` or `b` reorders the ranked table and recomputes the sweeps
- [x] The last query ends the page on 136 of 136

## Backlog

Semantic search is the second page: the same spine, ending on what the
catalogue has nothing near. It is also the check on the macros — if it costs a
fraction of BM25, the authoring approach was right.
