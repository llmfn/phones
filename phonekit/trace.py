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
    name: str,
    input: dict,
    output: dict,
    status: str = "success",
    latency_ms: int = 0,
) -> None:
    """Record one step of the current query's trace.

    ``name`` is the operation that ran (e.g. ``"search_bm25"``, ``"llmfn"``)
    and becomes the step's heading in the X-Ray; the layer number badge still
    comes from the current layer's identity (see ``set_layer_name``).
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
def new_step(name: str, input: dict):
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
        )
        raise
    add_step(
        name=name,
        input=input,
        output=step.output,
        status=step.status,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )


def _jsonable(value):
    """Best-effort JSON-safe view of a traced value.

    The trace rides back to the browser as JSON, so values that don't
    serialize (pydantic models, classes, clients) are reduced to something
    readable rather than crashing the response.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
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
        inputs = {key: _jsonable(value) for key, value in bound.arguments.items()}
        with new_step(name=fn.__name__, input=inputs) as step:
            result = fn(*args, **kwargs)
            step.set_output({"result": _jsonable(result)})
        return result

    return wrapper


def collect() -> list[TraceStep]:
    """The steps recorded since the last ``reset``."""
    return _steps.get() or []
