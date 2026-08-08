"""Layer 2 - Prompt

Layer 2 of Phone recommender. Rewrites the search query using LLM. 
"""
from phonekit import Application, apply_filters, search_semantic, llmfn
from pathlib import Path

app = Application(__name__)
def search(query, filters):
    prompt_rewrite = app.read_file("prompts/rewrite.md")

    # refine the query using llm
    query_refined = llmfn(instructions=prompt_rewrite, input=query, label="rewrite")

    # search with the refined query
    products = search_semantic(query_refined)

    # apply the filters selected by the user
    return apply_filters(products, filters)

if __name__ == "__main__":
    # Setup the app to use our search function
    app.search = search
    app.run()
