"""The Layer abstraction the whole course pivots on.

Each course layer (search, prompt, schema, ...) is a ``Layer`` subclass that
changes the same product-search surface. The base class owns the parts every
layer shares -- applying brand/price filters and computing facets over the
result -- so a subclass only decides which products a query selects. Layer 0
(dummy data) ignores the query entirely; Layer 1 (search) will override
``search`` to actually match keywords.
"""

from .schema import (
    CategoricalFacet,
    Facet,
    FacetValue,
    Filters,
    Product,
    RangeFacet,
    RecommendResponse,
)


class Layer:
    number: int = 0
    name: str = "Layer"

    def search(self, query: str) -> list[Product]:
        """Return the candidate products for a query, before filtering.

        Overridden per layer. The base raises, so every concrete layer must
        say how a query selects products.
        """
        raise NotImplementedError

    def run_query(self, query: str, filters: Filters) -> RecommendResponse:
        candidates = self.search(query)
        results = self._apply_filters(candidates, filters)
        facets = self._compute_facets(results)
        return RecommendResponse(products=results, facets=facets)

    # --- shared helpers ---------------------------------------------------

    def _apply_filters(self, products: list[Product], filters: Filters) -> list[Product]:
        results = products
        if filters.brands:
            wanted = set(filters.brands)
            results = [p for p in results if p.brand in wanted]
        if filters.price is not None:
            lo, hi = filters.price.min, filters.price.max
            results = [p for p in results if lo <= p.price <= hi]
        return results

    def _compute_facets(self, products: list[Product]) -> list[Facet]:
        """Facets are scoped to the current result set (see docs/specs.md)."""
        return [self._brand_facet(products), self._price_facet(products)]

    def _brand_facet(self, products: list[Product]) -> CategoricalFacet:
        counts: dict[str, int] = {}
        for p in products:
            counts[p.brand] = counts.get(p.brand, 0) + 1
        values = [FacetValue(value=brand, count=count) for brand, count in counts.items()]
        values.sort(key=lambda v: (-v.count, v.value))
        return CategoricalFacet(field="brand", values=values)

    def _price_facet(self, products: list[Product]) -> RangeFacet:
        prices = [p.price for p in products]
        return RangeFacet(field="price", min=min(prices, default=0), max=max(prices, default=0))
