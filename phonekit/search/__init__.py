"""Search engines a layer can pick from, all with the same shape:

    query in, ranked ``list[Product]`` out. Each engine records what it did
    on the query's trace (see ``phonekit.trace``); filters and facets are
    the caller's business, downstream.

- ``search_bm25``: keyword matching over the whole record (see ``bm25.py``).
  Every query word must appear somewhere in a phone's document (AND), ranked
  by total BM25 score. Literal queries work ("samsung 5g"); vibe queries
  ("a phone for my mom") whiff, and the per-token match counts in the trace
  show exactly which word killed the query.
"""

import time

from .. import trace
from ..schema import Product
from .bm25 import tokenize
from .index import catalog_index


def search_bm25(query: str) -> list[Product]:
    started = time.perf_counter()
    index, entries = catalog_index()
    tokens = tokenize(query)
    if not tokens:
        # No usable query: return the whole catalogue so filter-only flows
        # (and clearing the query) still show results.
        return [Product.from_entry(e) for e in entries]
    per_doc_scores = index.token_scores(tokens)
    # Require every token to match (AND), then rank by total BM25 score. AND
    # is what makes naive keyword search whiff on vibe queries -- the Layer 1
    # limitation docs/specs.md calls out.
    scored = [
        (sum(token_scores.values()), entry)
        for token_scores, entry in zip(per_doc_scores, entries)
        if len(token_scores) == len(set(tokens))
    ]
    scored.sort(key=lambda pair: -pair[0])
    # How many phones each token appears in -- the zeros are the story.
    match_counts = {
        token: sum(1 for doc_scores in per_doc_scores if token in doc_scores)
        for token in dict.fromkeys(tokens)
    }
    trace.add_step(
        input={"mode": "bm25", "query": query},
        output={"token_match_counts": match_counts, "results": len(scored)},
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return [Product.from_entry(entry) for _, entry in scored]


__all__ = ["search_bm25"]
