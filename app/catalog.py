"""The in-memory phone catalogue.

The catalogue is the JSON documents in ``data/phones/`` loaded straight into
memory -- no database, no build step. ``load_catalog()`` reads and validates
every document once per process; layers share the result. Each entry keeps the
raw JSON dict alongside the validated model so search can index the whole
record while the API returns only the typed ``Product`` projection.

Each document is a **parent phone plus its purchasable variants** (see
docs/specs.md, "Catalogue & variants"). The parent owns what every
configuration shares -- specs, signals, and the narrative written for semantic
search; each variant owns its colour, RAM/storage, price, and image. Variant
order is canonical: the first variant is the lead configuration, and the first
one to survive the filters is what a result card shows.
"""

import json
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, Field

from . import config


class Variant(BaseModel):
    """One purchasable configuration: a colour and RAM/storage combination.

    Colour is two fields on purpose: ``color_name`` is the marketing name the
    UI shows ("Awesome Graphite"); ``color_family`` is the canonical family
    ("black") the colour filter and facet match on.
    """

    id: str
    color_name: str
    color_family: str
    ram_gb: int
    storage_gb: int
    price: int
    image: str


class PhoneDoc(BaseModel):
    """A catalogue document: the parent product and its variants.

    ``narrative``, ``specs``, and ``signals`` are search/teaching material,
    never returned to the browser (see docs/specs.md). ``narrative`` is one
    paragraph written for semantic search; ``signals`` are use-case tags.
    """

    id: str
    brand: str
    name: str
    narrative: str
    specs: dict[str, Any] = Field(default_factory=dict)
    signals: list[str] = Field(default_factory=list)
    variants: list[Variant] = Field(min_length=1)


class CatalogEntry:
    """One phone: the validated model plus the raw JSON it came from."""

    def __init__(self, doc: PhoneDoc, raw: dict):
        self.doc = doc
        self.raw = raw


@lru_cache(maxsize=1)
def load_catalog() -> tuple[CatalogEntry, ...]:
    """Read and validate every phone document, sorted by id for stable output."""
    paths = sorted(config.PHONES_DIR.glob("*.json"))
    if not paths:
        raise RuntimeError(f"No phone documents found in {config.PHONES_DIR}")
    entries = []
    for path in paths:
        raw = json.loads(path.read_text())
        try:
            doc = PhoneDoc.model_validate(raw)
        except Exception as exc:  # surface which file is malformed
            raise RuntimeError(f"Invalid phone document {path.name}: {exc}") from exc
        entries.append(CatalogEntry(doc, raw))
    return tuple(entries)
