"""Layer registry and factory.

``create_layer`` reads the active layer from config and returns its instance.
Register new layers in ``_LAYERS`` as they are implemented.
"""

from .. import config
from .base import Layer
from .layer0_dummy_data import Layer0

_LAYERS: dict[int, type[Layer]] = {
    0: Layer0,
}


def create_layer() -> Layer:
    return _LAYERS[config.CURRENT_LAYER]()


__all__ = ["create_layer", "Layer"]
