"""Layer 2 - Prompt

Layer 2 of Phone recommender. Rewrites the search query using LLM. 
"""
from phonekit import Application, apply_filters, search_semantic, llmfn
from pathlib import Path

app = Application(__name__)

PROMPT = app.read_file("prompt.md")

def search(query, filters):
    query_refined = llmfn(instructions=PROMPT, input=query)
    products = search_semantic(query_refined)
    return apply_filters(products, filters)

if __name__ == "__main__":
    app.search = search
    app.run()
