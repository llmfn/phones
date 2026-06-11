"""Layer 3: Schema — structured output enforces Pass 1 response shape.

The LLM returns JSON with three fields: a rewritten query, optional filters
(max_price, min_battery_mah, os), and an optional persona. The structured
shape eliminates the inconsistency Layer 2 revealed. A persona tag triggers
re-ranking: phones that list the persona in their signals bubble up before
semantic rank.

**The failure moment this layer reveals:** the persona tag is heuristic —
signals coverage in the catalogue is uneven, so re-ranking helps some queries
and hurts others. Layer 4 addresses this.
"""

import json
import time

from .. import config
from ..catalog import CatalogEntry
from ..search.embeddings import corpus_embeddings, cosine, embed
from .base import Layer
from .schema import Filters, PriceRange, RecommendResponse

# ---------------------------------------------------------------------------
# Prompt levels -- edit ACTIVE_PROMPT to switch between them
# ---------------------------------------------------------------------------

_ZERO_SHOT = """\
Analyse the user's query and return a JSON object with these fields:
- "query": rewritten search query optimised for embedding space over phone specs
- "filters": object with optional integer fields "max_price", "min_battery_mah", and string field "os" ("android" or "ios")
- "persona": one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null

Return only valid JSON. No explanation, no markdown."""

_FEW_SHOT = """\
Analyse the user's query and return a JSON object with these fields:
- "query": rewritten search query optimised for embedding space over phone specs
- "filters": object with optional integer fields "max_price", "min_battery_mah", and string field "os" ("android" or "ios")
- "persona": one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null

Return only valid JSON. No explanation, no markdown.

Examples:
Input:  "phone for my grandma under 20000"
Output: {"query": "simple large display easy to use senior citizen phone", "filters": {"max_price": 20000}, "persona": "elderly"}

Input:  "gaming phone with big battery"
Output: {"query": "high performance gaming powerful processor large battery", "filters": {"min_battery_mah": 5000}, "persona": "gamer"}"""

_CHAIN_OF_THOUGHT = """\
First identify: user profile, primary need, price constraints, OS preference.
Then produce a JSON object with:
- "query": rewritten search query optimised for embedding space over phone specs
- "filters": object with optional integer fields "max_price", "min_battery_mah", and string field "os" ("android" or "ios")
- "persona": one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null

Return only valid JSON. No explanation, no markdown."""

ACTIVE_PROMPT = _ZERO_SHOT  # ← students edit this line to switch levels

_VALID_PERSONAS = {"elderly", "teen", "camera-lover", "gamer", "value-seeker"}


class Layer3(Layer):
    number = 3
    name = "Schema"

    def search(self, query: str) -> list[CatalogEntry]:
        raise NotImplementedError("Layer3 overrides run_query directly")

    def run_query(self, query: str, filters: Filters) -> RecommendResponse:
        self.trace = []

        structured = self._extract(query)
        rewritten = structured.get("query") or query
        persona = structured.get("persona")
        if persona not in _VALID_PERSONAS:
            persona = None
        extracted_filters = structured.get("filters") or {}

        max_price = extracted_filters.get("max_price")
        if max_price and filters.price is None:
            filters = Filters(
                brands=filters.brands,
                colors=filters.colors,
                price=PriceRange(min=0, max=int(max_price)),
            )

        candidates_with_scores = self._semantic_scored(rewritten)

        if persona:
            candidates_with_scores = self._rerank(candidates_with_scores, persona)

        candidates = [entry for entry, _ in candidates_with_scores]

        matches = []
        for entry in candidates:
            result = self._match(entry, filters)
            if result is not None:
                matches.append((entry, result))

        products = [self._card(entry, colors, storage) for entry, (colors, storage) in matches]
        facets = self._compute_facets(matches)
        return RecommendResponse(products=products, facets=facets, trace=self.trace)

    def _extract(self, query: str) -> dict:
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
                response_format={"type": "json_object"},
            )
            structured = json.loads(response.choices[0].message.content)
            self.add_step(
                input={"query": query, "prompt": ACTIVE_PROMPT},
                output={"structured": structured},
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return structured
        except Exception as exc:
            self.add_step(
                input={"query": query, "prompt": ACTIVE_PROMPT},
                output={"error": str(exc), "fallback_query": query},
                status="fallback",
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return {}

    def _semantic_scored(self, query: str) -> list[tuple[CatalogEntry, float]]:
        started = time.perf_counter()
        entries, vectors = corpus_embeddings()
        if not query.strip():
            scored = [(entry, 0.0) for entry in entries]
        else:
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
        return list(scored)

    def _rerank(
        self,
        candidates: list[tuple[CatalogEntry, float]],
        persona: str,
    ) -> list[tuple[CatalogEntry, float]]:
        reranked = sorted(
            candidates,
            key=lambda pair: (0 if persona in pair[0].doc.signals.personas else 1, -pair[1]),
        )
        top5 = reranked[:5]
        self.add_step(
            input={"persona": persona, "total_candidates": len(candidates)},
            output={
                "reranked_top5": [
                    {
                        "id": entry.doc.id,
                        "name": entry.doc.name,
                        "persona_match": persona in entry.doc.signals.personas,
                    }
                    for entry, _ in top5
                ]
            },
        )
        return reranked
