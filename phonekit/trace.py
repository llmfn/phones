"""Query-scoped collection of X-Ray trace steps.

The trace is system telemetry, not pipeline data: building blocks (search
engines, the LLM helper) report what they did via ``add_step`` without their
return types having to carry it -- the same way request-scoped logging or
OpenTelemetry spans ride alongside business code. The Application resets the
trace before dispatching a query and injects the collected steps into the
response afterwards; layer code never touches the trace unless it wants to
record a step of its own.

A ``ContextVar`` rather than Flask's ``g`` so the same mechanism works in the
CLI (where there is no request context) and stays isolated per request under
a threaded server. Steps recorded outside any query (no ``reset`` yet) are
dropped silently, so building blocks stay callable from a bare REPL.
"""

import re
from contextvars import ContextVar

from .schema import TraceStep

_steps: ContextVar[list[TraceStep] | None] = ContextVar("trace_steps", default=None)
_layer_name: ContextVar[str] = ContextVar("trace_layer_name", default="")


def reset() -> None:
    """Start a fresh trace for one query."""
    _steps.set([])


def set_layer_name(name: str) -> None:
    """Name the layer answering the current query (e.g. "layer1").

    Every step recorded until the next call is stamped with it -- the layer
    number shown in the X-Ray badge is parsed from its digits. Empty by
    default, so steps recorded outside an Application stamp layer 0.
    """
    _layer_name.set(name)


def add_step(
    input: dict,
    output: dict,
    status: str = "success",
    latency_ms: int = 0,
) -> None:
    """Record one step of the current query's trace.

    The step carries the current layer's identity (see ``set_layer_name``);
    what *operation* ran belongs in ``input`` (e.g. ``{"mode": "bm25"}``).
    """
    steps = _steps.get()
    if steps is None:
        return
    layer_name = _layer_name.get()
    number = int(match.group()) if (match := re.search(r"\d+", layer_name)) else 0
    steps.append(
        TraceStep(
            layer=number,
            name=layer_name,
            input=input,
            output=output,
            status=status,
            latency_ms=latency_ms,
        )
    )


def collect() -> list[TraceStep]:
    """The steps recorded since the last ``reset``."""
    return _steps.get() or []
