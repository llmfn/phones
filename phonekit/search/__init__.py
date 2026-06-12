"""Search engines a layer can pick from, all with the same shape:

    query in, ranked ``list[Product]`` out. Each engine records what it did
    on the query's trace (see ``phonekit.trace``); filters and facets are
    the caller's business, downstream.

- ``search_bm25``: keyword matching over the whole record (see ``bm25.py``).
  Every query word must appear somewhere in a phone's document (AND), ranked
  by total BM25 score. Literal queries work ("samsung 5g"); vibe queries
  ("a phone for my mom") whiff, and the per-token match counts in the trace
  show exactly which word killed the query.

- ``search_semantic``: embeds the query and ranks the full catalogue by cosine
  similarity against each phone's pre-embedded narrative (see
  ``embeddings.py``). No keyword needs to overlap: "for my mom" lands near
  narratives written about ease of use. The trace shows the top cosine scores
  without limiting what the caller's filters receive.
"""

import time

from .. import config, trace
from ..schema import Product
from .bm25 import tokenize
from .embeddings import corpus_embeddings, cosine, embed
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


def search_semantic(query: str) -> list[Product]:
    started = time.perf_counter()
    entries, vectors = corpus_embeddings()
    if not query.strip():
        # No usable query: return the whole catalogue so filter-only flows
        # (and clearing the query) still show results.
        return [Product.from_entry(e) for e in entries]
    query_vector = embed([query])[0]
    scored = sorted(
        zip(entries, (cosine(query_vector, v) for v in vectors)),
        key=lambda pair: -pair[1],
    )
    # Every phone gets ranked -- cosine never whiffs -- so only the top
    # scores are worth showing in the trace.
    shown_scores = scored[: config.SEMANTIC_TRACE_TOP_N]
    trace.add_step(
        input={
            "mode": "semantic",
            "query": query,
            "model": config.EMBEDDING_MODEL,
            "ranked_candidates": len(scored),
            "trace_top_n": config.SEMANTIC_TRACE_TOP_N,
        },
        output={
            "shown_scores": [
                {"id": entry.doc.id, "name": entry.doc.name, "cosine": round(score, 4)}
                for entry, score in shown_scores
            ]
        },
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return [Product.from_entry(entry) for entry, _ in scored]


__all__ = ["search_bm25", "search_semantic"]
