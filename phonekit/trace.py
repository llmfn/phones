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

A query that names a run (see ``reset``) is also watchable while it runs: its
steps are recorded as they start rather than when the query answers, and
``poll`` hands them to the panel as they change. The response still carries
the authoritative turn -- the run is a live view of the same steps, not a
second copy of them.
"""

import functools
import inspect
import re
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar

from pydantic import BaseModel

from .schema import TraceStep, TraceTurn

_run: ContextVar["TraceRun | None"] = ContextVar("trace_run", default=None)
_layer_name: ContextVar[str] = ContextVar("trace_layer_name", default="")

# How long a poll waits for the pipeline to move before answering with what it
# already has. Long enough that watching an idle query costs one request rather
# than a stream of them, short enough that no connection outlives a reloader
# restart by much.
POLL_TIMEOUT = 25.0

# A run matters only while its query is in flight -- afterwards the response
# carries the turn -- so the registry keeps the most recent few and drops the
# rest. A workshop server runs for hours; this is what stops it growing.
MAX_RUNS = 20

_runs: dict[str, "TraceRun"] = {}
_runs_lock = threading.Lock()

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


class TraceRun:
    """One query's steps as they are recorded, shared with whoever watches.

    The pipeline thread appends a step when it starts and settles it when it
    finishes; a browser waits in ``poll`` until ``version`` moves. Every read
    and write goes through the condition's lock, so a poll never catches a
    half-written step, and the version is what wakes a waiter exactly once per
    change rather than on a timer.
    """

    def __init__(self) -> None:
        self.condition = threading.Condition()
        self.steps: list[TraceStep] = []
        # The version at which each step last changed. A delta is "every step
        # stamped after the version you hold", which is what lets a step that
        # settles behind a later one still reach the panel -- exactly what
        # happens whenever one step nests inside another.
        self.stamps: list[int] = []
        self.version = 0
        self.done = False

    def begin(self) -> None:
        """Clear the run for a new query, waking anyone already watching it."""
        with self.condition:
            self.steps = []
            self.stamps = []
            self.version += 1
            self.done = False
            self.condition.notify_all()

    def append(self, step: TraceStep) -> int:
        with self.condition:
            self.version += 1
            self.steps.append(step)
            self.stamps.append(self.version)
            self.condition.notify_all()
            return len(self.steps) - 1

    def settle(self, index: int, step: TraceStep) -> None:
        with self.condition:
            self.version += 1
            self.steps[index] = step
            self.stamps[index] = self.version
            self.condition.notify_all()

    def finish(self) -> None:
        """Mark the query answered, so a watching panel stops polling."""
        with self.condition:
            self.version += 1
            self.done = True
            self.condition.notify_all()

    def poll(self, since: int, timeout: float) -> dict:
        """Block until this run passes ``since``, then report what changed.

        A timeout answers with an unchanged version and an empty delta, which
        the caller reads as "still running, ask again".
        """
        with self.condition:
            self.condition.wait_for(lambda: self.version > since, timeout=timeout)
            return {
                "version": self.version,
                "done": self.done,
                "changed": [
                    {"index": index, "step": step.model_dump()}
                    for index, (step, stamp) in enumerate(zip(self.steps, self.stamps))
                    if stamp > since
                ],
            }


def _get_or_create(run_id: str) -> TraceRun:
    """The run under ``run_id``, brought into existence by whoever asks first.

    The panel starts watching as it sends the query, so the poll can arrive
    before the pipeline has started recording; both sides land on one object.
    """
    with _runs_lock:
        run = _runs.get(run_id)
        if run is None:
            run = _runs[run_id] = TraceRun()
            while len(_runs) > MAX_RUNS:
                del _runs[next(iter(_runs))]
        return run


def poll(run_id: str, since: int = 0, timeout: float | None = None) -> dict:
    """What changed in a run since ``since``, waiting for it if nothing has."""
    return _get_or_create(run_id).poll(since, POLL_TIMEOUT if timeout is None else timeout)


def reset(run_id: str = "") -> None:
    """Start a fresh trace for one query, watchable under ``run_id``.

    The run id is what lets a browser follow the query while it runs: the
    panel mints one, sends it with the request, and polls it for the steps as
    they land. Without one the trace is private to this call, which is what
    the CLI and a bare REPL want.
    """
    if run_id:
        run = _get_or_create(run_id)
        run.begin()
    else:
        run = TraceRun()
    _run.set(run)


def finish() -> None:
    """Mark the current query answered (see ``TraceRun.finish``)."""
    run = _run.get()
    if run is not None:
        run.finish()


def set_layer_name(name: str) -> None:
    """Name the layer answering the current query (e.g. "layer1").

    Every step recorded until the next call is stamped with it -- the layer
    number shown in the X-Ray badge is parsed from its digits. Empty by
    default, so steps recorded outside an Application stamp layer 0.
    """
    _layer_name.set(name)


def _build(
    name: str,
    input: dict,
    output: dict,
    status: str,
    latency_ms: int,
    label: str,
) -> TraceStep:
    """One step, stamped with the layer currently answering (``set_layer_name``)."""
    layer_name = _layer_name.get()
    number = int(match.group()) if (match := re.search(r"\d+", layer_name)) else 0
    return TraceStep(
        layer=number,
        name=name,
        label=label or default_label(name),
        input=input,
        output=output,
        status=status,
        latency_ms=latency_ms,
    )


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
    run = _run.get()
    if run is None:
        return
    run.append(_build(name, input, output, status, latency_ms, label))


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

    The step is recorded as "running" the moment the block is entered and
    replaced in place when it leaves, so a panel watching the run sees the
    work that is happening rather than only the work that finished. Recording
    on entry is also what puts a step ahead of the ones nested inside it: the
    order is the order the reader lived through.

    If the block raises, the step settles with status "error" and the
    exception propagates.
    """
    step = StepRecorder()
    run = _run.get()
    index = run.append(_build(name, input, {}, "running", 0, label)) if run else -1
    started = time.perf_counter()

    def settle(output: dict, status: str) -> None:
        if run is not None:
            elapsed = int((time.perf_counter() - started) * 1000)
            run.settle(index, _build(name, input, output, status, elapsed, label))

    try:
        yield step
    except Exception as exc:
        settle({"error": str(exc)}, "error")
        raise
    settle(step.output, step.status)


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
    run = _run.get()
    return list(run.steps) if run is not None else []
