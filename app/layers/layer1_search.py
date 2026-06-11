"""Layer 1: search, at two levels.

The first real search layer, branching on ``config.SEARCH_MODE``. The base
``Layer`` still applies filters and computes facets over the result, so only
candidate selection changes -- and each mode explains itself in the trace.

**bm25** scores the query against an in-memory BM25 index over the whole
catalogue (see ``app/search``). This is keyword matching, nothing more: every
query word must appear somewhere in a phone's record, ranked by BM25 score. It
handles literal searches ("samsung 5g") but not vibe queries ("a phone for my
mom") -- words like "mom" match nothing, so the whole query returns no results
(the empty state in docs/specs.md). The trace shows that brittleness directly:
per-token match counts, zeros included.

**semantic** embeds the query and ranks the full catalogue by cosine similarity
against their pre-embedded narratives (see ``app/search/embeddings.py``). No
keyword needs to overlap: "for my mom" lands near narratives written about ease
of use. The trace shows the highest scores without limiting the candidates that
shared filters receive.
"""

import time

from .. import config
from ..catalog import CatalogEntry
from ..search.bm25 import tokenize
from ..search.embeddings import corpus_embeddings, cosine, embed
from ..search.index import catalog_index
from .base import Layer


class Layer1(Layer):
    number = 1
    name = "Search"

    def search(self, query: str) -> list[CatalogEntry]:
        if config.SEARCH_MODE == "semantic":
            return self._semantic(query)
        return self._bm25(query)

    def _bm25(self, query: str) -> list[CatalogEntry]:
        started = time.perf_counter()
        index, entries = catalog_index()
        tokens = tokenize(query)
        if not tokens:
            # No usable query: return the whole catalogue so filter-only
            # flows (and clearing the query) still show results.
            return list(entries)
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
        results = [entry for _, entry in scored]
        # How many phones each token appears in -- the zeros are the story.
        match_counts = {
            token: sum(1 for doc_scores in per_doc_scores if token in doc_scores)
            for token in dict.fromkeys(tokens)
        }
        self.add_step(
            input={"mode": "bm25", "query": query},
            output={"token_match_counts": match_counts, "results": len(results)},
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return results

    def _semantic(self, query: str) -> list[CatalogEntry]:
        started = time.perf_counter()
        entries, vectors = corpus_embeddings()
        if not query.strip():
            return list(entries)
        query_vector = embed([query])[0]
        scored = sorted(
            zip(entries, (cosine(query_vector, v) for v in vectors)),
            key=lambda pair: -pair[1],
        )
        shown_scores = scored[: config.SEMANTIC_TRACE_TOP_N]
        self.add_step(
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
        return [entry for entry, _ in scored]
