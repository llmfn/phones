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

from ..catalog import CatalogEntry, Color, StorageOption
from .schema import (
    CategoricalFacet,
    Facet,
    FacetValue,
    Filters,
    Product,
    ProductColor,
    ProductStorageOption,
    RangeFacet,
    RecommendResponse,
    TraceStep,
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
        # One layer instance handles one request (see create_layer), so the
        # trace can accumulate on the instance: search() calls add_step() as
        # it works, and the steps ride back on the response.
        self.trace: list[TraceStep] = []
        candidates = self.search(query)
        matches = []  # (entry, (matching_colors, matching_storage_options))
        for entry in candidates:
            result = self._match(entry, filters)
            if result is not None:
                matches.append((entry, result))
        products = [self._card(entry, colors, storage) for entry, (colors, storage) in matches]
        facets = self._compute_facets(matches)
        return RecommendResponse(products=products, facets=facets, trace=self.trace)

    def add_step(
        self,
        input: dict,
        output: dict,
        status: str = "success",
        latency_ms: int = 0,
    ) -> None:
        self.trace.append(
            TraceStep(
                layer=self.number,
                name=self.name,
                input=input,
                output=output,
                status=status,
                latency_ms=latency_ms,
            )
        )

    # --- shared helpers ---------------------------------------------------

    def _match(
        self, entry: CatalogEntry, filters: Filters
    ) -> tuple[list[Color], list[StorageOption]] | None:
        """Return (matching colors, matching storage options) or None if the phone is excluded.

        Brand is a parent property; colour matches against colors.family and
        price matches against storage_options.price. Returns None if any active
        filter eliminates all options in its dimension.
        """
        doc = entry.doc
        if filters.brands and doc.brand not in set(filters.brands):
            return None
        colors = doc.colors
        storage = doc.storage_options
        if filters.colors:
            wanted = set(filters.colors)
            colors = [c for c in colors if c.family in wanted]
            if not colors:
                return None
        if filters.price is not None:
            lo, hi = filters.price.min, filters.price.max
            storage = [s for s in storage if lo <= s.price <= hi]
            if not storage:
                return None
        return (colors, storage)

    def _card(
        self,
        entry: CatalogEntry,
        colors: list[Color],
        storage_options: list[StorageOption],
    ) -> Product:
        doc = entry.doc
        lead_color = colors[0]
        lead_storage = storage_options[0]
        return Product(
            id=doc.id,
            name=doc.name,
            brand=doc.brand,
            price=lead_storage.price,
            image=lead_color.image,
            variant_id=f"{doc.id}-{lead_color.family}-{lead_storage.gb}",
            color_name=lead_color.name,
            color_family=lead_color.family,
            storage_gb=lead_storage.gb,
            storage_label=lead_storage.label,
            ram_gb=lead_storage.ram_gb,
            colors=[
                ProductColor(name=c.name, family=c.family, hex=c.hex, image=c.image)
                for c in colors
            ],
            storage_options=[
                ProductStorageOption(gb=s.gb, label=s.label, ram_gb=s.ram_gb, price=s.price)
                for s in storage_options
            ],
        )

    def _compute_facets(self, matches) -> list[Facet]:
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
        counts: dict[str, int] = {}
        for _, (colors, _) in matches:
            for family in {c.family for c in colors}:
                counts[family] = counts.get(family, 0) + 1
        return self._categorical("color", counts)

    def _price_facet(self, matches) -> RangeFacet:
        prices = [s.price for _, (_, storage) in matches for s in storage]
        return RangeFacet(field="price", min=min(prices, default=0), max=max(prices, default=0))

    def _categorical(self, field: str, counts: dict[str, int]) -> CategoricalFacet:
        values = [FacetValue(value=value, count=count) for value, count in counts.items()]
        values.sort(key=lambda v: (-v.count, v.value))
        return CategoricalFacet(field=field, values=values)
