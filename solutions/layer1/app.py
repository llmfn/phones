"""Layer 1 - Search

Layer 1 of Phone recommender with search functionalitiy. 

Pick from three search implmentations.
    - BM25: weighted match | probabilistic  
    - semantic: nearest match | vector
"""

from phonekit import Application, SearchResult, apply_filters, search_bm25, search_semantic

def search(q, filters) -> SearchResult:
    # products = search_bm25(q)
    products = search_semantic(q)
    return apply_filters(products, filters)

app = Application()
app.search = search

if __name__ == "__main__":
    app.run()
