"""phonekit: the building blocks each layer's app.py composes.

A library, not a framework: layer directories (``layer1/``, ``layer2/``, ...)
import everything they need from this module and own their control flow
top-to-bottom. ``Application`` is both the Flask server and the CLI runner;
the layer picks by how it invokes ``run()``.
"""

from .app import Application, apply_filters
from .catalog import get_brands
from .design_flags import DESIGN_FLAGS, default_design_flags
from .schema import RecommendResponse
from .search import rerank_by_persona, search_bm25, search_semantic
from .session import Session
from .llm import llmfn

__all__ = [
    "Application",
    "DESIGN_FLAGS",
    "RecommendResponse",
    "Session",
    "apply_filters",
    "default_design_flags",
    "get_brands",
    "rerank_by_persona",
    "search_bm25",
    "search_semantic",
    "llmfn",
]
