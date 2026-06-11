"""The catalogue search index: whole JSON records flattened into BM25.

The indexer walks each phone's raw JSON and tokenizes every scalar value -- no
hard-coded field list -- so a richer record shape (narrative, specs, variant
colours) is searchable the moment it appears in ``data/phones/``. The flip side
is that *everything* is searchable, including image URLs and id slugs; pruning
those is a data-shape concern handled with the dataset itself.
"""

from functools import lru_cache

from ..catalog import CatalogEntry, load_catalog
from .bm25 import BM25Index, tokenize


def flatten_tokens(value) -> list[str]:
    """Tokenize every scalar in a JSON value, depth-first."""
    if isinstance(value, dict):
        return [t for v in value.values() for t in flatten_tokens(v)]
    if isinstance(value, list):
        return [t for v in value for t in flatten_tokens(v)]
    if value is None:
        return []
    return tokenize(str(value))


@lru_cache(maxsize=1)
def catalog_index() -> tuple[BM25Index, tuple[CatalogEntry, ...]]:
    """Build the BM25 index over the catalogue, once per process."""
    entries = load_catalog()
    index = BM25Index([flatten_tokens(e.raw) for e in entries])
    return index, entries
