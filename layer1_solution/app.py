"""Layer 1 - Search

Layer 1 of Phone recommender with search functionalitiy. 

Pick from three search implmentations.
    - BM25: weighted match | probabilistic  
    - semantic: nearest match | vector
"""

from phonekit import Application, RecommendResponse, apply_filters, search_semantic

def search(q, filters) -> RecommendResponse:
    products = search_semantic(q)
    return apply_filters(products, filters)

if __name__ == "__main__":
    app = Application()
    app.search = search
    app.run()
