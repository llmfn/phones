"""Layer 2: Prompt — Pass 1 rewrites the raw query before semantic search.

The first LLM call in the pipeline. The model rewrites the user's natural-
language query into a form that lands well in embedding space, then the
existing semantic search runs on the rewrite.

**Three prompt levels** are defined below: zero-shot, few-shot, and
chain-of-thought. Students switch between them by editing the ``ACTIVE_PROMPT``
assignment. No config flag -- the prompt is the artifact, and the deliberate
hand-edit is the teaching device.

**The failure moment this layer reveals:** run the same query twice and observe
two different rewrites in the trace. The rewrite is useful -- vibe queries land
near the right phones -- but the output shape is inconsistent. Layer 3 exists
because of this.
"""

import time

from .. import config
from ..catalog import CatalogEntry
from ..search.embeddings import corpus_embeddings, cosine, embed
from .base import Layer

# ---------------------------------------------------------------------------
# Prompt levels -- edit ACTIVE_PROMPT to switch between them
# ---------------------------------------------------------------------------

_ZERO_SHOT = """\
Rewrite this query for semantic search over phone specs.
Output only the rewritten query — a single line of plain text, no explanation, no formatting.
Your output is passed directly to a search engine."""

_FEW_SHOT = """\
Rewrite queries for semantic search over phone specs.
Output only the rewritten query — a single line of plain text, no explanation, no formatting.
Your output is passed directly to a search engine.

Examples:
Input:  "wireless headphones under ₹3000"
Output: wireless audio headphones budget affordable
Input:  "something for a morning run"
Output: fitness outdoor activity sports lightweight"""

_CHAIN_OF_THOUGHT = """\
First identify: user profile, primary need, constraints.
Then rewrite as a search query optimised for semantic similarity over phone specs.
Output only the rewritten query — a single line of plain text, no explanation, no formatting.
Your output is passed directly to a search engine."""

ACTIVE_PROMPT = _ZERO_SHOT  # ← students edit this line to switch levels


class Layer2(Layer):
    number = 2
    name = "Prompt"

    def search(self, query: str) -> list[CatalogEntry]:
        entries, vectors = corpus_embeddings()

        if not query.strip():
            return list(entries)

        rewritten = self._rewrite(query)
        return self._semantic(rewritten, entries, vectors)

    def _rewrite(self, query: str) -> str:
        """Call the LLM to rewrite the query. Falls back to the raw query on failure."""
        started = time.perf_counter()
        try:
            if not config.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY not set")
            from openai import OpenAI

            client = OpenAI(api_key=config.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model=config.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": ACTIVE_PROMPT},
                    {"role": "user", "content": query},
                ],
            )
            rewritten = response.choices[0].message.content.strip()
            self.add_step(
                input={"query": query, "prompt": ACTIVE_PROMPT},
                output={"rewritten": rewritten},
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return rewritten
        except Exception as exc:
            self.add_step(
                input={"query": query, "prompt": ACTIVE_PROMPT},
                output={"error": str(exc), "fallback_query": query},
                status="fallback",
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return query

    def _semantic(
        self,
        query: str,
        entries: tuple[CatalogEntry, ...],
        vectors: list[list[float]],
    ) -> list[CatalogEntry]:
        started = time.perf_counter()
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
