"""The in-memory phone catalogue.

The catalogue is the JSON documents in ``data/phones/`` loaded straight into
memory -- no database, no build step. ``load_catalog()`` reads and validates
every document once per process; layers share the result. Each entry keeps the
raw JSON dict alongside the validated model so search can index the whole
record while the API returns only the typed ``Product`` fields.
"""

import json
from functools import lru_cache
from pathlib import Path

from . import config
from .layers.schema import Product


class PhoneDoc(Product):
    """A catalogue entry: the API ``Product`` plus the search-only text.

    ``description`` is indexed for search but never returned to the browser,
    so it lives here, not in ``Product`` (see docs/specs.md).
    """

    description: str


class CatalogEntry:
    """One phone: the validated model plus the raw JSON it came from."""

    def __init__(self, doc: PhoneDoc, raw: dict):
        self.doc = doc
        self.raw = raw

    @property
    def product(self) -> Product:
        return Product(**self.doc.model_dump(include=set(Product.model_fields)))


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
