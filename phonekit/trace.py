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

import functools
import inspect
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar

from pydantic import BaseModel

from .schema import TraceStep, TraceTurn

_steps: ContextVar[list[TraceStep] | None] = ContextVar("trace_steps", default=None)
_layer_name: ContextVar[str] = ContextVar("trace_layer_name", default="")

# The plain-language purpose the panel shows for each building block, so a step
# reads as what it is for rather than what it is called. A step can override it
# by passing ``label``; anything unlisted falls back to its own name.
DEFAULT_LABELS = {
    "search_bm25": "keyword search",
    "search_semantic": "semantic search",
    "rerank_by_persona": "rerank",
    "llmfn": "llm call",
    "tool_call": "tool call",
}


def default_label(name: str) -> str:
    """The purpose label for a step name, when the caller gave none."""
    return DEFAULT_LABELS.get(name, name.replace("_", " "))


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
    name: str,
    input: dict,
    output: dict,
    status: str = "success",
    latency_ms: int = 0,
    label: str = "",
) -> None:
    """Record one step of the current query's trace.

    ``name`` is the operation that ran (e.g. ``"search_bm25"``, ``"llmfn"``),
    and ``label`` the plain-language purpose the panel shows for it -- pass one
    when the operation alone doesn't say what the step is for (two ``llmfn``
    calls that rewrite and then summarize), and it defaults to the name's
    reading otherwise. The layer number badge comes from the current layer's
    identity (see ``set_layer_name``).
    """
    steps = _steps.get()
    if steps is None:
        return
    layer_name = _layer_name.get()
    number = int(match.group()) if (match := re.search(r"\d+", layer_name)) else 0
    steps.append(
        TraceStep(
            layer=number,
            name=name,
            label=label or default_label(name),
            input=input,
            output=output,
            status=status,
            latency_ms=latency_ms,
        )
    )


class StepRecorder:
    """Collects the result of one in-progress step (see ``new_step``)."""

    def __init__(self) -> None:
        self.output: dict = {}
        self.status: str = "success"

    def set_output(self, output: dict, status: str = "success") -> None:
        self.output = output
        self.status = status


@contextmanager
def new_step(name: str, input: dict, label: str = ""):
    """Record one trace step around a block, timing it automatically.

        with trace.new_step(name="llmfn", input={...}) as step:
            ...
            step.set_output({...})

    If the block raises, the step is recorded with status "error" and the
    exception propagates.
    """
    step = StepRecorder()
    started = time.perf_counter()
    try:
        yield step
    except Exception as exc:
        add_step(
            name=name,
            input=input,
            output={"error": str(exc)},
            status="error",
            latency_ms=int((time.perf_counter() - started) * 1000),
            label=label,
        )
        raise
    add_step(
        name=name,
        input=input,
        output=step.output,
        status=step.status,
        latency_ms=int((time.perf_counter() - started) * 1000),
        label=label,
    )


def jsonable(value):
    """Best-effort JSON-safe view of a traced value.

    The trace rides back to the browser as JSON, so values that don't
    serialize (pydantic models, classes, clients) are reduced to something
    readable rather than crashing the response. Steps that curate their own
    payload use it on whatever they hand over.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, type):
        return value.__name__
    return repr(value)


def trace_function(fn):
    """Trace every call to ``fn`` as one step.

    The function's name is the step name, its bound arguments are the input,
    and its return value is the output (as ``{"result": ...}``), so:

        @trace.trace_function
        def llmfn(instructions, input):
            ...

    Use this when the signature and return value *are* the story; when a step
    should show derived diagnostics instead (match counts, top-N scores), use
    ``new_step`` and curate.
    """
    signature = inspect.signature(fn)

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        bound.apply_defaults()
        inputs = {key: jsonable(value) for key, value in bound.arguments.items()}
        with new_step(name=fn.__name__, input=inputs) as step:
            result = fn(*args, **kwargs)
            step.set_output({"result": jsonable(result)})
        return result

    return wrapper


def collect() -> list[TraceStep]:
    """The steps recorded since the last ``reset``."""
    return _steps.get() or []
