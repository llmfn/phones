"""Layer 0: dummy data, no search.

The baseline the course builds on. It ignores the query and returns the whole
catalogue; the base ``Layer`` then applies filters and computes facets, so
brand/colour/price filtering works even though no real search exists yet.
Layer 1 adds keyword search by overriding ``search``.
"""

from ..catalog import CatalogEntry, load_catalog
from .base import Layer


class Layer0(Layer):
    number = 0
    name = "Dummy data"

    def search(self, query: str) -> list[CatalogEntry]:
        # No search yet: the query is ignored and the whole catalogue is
        # returned. Filtering and faceting happen in the base Layer.
        return list(load_catalog())
