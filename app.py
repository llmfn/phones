"""Phone Recommender application. 

This is the phone recommender application used in teaching the llmfn course. 

Your goal is to build this llm-powered application layer by layer.

Layer 1 of Phone recommender with search functionalitiy. 
"""

from phonekit import Application, SearchResult


def search(q, filters):
    return SearchResult(products=[])

app = Application()
app.search = search

if __name__ == "__main__":
    app.run()
