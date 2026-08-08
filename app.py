"""Phone Recommender application. 

This is the phone recommender application used in teaching the llmfn course. 

Your goal is to build this llm-powered application layer by layer.

See README.md for instructions and docs/phonekit.md for docs.
"""

from phonekit import Application, SearchResult

def search(q, filters):
    # FIXME
    products = []
    return SearchResult(products=products)

app = Application()
app.search = search

if __name__ == "__main__":
    app.run()
