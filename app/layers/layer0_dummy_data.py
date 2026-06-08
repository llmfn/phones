"""Layer 0: dummy data, no search.

The baseline the course builds on. It ignores the query and returns the whole
catalogue; the base ``Layer`` then applies filters and computes facets, so
brand/price filtering works even though no real search exists yet. Layer 1 adds
keyword search by overriding ``search``.
"""

from .base import Layer
from .schema import Product

# A small fixed catalogue (matches the six cards in docs/mockups.md). Inline for
# now; extract to a shared module once Layer 1 needs the same data.
_CATALOGUE = [
    Product(id="samsung-a54", name="Galaxy A54", brand="Samsung", price=38999,
            image="https://placehold.co/200x200?text=Galaxy+A54"),
    Product(id="google-pixel-8a", name="Pixel 8a", brand="Google", price=52999,
            image="https://placehold.co/200x200?text=Pixel+8a"),
    Product(id="apple-iphone-se", name="iPhone SE", brand="Apple", price=49900,
            image="https://placehold.co/200x200?text=iPhone+SE"),
    Product(id="oneplus-nord-ce4", name="Nord CE4", brand="OnePlus", price=24999,
            image="https://placehold.co/200x200?text=Nord+CE4"),
    Product(id="samsung-m14", name="Galaxy M14", brand="Samsung", price=13499,
            image="https://placehold.co/200x200?text=Galaxy+M14"),
    Product(id="moto-g84", name="Moto G84", brand="Moto", price=17999,
            image="https://placehold.co/200x200?text=Moto+G84"),
]


class Layer0(Layer):
    number = 0
    name = "Dummy data"

    def search(self, query: str) -> list[Product]:
        # No search yet: the query is ignored and the whole catalogue is
        # returned. Filtering and faceting happen in the base Layer.
        return list(_CATALOGUE)
