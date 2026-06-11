"""Layer 1: keyword search.

The first real search layer. It overrides ``search`` to score the query against
an in-memory BM25 index over the catalogue (see ``app/search``) instead of
returning everything. The base ``Layer`` still applies filters and computes
facets over the result, so only candidate selection changes.

This is keyword matching, nothing more: every query word must appear somewhere
in a phone's record, ranked by BM25 score. It handles literal searches
("samsung 5g") but not vibe queries ("a phone for my mom") -- words like "mom"
match nothing, so the whole query returns no results (the empty state in
docs/specs.md). That brittleness is the limitation later layers exist to fix.
"""

from ..search.bm25 import tokenize
from ..search.index import catalog_index
from .base import Layer
from .schema import Product


class Layer1(Layer):
    number = 1
    name = "Search"

    def search(self, query: str) -> list[Product]:
        index, entries = catalog_index()
        tokens = tokenize(query)
        if not tokens:
            # No usable query: return the whole catalogue so filter-only
            # flows (and clearing the query) still show results.
            return [e.product for e in entries]
        # Require every token to match (AND), then rank by total BM25 score.
        # AND is what makes naive keyword search whiff on vibe queries -- the
        # Layer 1 limitation docs/specs.md calls out.
        scored = [
            (sum(token_scores.values()), entry)
            for token_scores, entry in zip(index.token_scores(tokens), entries)
            if len(token_scores) == len(set(tokens))
        ]
        scored.sort(key=lambda pair: -pair[0])
        return [entry.product for _, entry in scored]
