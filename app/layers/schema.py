"""Typed request and response models for the recommend API.

These mirror the contract in ``docs/specs.md``. Every layer produces a
``RecommendResponse``; using pydantic means a malformed product or an
out-of-range facet fails loudly at the layer boundary rather than silently
reaching the browser.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

# --- Trace ------------------------------------------------------------------


class TraceStep(BaseModel):
    """One X-Ray trace row: what a layer did to answer this query.

    ``input`` and ``output`` are deliberately free-form dicts -- each layer
    decides what explains its work (BM25 shows per-token match counts, semantic
    search shows cosine scores). The envelope is what the UI contract fixes.
    """

    layer: int
    name: str
    input: dict[str, Any] = Field(default_factory=dict)
    output: dict[str, Any] = Field(default_factory=dict)
    status: Literal["success", "fallback", "error", "skip"] = "success"
    latency_ms: int = 0


# --- Products -------------------------------------------------------------


class Product(BaseModel):
    """One result card: a parent phone fronted by its representative variant.

    ``id``, ``name``, and ``brand`` come from the parent; ``price`` and
    ``image`` from the variant the card shows; ``variant_id``/``color_name``
    say which variant that is. ``colors`` is the number of colour families the
    product comes in — the card's "+N colours" hint shows ``colors - 1``.
    """

    id: str
    name: str
    brand: str
    price: int
    image: str
    variant_id: str
    color_name: str
    colors: int


# --- Facets ---------------------------------------------------------------
#
# Two structurally different kinds, joined by a discriminated union so the list
# can grow with data alone: a categorical facet is a set of selectable values
# with counts (brand, later RAM/OS/...); a range facet is numeric bounds
# (price). Adding a third categorical facet is just another CategoricalFacet in
# the list -- no schema change, and the frontend renders by ``type``.


class FacetValue(BaseModel):
    """One selectable value within a categorical facet, with its result count."""

    value: str
    count: int


class CategoricalFacet(BaseModel):
    type: Literal["categorical"] = "categorical"
    field: str  # "brand", later "ram", "os", ...
    values: list[FacetValue]


class RangeFacet(BaseModel):
    type: Literal["range"] = "range"
    field: str  # "price"
    min: int
    max: int


Facet = Annotated[CategoricalFacet | RangeFacet, Field(discriminator="type")]


# --- Request --------------------------------------------------------------


class PriceRange(BaseModel):
    min: int
    max: int


class Filters(BaseModel):
    brands: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)  # canonical colour families
    price: PriceRange | None = None


# --- Response -------------------------------------------------------------


class RecommendResponse(BaseModel):
    products: list[Product]
    facets: list[Facet]
    trace: list[TraceStep] = Field(default_factory=list)
