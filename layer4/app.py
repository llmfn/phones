"""Layer 4 - Context

Layer 4 of Phone recommender. Injects the top-3 results as context for a
second LLM pass that writes a short recommendation paragraph grounded in
those records.
"""
import json

from phonekit import Application, apply_filters, rerank_by_persona, search_semantic, llmfn
from phonekit.catalog import load_catalog
from pydantic import BaseModel, Field
from phonekit.schema import Filters

app = Application(__name__)

## You could tweak some design flags to change how the app elements are arranged
# app.set_design_flag("CHIPS_POSITION", "above_results")
# app.set_design_flag("FILTER_UI", "popover")

# Task: The summarize function uses prompt_summary.md as prompt to summarize and write
# a recommendation. Fix the prompt to make it write a good recommendation.

class Schema(BaseModel):
    """Output Schema of the llm response.
    """
    query: str = Field(description="rewritten search query optimised for embedding space over phone specs")
    filters: Filters = Field(description="hard filters to apply to the search results")
    persona: str | None = Field(description='one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null')

def summarize(query, products):
    """Recommendation paragraph for the top-3 products, grounded in their catalogue records."""
    PROMPT_SUMMARY = app.read_file("prompt_summary.md")
    docs = {entry.doc.id: entry.doc for entry in load_catalog()}
    context = [
        {
            "name": p.name,
            "price": p.price,
            "narrative": docs[p.id].narrative,
            "specs": docs[p.id].specs,
        }
        for p in products[:3]
    ]
    # construct the input from query and matched phones
    input = f"Query: {query}\n\nPhones:\n{json.dumps(context, indent=2)}"
    return llmfn(instructions=PROMPT_SUMMARY, input=input)

def search(query, filters):
    PROMPT = app.read_file("prompt.md")
    response = llmfn(instructions=PROMPT, input=query, output_schema=Schema)
    products = search_semantic(response.query)
    products = rerank_by_persona(products, response.persona)
    result = apply_filters(products, filters)
    result = apply_filters(result.products, response.filters)
    if result.products:
        result.summary = summarize(query, result.products)
    return result

if __name__ == "__main__":
    app.search = search
    app.run()
