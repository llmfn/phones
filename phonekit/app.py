"""The Application a layer's app.py hands its search function to.

``Application`` extends Flask, so one object is the whole product: the same
instance that answers ``POST /api/recommend`` also runs the terminal CLI
(``run()`` picks by invocation). The layer owns its pipeline top-to-bottom
inside the ``search(query, filters)`` callable it assigns -- which engine to
call, prompts, fallback policy, and applying the filters, typically via
``apply_filters`` as its last line. The Application only dispatches the query
and injects the collected trace (see ``phonekit.trace``) into the response.

Filters work at the variant level (see docs/specs.md, "Catalogue & variants"):
a phone stays in the results if any variant survives the colour and price
filters, and the first surviving option -- document order is canonical -- is
the representative the card shows. So a "red" colour filter both narrows the
result set and makes each surviving card show its red variant.

The Flask import name works the usual way: a layer passes ``__name__`` (or
relies on the ``__main__`` default), which anchors ``root_path`` to the layer
directory -- that is what lets ``read_file`` find prompts sitting beside the
layer's app.py. Templates and static assets always come from this package.
"""

import json
import sys
from pathlib import Path
from typing import Callable

from flask import Flask, jsonify, render_template, request
from flask.views import MethodView

from . import trace
from .design_flags import default_design_flags, validate_design_flag
from .schema import (
    CategoricalFacet,
    Facet,
    FacetValue,
    Filters,
    Product,
    RangeFacet,
    RecommendResponse,
)
from .session import DEFAULT_SESSION_ROOT, Session

_PACKAGE_DIR = Path(__file__).parent


class Application(Flask):
    """PhoneKit application, an extended Flask app."""

    def __init__(self, import_name: str = "__main__", **kwargs):
        session_root = kwargs.pop("session_root", None)
        kwargs.setdefault("template_folder", _PACKAGE_DIR / "templates")
        kwargs.setdefault("static_folder", _PACKAGE_DIR / "static")
        super().__init__(import_name, **kwargs)
        # The layer is named after its directory: import_name -> module file
        # -> parent dir ("layer1"), which Flask has already resolved as
        # root_path. Trace steps are stamped with it.
        self.layer_name = Path(self.root_path).name
        self.search: Callable[[str, Filters], RecommendResponse] | None = None
        self.design_flags = default_design_flags()
        self.session_root = Path(session_root) if session_root else DEFAULT_SESSION_ROOT
        Session.configure_root(self.session_root)
        self.setup_routes()

    def setup_routes(self):
        self.add_url_rule("/", view_func=IndexView.as_view("index", self))
        self.add_url_rule("/api/recommend", view_func=RecommendView.as_view("recommend", self))
        self.add_url_rule("/api/conversation", view_func=ConversationView.as_view("conversation", self))

    def read_file(self, path: str) -> str:
        """Read a file sitting beside the layer's app.py (prompts, schemas)."""
        return (Path(self.root_path) / path).read_text()

    def set_design_flag(self, name: str, value: str):
        """Set one active UI design variant after validating it."""
        validate_design_flag(name, value)
        self.design_flags[name] = value
        return self

    def run_query(self, query: str, filters: Filters | None = None) -> RecommendResponse:
        """Dispatch one query to the layer's search, with a fresh trace."""
        if self.search is None:
            raise RuntimeError("assign app.search before running queries")
        trace.reset()
        trace.set_layer_name(self.layer_name)
        response = self.search(query, filters or Filters())
        response.trace = trace.collect()
        return response

    def run(self, *args, **kwargs):
        """CLI when invoked with a query, the dev server otherwise.

        ``uv run app.py "a phone for my mom"`` prints cards and the trace
        without touching Flask; bare ``uv run app.py`` serves this layer.
        """
        argv = sys.argv[1:]
        if argv:
            _print_response(self.run_query(" ".join(argv)))
        else:
            super().run(*args, **kwargs)


class BaseMethodView(MethodView):
    def __init__(self, app: Application):
        self.app = app


class IndexView(BaseMethodView):
    def get(self):
        return render_template("index.html", design_flags=self.app.design_flags)


class RecommendView(BaseMethodView):
    def post(self):
        trace.set_layer_name(self.app.layer_name)
        body = request.get_json(silent=True) or {}
        query = body.get("query", "")
        filters = Filters.model_validate(body.get("filters") or {})

        result = self.app.run_query(query, filters)
        Session.new(query, filters, result)
        return jsonify(result.model_dump(exclude_none=True))


class ConversationView(BaseMethodView):
    def post(self):
        body = request.get_json(silent=True) or {}
        try:
            session = Session.load(body.get("session_id", ""))
        except (TypeError, ValueError, FileNotFoundError):
            return jsonify({"error": "unknown session_id"}), 404

        messages = body.get("messages")
        if messages is None and isinstance(body.get("message"), str):
            messages = [body["message"]]
        if not isinstance(messages, list) or not all(isinstance(message, str) for message in messages):
            return jsonify({"error": "messages must be a list of strings"}), 400
        messages = [message.strip() for message in messages if message.strip()]
        if not messages:
            return jsonify({"error": "message is required"}), 400

        for message in messages:
            session.add_message(message)

        reply = self.get_response(session, messages)

        session.add_message(reply, role="assistant")
        return jsonify({"session_id": session.session_id, "reply": reply})

    def get_response(self, session, messages):
        return "message received"


def apply_filters(products: list[Product], filters: Filters | None) -> RecommendResponse:
    """Apply the filters to searched products and build the response.

    Keeps each product whose variants survive the filters (trimmed to the
    survivors, lead configuration re-derived) and computes facets over the
    result. Typically a layer's last line: ``return apply_filters(products,
    filters)``.
    """
    filters = filters or Filters()
    survivors = [
        survivor
        for product in products
        if (survivor := _filter_product(product, filters)) is not None
    ]
    return RecommendResponse(products=survivors, facets=_compute_facets(survivors))


def _filter_product(product: Product, filters: Filters) -> Product | None:
    """The product with only its surviving options, or None if excluded.

    Brand is a parent property; colour matches against each option's family
    and price against each storage tier's price. A product is excluded when
    any active filter eliminates all options in its dimension. When options
    were trimmed, the card's lead fields are re-derived from the first
    survivors.
    """
    if filters.brands and product.brand not in set(filters.brands):
        return None
    colors = product.colors
    if filters.colors:
        wanted = set(filters.colors)
        colors = [c for c in colors if c.family in wanted]
        if not colors:
            return None
    storage_options = product.storage_options
    if filters.price is not None:
        lo, hi = filters.price.min, filters.price.max
        storage_options = [s for s in storage_options if lo <= s.price <= hi]
        if not storage_options:
            return None
    if colors is product.colors and storage_options is product.storage_options:
        return product
    lead_color, lead_storage = colors[0], storage_options[0]
    return product.model_copy(
        update={
            "price": lead_storage.price,
            "image": lead_color.image,
            "variant_id": f"{product.id}-{lead_color.family}-{lead_storage.gb}",
            "color_name": lead_color.name,
            "color_family": lead_color.family,
            "storage_gb": lead_storage.gb,
            "storage_label": lead_storage.label,
            "ram_gb": lead_storage.ram_gb,
            "colors": colors,
            "storage_options": storage_options,
        }
    )


def _compute_facets(products: list[Product]) -> list[Facet]:
    """Facets are scoped to the current result set (see docs/specs.md)."""
    brand_counts: dict[str, int] = {}
    color_counts: dict[str, int] = {}
    color_hex: dict[str, str] = {}
    for product in products:
        brand_counts[product.brand] = brand_counts.get(product.brand, 0) + 1
        for c in product.colors:
            color_counts[c.family] = color_counts.get(c.family, 0) + 1
            if c.hex and c.family not in color_hex:
                color_hex[c.family] = c.hex
    prices = [s.price for p in products for s in p.storage_options]
    return [
        _categorical("brand", brand_counts),
        _categorical("color", color_counts, color_hex),
        RangeFacet(field="price", min=min(prices, default=0), max=max(prices, default=0)),
    ]


def _categorical(field: str, counts: dict[str, int], hex_map: dict[str, str] | None = None) -> CategoricalFacet:
    values = [FacetValue(value=value, count=count, hex=(hex_map or {}).get(value)) for value, count in counts.items()]
    values.sort(key=lambda v: (-v.count, v.value))
    return CategoricalFacet(field=field, values=values)


def _print_response(response: RecommendResponse) -> None:
    if not response.products:
        print("No results.")
    for rank, p in enumerate(response.products, 1):
        print(
            f"{rank:3}. {p.name:<36} {p.brand:<10} "
            f"₹{p.price:>9,}  {p.color_name} / {p.storage_label}"
        )
    if response.summary:
        print(f"\n{response.summary}")
    print("\nTrace")
    for step in response.trace:
        print(f"[{step.layer}] {step.name}  {step.status}  {step.latency_ms}ms")
        print(f"    input:  {json.dumps(step.input)}")
        print(f"    output: {json.dumps(step.output)}")
