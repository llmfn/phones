"""The numbers behind a BM25 ranking, and the arithmetic that produced them.

``explain`` returns plain dataclasses covering everything the page shows: the
corpus that was scored against, each query token's rarity, the ranked rows with
the term frequencies and lengths that ordered them, one score worked through in
full, and two sweeps that each vary a single input. The same object is rendered
into the page and served as JSON, so a slider update and a fresh page load
cannot disagree.

Every value here is computed from the real index over the real catalogue --
nothing is illustrative.
"""

from dataclasses import asdict, dataclass, field
from functools import lru_cache

from ..catalog import CatalogEntry
from ..search.bm25 import BM25Index, tokenize
from ..search.index import catalog_index, flatten_tokens

DEFAULT_K1 = 1.5
DEFAULT_B = 0.75

# The queries the page leads with, each chosen for what it exposes. Free text
# is available too, but most queries rank plausibly and teach nothing.
CURATED = [
    ("pink phone", "two words of different rarity, and a tie broken by length"),
    ("samsung 5g", "an exact model name, which is BM25 at its best"),
    (
        "something for my mom who struggles with technology",
        "every word that carries the intent, matching nothing",
    ),
]

TF_SWEEP = [1, 2, 4, 8, 100]
LENGTH_SWEEP = [100, 200, 300, 400]


@dataclass
class Corpus:
    documents: int
    avg_length: float
    sample_text: str
    sample_tokens: list[str]


@dataclass
class TokenWeight:
    """A query token's rarity -- the same for every document, hence not a column."""

    token: str
    df: int
    weight: float
    absent: bool


@dataclass
class Cell:
    token: str
    tf: int
    score: float


@dataclass
class Row:
    index: int
    name: str
    length: int
    cells: list[Cell]
    total: float


@dataclass
class Step:
    """One line of the worked example: what it does, how, and what came out."""

    name: str
    working: list[str]
    value: float


@dataclass
class Derivation:
    token: str
    row: int
    name: str
    tf: int
    length: int
    steps: list[Step]
    value: float


@dataclass
class Pair:
    """Two ranked rows saying a word equally often, separated only by length.

    The page's argument turns on a comparison like this, so it is found in the
    data rather than assumed: a query with no such pair simply omits the point.
    """

    token: str
    tf: int
    shorter: Row
    longer: Row
    shorter_score: float
    longer_score: float


@dataclass
class Sweep:
    varying: str
    fixed: str
    points: list[tuple[int, float]]


@dataclass
class Explanation:
    query: str
    k1: float
    b: float
    corpus: Corpus
    tokens: list[TokenWeight]
    rows: list[Row]
    matched: int
    pair: Pair | None = None
    derivation: Derivation | None = None
    tf_sweep: Sweep | None = None
    length_sweep: Sweep | None = None
    curated: list[tuple[str, str]] = field(default_factory=lambda: list(CURATED))

    def as_dict(self) -> dict:
        return asdict(self)


@lru_cache(maxsize=16)
def index_for(k1: float, b: float) -> tuple[BM25Index, tuple[CatalogEntry, ...]]:
    """The catalogue index at these parameters, reusing the shared one at defaults."""
    index, entries = catalog_index()
    if (k1, b) == (index.k1, index.b):
        return index, entries
    return BM25Index([flatten_tokens(e.raw) for e in entries], k1=k1, b=b), entries


def score(idf: float, tf: int, length: int, avg: float, k1: float, b: float) -> float:
    """BM25's contribution for one token in one document.

    The sweeps and the worked example both go through here, so the arithmetic
    the page explains is the arithmetic it charts.
    """
    return idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * length / avg))


def explain(
    query: str,
    k1: float = DEFAULT_K1,
    b: float = DEFAULT_B,
    limit: int = 5,
    focus: int = 0,
    focus_token: str = "",
) -> Explanation:
    """Everything the page shows for one query at one pair of parameters."""
    index, entries = index_for(k1, b)
    tokens = tokenize(query)
    names = [e.raw.get("name", "?") for e in entries]

    weights = [
        TokenWeight(token=t, df=index.df.get(t, 0), weight=index.idf(t), absent=not index.df.get(t))
        for t in dict.fromkeys(tokens)
    ]

    scored = index.token_scores(tokens)
    ranked = sorted(
        (
            Row(
                index=i,
                name=names[i],
                length=index.doc_lens[i],
                cells=[
                    Cell(token=w.token, tf=index.doc_counts[i].get(w.token, 0),
                         score=per_token.get(w.token, 0.0))
                    for w in weights
                ],
                total=sum(per_token.values()),
            )
            for i, per_token in enumerate(scored)
            if per_token
        ),
        key=lambda row: row.total,
        reverse=True,
    )

    explanation = Explanation(
        query=query,
        k1=k1,
        b=b,
        corpus=corpus_facts(index),
        tokens=weights,
        rows=ranked[:limit],
        matched=len(ranked),
    )
    if explanation.rows:
        # ``focus`` is a catalogue index, the same one the table's links carry,
        # so it survives the rows being reordered by a parameter change.
        row = next((r for r in explanation.rows if r.index == focus), explanation.rows[0])
        cell = _pick_cell(row, focus_token)
        explanation.derivation = derive(index, row, cell, k1, b)
        explanation.pair = _find_pair(explanation.rows, cell.token)
        explanation.tf_sweep = _tf_sweep(index, cell, row.length, k1, b)
        explanation.length_sweep = _length_sweep(index, cell, k1, b)
    return explanation


def _find_pair(rows: list[Row], token: str) -> Pair | None:
    """Two shown rows saying ``token`` equally often at different lengths."""
    seen: dict[int, Row] = {}
    for row in rows:
        cell = next((c for c in row.cells if c.token == token), None)
        if not cell or not cell.tf:
            continue
        other = seen.get(cell.tf)
        if other is None:
            seen[cell.tf] = row
        elif other.length != row.length:
            short, long = sorted((other, row), key=lambda r: r.length)
            contribution = {r.index: c.score for r in (short, long) for c in r.cells if c.token == token}
            return Pair(
                token=token, tf=cell.tf, shorter=short, longer=long,
                shorter_score=contribution[short.index],
                longer_score=contribution[long.index],
            )
    return None


def corpus_facts(index: BM25Index) -> Corpus:
    sample = "Galaxy Z Fold6 (512GB) — Pink!"
    return Corpus(
        documents=len(index.doc_lens),
        avg_length=index.avg_len,
        sample_text=sample,
        sample_tokens=tokenize(sample),
    )


def derive(index: BM25Index, row: Row, cell: Cell, k1: float, b: float) -> Derivation:
    """One contribution, worked through: rarity, length, saturation, product."""
    n, df, avg = len(index.doc_lens), index.df.get(cell.token, 0), index.avg_len
    idf = index.idf(cell.token)
    ratio = row.length / avg
    norm = 1 - b + b * ratio
    saturation = cell.tf * (k1 + 1) / (cell.tf + k1 * norm)
    steps = [
        Step("rarity", [f"log(1 + ({n} - {df} + 0.5) / {df + 0.5:g})"], idf),
        Step(
            "length",
            [f"{row.length} / {avg:.1f} = {ratio:.3f}",
             f"{1 - b:g} + {b:g} x {ratio:.3f}"],
            norm,
        ),
        Step(
            "saturation",
            [f"({cell.tf} x {k1 + 1:g}) / ({cell.tf} + {k1:g} x {norm:.3f})"],
            saturation,
        ),
        Step("score", [f"{idf:.3f} x {saturation:.3f}"], idf * saturation),
    ]
    return Derivation(
        token=cell.token, row=row.index, name=row.name, tf=cell.tf,
        length=row.length, steps=steps, value=cell.score,
    )


def _pick_cell(row: Row, token: str) -> Cell:
    """The cell being worked through: the asked-for one, else the biggest."""
    for cell in row.cells:
        if cell.token == token and cell.tf:
            return cell
    return max(row.cells, key=lambda c: c.score)


def _tf_sweep(index: BM25Index, cell: Cell, length: int, k1: float, b: float) -> Sweep:
    idf, avg = index.idf(cell.token), index.avg_len
    tfs = sorted({*TF_SWEEP, cell.tf})
    return Sweep(
        varying="times the word appears",
        fixed=f"in a {length}-token record",
        points=[(tf, score(idf, tf, length, avg, k1, b)) for tf in tfs],
    )


def _length_sweep(index: BM25Index, cell: Cell, k1: float, b: float) -> Sweep:
    idf, avg = index.idf(cell.token), index.avg_len
    lengths = sorted({*LENGTH_SWEEP, round(avg)})
    return Sweep(
        varying="length of the record",
        fixed=f"the word appearing {cell.tf}x",
        points=[(n, score(idf, cell.tf, n, avg, k1, b)) for n in lengths],
    )


def clamp(value: str | None, low: float, high: float, fallback: float) -> float:
    """A slider value off the query string, kept inside its range."""
    try:
        return min(high, max(low, float(value)))
    except (TypeError, ValueError):
        return fallback


__all__ = ["explain", "clamp", "CURATED", "DEFAULT_K1", "DEFAULT_B"]
