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

from .. import config, trace
from ..schema import Product
from .bm25 import tokenize
from .embeddings import corpus_embeddings, cosine, embed
from .index import catalog_index


def search_bm25(query: str) -> list[Product]:
    index, entries = catalog_index()
    tokens = tokenize(query)
    if not tokens:
        # No usable query: return the whole catalogue so filter-only flows
        # (and clearing the query) still show results.
        return [Product.from_entry(e) for e in entries]
    with trace.new_step(name="search_bm25", input={"query": query}) as step:
        per_doc_scores = index.token_scores(tokens)
        # Require every token to match (AND), then rank by total BM25 score.
        # AND is what makes naive keyword search whiff on vibe queries -- the
        # Layer 1 limitation docs/specs.md calls out.
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
        step.set_output({"token_match_counts": match_counts, "results": len(scored)})
    return [Product.from_entry(entry) for _, entry in scored]


def search_semantic(query: str) -> list[Product]:
    entries, vectors = corpus_embeddings()
    if not query.strip():
        # No usable query: return the whole catalogue so filter-only flows
        # (and clearing the query) still show results.
        return [Product.from_entry(e) for e in entries]
    step_input = {
        "query": query,
        "model": config.EMBEDDING_MODEL,
        "trace_top_n": config.SEMANTIC_TRACE_TOP_N,
    }
    with trace.new_step(name="search_semantic", input=step_input) as step:
        query_vector = embed([query])[0]
        scored = sorted(
            zip(entries, (cosine(query_vector, v) for v in vectors)),
            key=lambda pair: -pair[1],
        )
        # Every phone gets ranked -- cosine never whiffs -- so only the top
        # scores are worth showing in the trace.
        shown_scores = scored[: config.SEMANTIC_TRACE_TOP_N]
        step.set_output(
            {
                "ranked_candidates": len(scored),
                "shown_scores": [
                    {"id": entry.doc.id, "name": entry.doc.name, "cosine": round(score, 4)}
                    for entry, score in shown_scores
                ],
            }
        )
    return [Product.from_entry(entry) for entry, _ in scored]


__all__ = ["search_bm25", "search_semantic"]
