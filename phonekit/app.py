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
import time
from pathlib import Path
from typing import Any, Callable

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
    TraceTurn,
)
from .playground import playground
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
        self.chat: Callable[[Session, str], str | dict[str, Any]] | None = None
        self.design_flags = default_design_flags()
        self.session_root = Path(session_root) if session_root else DEFAULT_SESSION_ROOT
        Session.configure_root(self.session_root)
        self.setup_routes()

    def setup_routes(self):
        self.add_url_rule("/", view_func=IndexView.as_view("index", self))
        self.add_url_rule("/api/recommend", view_func=RecommendView.as_view("recommend", self))
        self.add_url_rule("/api/conversation", view_func=ConversationView.as_view("conversation", self))
        self.add_url_rule("/api/trace/<run_id>", view_func=TraceView.as_view("trace", self))
        self.register_blueprint(playground)

    def read_file(self, path: str) -> str:
        """Read a file sitting beside the layer's app.py (prompts, schemas)."""
        return (Path(self.root_path) / path).read_text()

    def set_design_flag(self, name: str, value: str):
        """Set one active UI design variant after validating it."""
        validate_design_flag(name, value)
        self.design_flags[name] = value
        return self

    def run_query(
        self, query: str, filters: Filters | None = None, run_id: str = ""
    ) -> RecommendResponse:
        """Dispatch one query to the layer's search, as one traced turn.

        A pipeline that raises still produces a turn: the steps that ran up to
        the failure -- the last of them recorded as an error by ``new_step`` --
        come back with an empty result set, because a broken query is exactly
        when the trace is worth reading. Only a missing ``search`` raises,
        since that is the layer's own wiring, not its pipeline.

        ``run_id`` makes the turn watchable while it runs (see
        ``phonekit.trace.poll``); the turn returned here is the same one
        either way.
        """
        if self.search is None:
            raise RuntimeError("assign app.search before running queries")
        trace.reset(run_id)
        trace.set_layer_name(self.layer_name)
        started = time.perf_counter()
        try:
            response = self.search(query, filters or Filters())
        except Exception as exc:
            response = RecommendResponse(products=[])
            error = str(exc) or exc.__class__.__name__
        else:
            error = None
        response.trace = TraceTurn(
            kind="search",
            input=query,
            steps=trace.collect(),
            status="error" if error else "success",
            latency_ms=int((time.perf_counter() - started) * 1000),
            error=error,
        )
        trace.finish()
        return response

    def run_chat(
        self, session: Session, message: str, run_id: str = ""
    ) -> tuple[str | dict[str, Any], TraceTurn]:
        """Dispatch one chat message to the layer's chat hook, as one traced turn.

        A chat turn is traced exactly like a search turn -- from layer 5 on,
        the follow-up is where most of the pipeline runs, and a panel that
        went quiet after the first query would be showing the smaller half of
        the work. A hook that raises answers with its own error message, so a
        broken chat turn is readable in the panel instead of being a bare 500.
        """
        trace.reset(run_id)
        trace.set_layer_name(self.layer_name)
        started = time.perf_counter()
        try:
            reply = "message received" if self.chat is None else self.chat(session, message)
        except Exception as exc:
            error = str(exc) or exc.__class__.__name__
            reply = error
        else:
            error = None
        turn = TraceTurn(
            kind="chat",
            input=message,
            steps=trace.collect(),
            status="error" if error else "success",
            latency_ms=int((time.perf_counter() - started) * 1000),
            error=error,
        )
        trace.finish()
        return reply, turn

    def run(self, *args, **kwargs):
        """CLI when invoked with a flag, the dev server otherwise.

        ``uv run app.py --eval`` scores this layer against ``evals/evals.yaml``
        and exits with the result; bare ``uv run app.py`` serves this layer.

        Dispatching on argv here rather than from a separate runner script is
        what lets any layer be measured by invoking it -- the app is already
        wired by the time ``run`` is called, so the eval needs no way to reach
        inside a module and assemble one. ``evals`` is imported lazily because
        the server path has no use for it.
        """
        if "--eval" in sys.argv[1:]:
            from .evals import run_evals

            raise SystemExit(run_evals(self))
        kwargs.setdefault("debug", True)
        super().run(*args, **kwargs)


class BaseMethodView(MethodView):
    def __init__(self, app: Application):
        self.app = app


class IndexView(BaseMethodView):
    def get(self):
        return render_template("index.html", design_flags=self.app.design_flags)


# The panel mints one id per action and sends it with the request, so it can
# watch the trace while the answer is still being computed. A request without
# one is answered exactly as before, untraced by anyone -- which is what curl,
# the tests, and the CLI want.
RUN_ID_HEADER = "X-Run-Id"


class RecommendView(BaseMethodView):
    def post(self):
        body = request.get_json(silent=True) or {}
        query = body.get("query", "")
        filters = Filters.model_validate(body.get("filters") or {})

        result = self.app.run_query(query, filters, request.headers.get(RUN_ID_HEADER, ""))
        Session.new(query, filters, result)
        return jsonify(result.model_dump(exclude_none=True))


class ConversationView(BaseMethodView):
    def post(self):
        body = request.get_json(silent=True) or {}
        try:
            session = Session.load(body.get("session_id", ""))
        except (TypeError, ValueError, FileNotFoundError):
            return jsonify({"error": "unknown session_id"}), 404

        if not isinstance(body.get("message"), str):
            return jsonify({"error": "message is required"}), 400
        message = body["message"].strip()
        if not message:
            return jsonify({"error": "message is required"}), 400

        session.add_message(message)

        run_id = request.headers.get(RUN_ID_HEADER, "")
        reply, turn = self.app.run_chat(session, message, run_id)
        reply = _normalize_chat_reply(reply)

        session.add_message(_reply_text(reply), role="assistant")
        return jsonify(
            {
                "session_id": session.session_id,
                "reply": reply,
                "trace": turn.model_dump(exclude_none=True),
            }
        )


class TraceView(BaseMethodView):
    """The live view of a run: what changed since the version you hold.

    Blocks until something does, so watching a query costs about one request
    per step rather than one per tick. An answer that carries no changes means
    the wait timed out and the pipeline is still working.
    """

    def get(self, run_id: str):
        since = request.args.get("since", default=0, type=int)
        return jsonify(trace.poll(run_id, since))


def _normalize_chat_reply(reply: str | dict[str, Any]) -> str | dict[str, Any]:
    """Keep plain text replies plain, and sanitize rich replies to the public shape."""
    if isinstance(reply, str):
        return reply
    if not isinstance(reply, dict):
        return str(reply)

    text = str(reply.get("text", ""))
    normalized: dict[str, Any] = {"text": text}
    suggestions = reply.get("suggestions")
    if isinstance(suggestions, list):
        normalized["suggestions"] = [item for item in suggestions if isinstance(item, str)]
    return normalized


def _reply_text(reply: str | dict[str, Any]) -> str:
    if isinstance(reply, str):
        return reply
    return reply["text"]


def apply_filters(products: list[Product], filters: Filters | None) -> RecommendResponse:
    """Apply the filters to searched products and build the response.

    Keeps each product whose variants survive the filters (trimmed to the
    survivors, lead configuration re-derived) and computes facets over the
    result. Typically a layer's last line: ``return apply_filters(products,
    filters)``.
    """
    filters = filters or Filters()
    if not (filters.brands or filters.colors or filters.price):
        # Nothing to apply, and so nothing worth a row: a step reporting that it
        # let everything through is one the reader has to open to find out it
        # wasted the trip. The facets are still owed to the caller.
        return RecommendResponse(products=products, facets=_compute_facets(products))

    step_input = {"in": len(products), "filters": filters.model_dump()}
    with trace.new_step(name="apply_filters", input=step_input) as step:
        survivors: list[Product] = []
        removed: dict[str, int] = {}
        for product in products:
            survivor, cut = _filter_product(product, filters)
            if survivor is None:
                # One product, one cause. ``_filter_product`` stops at the first
                # dimension that excludes it, so a phone that is both the wrong
                # brand and too expensive is counted under brand alone -- which
                # is what makes these counts and the survivors add up to the
                # input. Counting every reason would total more than went in.
                removed[cut] = removed.get(cut, 0) + 1
            else:
                survivors.append(survivor)
        step.set_output({"kept": len(survivors), "removed": removed})
    return RecommendResponse(products=survivors, facets=_compute_facets(survivors))


def _filter_product(product: Product, filters: Filters) -> tuple[Product | None, str | None]:
    """The product with only its surviving options, and the filter that cut it.

    Exactly one half is set: a survivor and no cut, or no survivor and the name
    of the first dimension that excluded it. Brand is a parent property; colour
    matches against each option's family and price against each storage tier's
    price. A product is excluded when any active filter eliminates all options
    in its dimension. When options were trimmed, the card's lead fields are
    re-derived from the first survivors.
    """
    if filters.brands and product.brand not in set(filters.brands):
        return None, "brands"
    colors = product.colors
    if filters.colors:
        wanted = set(filters.colors)
        colors = [c for c in colors if c.family in wanted]
        if not colors:
            return None, "colors"
    storage_options = product.storage_options
    if filters.price is not None:
        lo, hi = filters.price.min, filters.price.max
        storage_options = [s for s in storage_options if lo <= s.price <= hi]
        if not storage_options:
            return None, "price"
    if colors is product.colors and storage_options is product.storage_options:
        return product, None
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
    ), None


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
    turn = response.trace
    if turn is None:
        return
    print(f"\nTrace: {turn.input}  {turn.latency_ms}ms")
    if turn.error:
        print(f"  error: {turn.error}")
    for step in turn.steps:
        print(f"[{step.layer}] {step.label}  ({step.name})  {step.status}  {step.latency_ms}ms")
        print(f"    input:  {json.dumps(step.input)}")
        print(f"    output: {json.dumps(step.output)}")
