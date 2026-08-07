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
from ..catalog import load_catalog
from ..schema import Product
from .bm25 import tokenize
from .embeddings import EMBEDDING_MODEL, corpus_embeddings, cosine, embed
from .index import catalog_index

# How many scored phones to include in the trace, per engine.
SEMANTIC_TRACE_TOP_N = 10
BM25_TRACE_TOP_N = 10

# Phones whose cosine similarity to the query falls below this threshold are
# excluded from results. Cosine never returns zero so without a cutoff every
# phone always appears; this filters out the genuinely irrelevant tail.
SEMANTIC_MIN_SCORE = 0.3


def search_bm25(query: str) -> list[Product]:
    """Rank phones with lexical BM25 matching over the catalogue index.

    Every usable query token must appear in a phone document. Empty or
    tokenless queries return the full catalogue so filters can still operate
    without a search term.
    """
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
            (sum(token_scores.values()), token_scores, position, entry)
            for position, (token_scores, entry) in enumerate(zip(per_doc_scores, entries))
            if len(token_scores) == len(set(tokens))
        ]
        scored.sort(key=lambda row: -row[0])
        matches = {
            token: sum(1 for doc_scores in per_doc_scores if token in doc_scores)
            for token in dict.fromkeys(tokens)
        }
        # Heaviest word first, and the words nothing holds last, next to the
        # count they caused. Lists rather than objects because the order carries
        # meaning and a JSON object's keys are the serializer's to reorder --
        # Flask sorts them alphabetically, which is a fact about spelling.
        # A token in no document scores the highest idf of all, so ranking on
        # the raw weight would float exactly the words that matched nothing to
        # the top; sorting misses out first is what keeps that honest.
        ordered = sorted(matches, key=lambda token: (matches[token] == 0, -index.idf(token)))
        # Two separate stories, so the trace reports them separately. Per token,
        # facts about the catalogue that are the same for every result: how many
        # phones hold the word (the zeros are why a vibe query dies) and the
        # weight rarity earns it. Per ranked phone, the facts that actually
        # differ and therefore decide the order: how often it repeats each word,
        # how long the record is, and what each word contributed.
        step.set_output(
            {
                "catalogue_size": len(entries),
                "average_length": round(index.avg_len, 1),
                "k1": index.k1,
                "b": index.b,
                "tokens": [
                    {
                        "token": token,
                        "matches": matches[token],
                        "weight": round(index.idf(token), 4),
                    }
                    for token in ordered
                ],
                "results": len(scored),
                "top_scores": [
                    {
                        "id": entry.doc.id,
                        "name": entry.doc.name,
                        "score": round(total, 4),
                        "length": index.doc_lens[position],
                        "tokens": [
                            {
                                "token": token,
                                "count": index.doc_counts[position][token],
                                "score": round(token_scores[token], 4),
                            }
                            for token in ordered
                        ],
                    }
                    for total, token_scores, position, entry in scored[:BM25_TRACE_TOP_N]
                ],
            }
        )
    return [Product.from_entry(entry) for *_, entry in scored]


def search_semantic(query: str, min_score: float = SEMANTIC_MIN_SCORE) -> list[Product]:
    """Rank phones by embedding similarity to the query.

    The query is embedded once, compared with each cached phone narrative
    embedding, and filtered by ``min_score`` to remove the irrelevant tail.
    Empty queries return the full catalogue for filter-only flows.
    """
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


def rerank_by_persona(products: list[Product], persona: str | None) -> list[Product]:
    """Boost products whose catalogue persona signals match the requested persona.

    This is a soft re-rank, not a filter. Matching products move ahead of
    non-matching products, while the existing search order is preserved within
    each group.
    """
    if persona is None:
        return products

    docs = {entry.doc.id: entry.doc for entry in load_catalog()}
    with trace.new_step(name="rerank_by_persona", input={"persona": persona}) as step:
        reranked = sorted(
            products,
            key=lambda product: persona in docs[product.id].signals.personas,
            reverse=True,
        )
        step.set_output(
            {
                "matching": [
                    product.id
                    for product in reranked
                    if persona in docs[product.id].signals.personas
                ],
                "results": len(reranked),
            }
        )
    return reranked


__all__ = ["rerank_by_persona", "search_bm25", "search_semantic"]
