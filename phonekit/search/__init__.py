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

from .. import trace
from ..schema import Product
from .bm25 import tokenize
from .embeddings import EMBEDDING_MODEL, corpus_embeddings, cosine, embed
from .index import catalog_index

# How many semantic scores to include in the trace.
SEMANTIC_TRACE_TOP_N = 10

# Phones whose cosine similarity to the query falls below this threshold are
# excluded from results. Cosine never returns zero so without a cutoff every
# phone always appears; this filters out the genuinely irrelevant tail.
SEMANTIC_MIN_SCORE = 0.3


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


def search_semantic(query: str, min_score: float = SEMANTIC_MIN_SCORE) -> list[Product]:
    entries, vectors = corpus_embeddings()
    if not query.strip():
        # No usable query: return the whole catalogue so filter-only flows
        # (and clearing the query) still show results.
        return [Product.from_entry(e) for e in entries]
    step_input = {
        "query": query,
        "model": EMBEDDING_MODEL,
        "min_score": min_score,
        "trace_top_n": SEMANTIC_TRACE_TOP_N,
    }
    with trace.new_step(name="search_semantic", input=step_input) as step:
        query_vector = embed([query])[0]
        scored = sorted(
            zip(entries, (cosine(query_vector, v) for v in vectors)),
            key=lambda pair: -pair[1],
        )
        qualifying = [(entry, score) for entry, score in scored if score >= min_score]
        shown_scores = scored[: SEMANTIC_TRACE_TOP_N]
        step.set_output(
            {
                "ranked_candidates": len(scored),
                "qualifying": len(qualifying),
                "shown_scores": [
                    {"id": entry.doc.id, "name": entry.doc.name, "cosine": round(score, 4)}
                    for entry, score in shown_scores
                ],
            }
        )
    return [Product.from_entry(entry) for entry, _ in qualifying]


__all__ = ["search_bm25", "search_semantic"]
