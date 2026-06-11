"""The Layer abstraction the whole course pivots on.

Each course layer (search, prompt, schema, ...) is a ``Layer`` subclass that
changes the same product-search surface. The base class owns the parts every
layer shares -- resolving filters against each phone's variants and computing
facets over the result -- so a subclass only decides which phones a query
selects. Layer 0 (dummy data) ignores the query entirely; Layer 1 (search)
overrides ``search`` to actually match keywords.

Filters work at the variant level (see docs/specs.md, "Catalogue & variants"):
a phone stays in the results if any variant survives the colour and price
filters, and the first surviving variant -- document order is canonical -- is
the representative the card shows. So a "red" colour filter both narrows the
result set and makes each surviving card show its red variant.
"""

from ..catalog import CatalogEntry, Variant
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

    def search(self, query: str) -> list[CatalogEntry]:
        """Return the candidate phones for a query, ranked, before filtering.

        Overridden per layer. The base raises, so every concrete layer must
        say how a query selects phones.
        """
        raise NotImplementedError

    def run_query(self, query: str, filters: Filters) -> RecommendResponse:
        candidates = self.search(query)
        matches = []  # (entry, its variants that survive the filters)
        for entry in candidates:
            variants = self._matching_variants(entry, filters)
            if variants:
                matches.append((entry, variants))
        products = [self._card(entry, variants[0]) for entry, variants in matches]
        facets = self._compute_facets(matches)
        return RecommendResponse(products=products, facets=facets)

    # --- shared helpers ---------------------------------------------------

    def _matching_variants(self, entry: CatalogEntry, filters: Filters) -> list[Variant]:
        """The variants of one phone that survive the filters, in document order.

        Brand is a parent property; colour and price are variant properties.
        An empty result drops the phone; otherwise the first survivor is the
        representative variant its card shows.
        """
        doc = entry.doc
        if filters.brands and doc.brand not in set(filters.brands):
            return []
        variants = doc.variants
        if filters.colors:
            wanted = set(filters.colors)
            variants = [v for v in variants if v.color_family in wanted]
        if filters.price is not None:
            lo, hi = filters.price.min, filters.price.max
            variants = [v for v in variants if lo <= v.price <= hi]
        return variants

    def _card(self, entry: CatalogEntry, variant: Variant) -> Product:
        doc = entry.doc
        families = {v.color_family for v in doc.variants}
        return Product(
            id=doc.id,
            name=doc.name,
            brand=doc.brand,
            price=variant.price,
            image=variant.image,
            variant_id=variant.id,
            color_name=variant.color_name,
            colors=len(families),
        )

    def _compute_facets(self, matches: list[tuple[CatalogEntry, list[Variant]]]) -> list[Facet]:
        """Facets are scoped to the current result set (see docs/specs.md)."""
        return [
            self._brand_facet(matches),
            self._color_facet(matches),
            self._price_facet(matches),
        ]

    def _brand_facet(self, matches) -> CategoricalFacet:
        counts: dict[str, int] = {}
        for entry, _ in matches:
            brand = entry.doc.brand
            counts[brand] = counts.get(brand, 0) + 1
        return self._categorical("brand", counts)

    def _color_facet(self, matches) -> CategoricalFacet:
        # Counts products, not variants: a phone with two black variants
        # contributes one to "black".
        counts: dict[str, int] = {}
        for _, variants in matches:
            for family in {v.color_family for v in variants}:
                counts[family] = counts.get(family, 0) + 1
        return self._categorical("color", counts)

    def _price_facet(self, matches) -> RangeFacet:
        prices = [v.price for _, variants in matches for v in variants]
        return RangeFacet(field="price", min=min(prices, default=0), max=max(prices, default=0))

    def _categorical(self, field: str, counts: dict[str, int]) -> CategoricalFacet:
        values = [FacetValue(value=value, count=count) for value, count in counts.items()]
        values.sort(key=lambda v: (-v.count, v.value))
        return CategoricalFacet(field=field, values=values)
