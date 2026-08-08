"""Typed request and response models for the recommend API.

These mirror the contract in ``docs/specs.md``. Every layer produces a
``SearchResult``; using pydantic means a malformed product or an
out-of-range facet fails loudly at the layer boundary rather than silently
reaching the browser.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from .catalog import CatalogEntry, Color, StorageOption

# --- Trace ------------------------------------------------------------------


class TraceStep(BaseModel):
    """One X-Ray trace row: what a layer did to answer this query.

    ``input`` and ``output`` are deliberately free-form dicts -- each layer
    decides what explains its work (BM25 shows per-token match counts, semantic
    search shows cosine scores). The envelope is what the UI contract fixes.

    ``name`` is the operation that ran (``search_semantic``, ``llmfn``);
    ``label`` is the plain-language purpose the panel shows instead ("semantic
    search"), derived from the name when the caller does not give one.

    ``running`` is the one status a finished response never carries: it
    belongs to a step being watched while it happens (see ``phonekit.trace``),
    and every step has settled by the time the turn is built.
    """

    layer: int
    name: str
    label: str = ""
    input: dict[str, Any] = Field(default_factory=dict)
    output: dict[str, Any] = Field(default_factory=dict)
    status: Literal["success", "fallback", "error", "skip", "running"] = "success"
    latency_ms: int = 0


class TraceTurn(BaseModel):
    """One user action and every step the pipeline ran to answer it.

    Steps belong to the turn that produced them, never to a flat per-request
    list: a session is a sequence of turns, and the panel groups by this
    envelope. ``kind`` distinguishes the opening search from later chat turns;
    ``error`` carries the failure message when a turn did not complete, in
    which case ``steps`` holds everything that ran up to the failing step.
    """

    kind: Literal["search", "chat"] = "search"
    input: str = ""
    steps: list[TraceStep] = Field(default_factory=list)
    status: Literal["success", "error"] = "success"
    latency_ms: int = 0
    error: str | None = None


# --- Products -------------------------------------------------------------


class ProductColor(BaseModel):
    """One colour option exposed to the card switcher."""

    name: str
    family: str
    hex: str | None = None
    image: str


class ProductStorageOption(BaseModel):
    """One purchasable storage/RAM tier exposed to the card picker."""

    gb: int
    label: str
    ram_gb: int | None = None
    price: int


class Product(BaseModel):
    """One result card: a parent phone fronted by its lead configuration.

    ``id``, ``name``, and ``brand`` come from the parent. ``price`` and
    ``image`` are the initially selected storage and colour. ``colors`` and
    ``storage_options`` let the browser switch the card locally without another
    recommend call.
    """

    id: str
    name: str
    brand: str
    price: int
    image: str
    variant_id: str
    color_name: str
    color_family: str
    storage_gb: int
    storage_label: str
    ram_gb: int | None = None
    colors: list[ProductColor]
    storage_options: list[ProductStorageOption]

    @classmethod
    def from_entry(
        cls,
        entry: CatalogEntry,
        colors: list[Color] | None = None,
        storage_options: list[StorageOption] | None = None,
    ) -> "Product":
        """Build the card for a catalogue entry.

        The first colour/storage option is the lead configuration (document
        order is canonical). Defaults to all of the entry's options; callers
        that have applied filters pass the surviving sublists instead.
        """
        doc = entry.doc
        colors = doc.colors if colors is None else colors
        storage_options = doc.storage_options if storage_options is None else storage_options
        lead_color = colors[0]
        lead_storage = storage_options[0]
        return cls(
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
    hex: str | None = None


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
    min: int = Field(description="lower price bound, inclusive")
    max: int = Field(description="upper price bound, inclusive")


class Filters(BaseModel):
    brands: list[str] = Field(default_factory=list, description="brands to keep; empty means all brands")
    colors: list[str] = Field(
        default_factory=list, description="canonical colour families to keep; empty means all colours"
    )
    price: PriceRange | None = Field(default=None, description="price range to keep; null means any price")


# --- Response -------------------------------------------------------------


class SearchResult(BaseModel):
    """The recommend payload, also passed between pipeline stages.

    A search stage returns one with products only; facets are filled
    downstream, computed over what survives the filters, and the trace turn is
    attached by the Application once the pipeline has run.
    """

    products: list[Product]
    facets: list[Facet] = Field(default_factory=list)
    trace: TraceTurn | None = None
    summary: str | None = None
    session_id: str | None = None
