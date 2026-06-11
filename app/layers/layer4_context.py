"""Layer 4: Context — injects top-3 phones as context for a summary paragraph.

Pass 1 is identical to Layer 3 (structured extraction + persona re-ranking).
Pass 2 takes the top-3 results, injects their name, price, narrative, and
specs into a second LLM call, and returns a short recommendation paragraph
grounded strictly in those records.
"""

import json
import time

from .. import config
from ..catalog import CatalogEntry
from .layer3_schema import Layer3, _VALID_PERSONAS
from .schema import Filters, PriceRange, RecommendResponse

_PASS2_SYSTEM = """\
You are a phone recommendation assistant. You will be given a user query and details about 3 phones.
Write a short 2-3 sentence recommendation paragraph that helps the user choose.
Ground every claim strictly in the provided phone data. Do not mention phones not in the list.
Output only the paragraph — no bullet points, no headers, no markdown."""


class Layer4(Layer3):
    number = 4
    name = "Context"

    def run_query(self, query: str, filters: Filters) -> RecommendResponse:
        self.trace = []

        # --- Layer 3 logic (duplicated so we can intercept matches) ---
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

        # --- Pass 2: context summary ---
        top3_entries = [entry for entry, _ in matches[:3]]
        summary = self._summarize(query, top3_entries)

        return RecommendResponse(products=products, facets=facets, trace=self.trace, summary=summary)

    def _summarize(self, query: str, entries: list[CatalogEntry]) -> str | None:
        context_records = []
        for entry in entries:
            doc = entry.doc
            lead_price = doc.storage_options[0].price if doc.storage_options else 0
            context_records.append({
                "name": doc.name,
                "price": lead_price,
                "narrative": doc.narrative,
                "specs": doc.specs,
            })
        context_str = json.dumps(context_records, indent=2)

        self.add_step(
            input={"top_k": len(entries), "context": context_records},
            output={"prompt_chars": len(context_str)},
        )

        started = time.perf_counter()
        try:
            if not config.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY not set")
            from openai import OpenAI

            client = OpenAI(api_key=config.OPENAI_API_KEY)
            user_content = f"Query: {query}\n\nPhones:\n{context_str}"
            response = client.chat.completions.create(
                model=config.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": _PASS2_SYSTEM},
                    {"role": "user", "content": user_content},
                ],
            )
            text = response.choices[0].message.content.strip()
            self.add_step(
                input={"query": query, "phones_context": context_str},
                output={"summary": text},
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return text
        except Exception as exc:
            self.add_step(
                input={"query": query, "phones_context": context_str},
                output={"error": str(exc)},
                status="error",
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return None
