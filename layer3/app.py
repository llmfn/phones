"""Layer 3 - Schema

Layer 3 of Phone recommender. Adds schema to the llm response. 
"""
from phonekit import Application, apply_filters, search_semantic, llmfn
from pathlib import Path
from pydantic import BaseModel, Field
from phonekit.schema import Filters

app = Application(__name__)

PROMPT = app.read_file("prompt.md")

class QueryFilters(BaseModel):
    """Hard filters extracted from the user's query."""
    max_price: int | None = Field(description="upper price limit mentioned in the query, or null")
    min_price: int | None = Field(description="lower price limit mentioned in the query, or null")
    color: str | None = Field(description="phone color the user asked for, or null")
    brand: str | None = Field(description="phone brand the user asked for, or null")

class Schema(BaseModel):
    """Output Schema of the llm response.
    """
    query: str = Field(description="rewritten search query optimised for embedding space over phone specs")
    filters: Filters = Field(description="hard filters to apply to the search results")
    persona: str | None = Field(description='one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null')

def search(query, filters):
    response = llmfn(instructions=PROMPT, input=query, output_schema=Schema)
    products = search_semantic(response.query)
    result = apply_filters(products, filters)
    return apply_filters(result.products, response.filters)

if __name__ == "__main__":
    app.search = search
    app.run()
