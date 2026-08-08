"""Scoring a layer's answers against a file of expectations.

``evals/evals.yaml`` holds cases -- a query a shopper might type and prose
describing the answer they wanted. Every case runs through the layer's own
``search``, and an LLM judge scores what came back against what was expected.
``app.py --eval`` is the whole interface (see ``Application.run``).

The judge is closed-book: it sees the query, the expectation, and the products
the layer returned, and never the catalogue. A judge that could browse all 136
phones would be a second recommender, and a disagreement would then have two
possible causes -- the layer missed a phone, or the judge decided it should
have been returned -- with no way to tell them apart. Everything the judge is
shown comes from the answer under test, so a bad score always belongs to the
layer.

One file scores every layer, which is the point of it: the expectations
describe the product's job rather than any pipeline stage, so the same cases
run against layer 1 and layer 7 and the pass count climbs.
"""

import json
import tempfile
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from . import memory
from .catalog import load_catalog
from .llm import llmfn
from .schema import RecommendResponse

EVALS_DIR = Path(__file__).resolve().parent.parent / "evals"
CASES_PATH = EVALS_DIR / "evals.yaml"
JUDGE_PATH = EVALS_DIR / "judge.md"

# How many of a layer's results the judge is shown. A shopper reads the top of
# the list, and every product past that is context the judge pays for without
# grading -- the rank-5 result rarely decides whether an answer was good.
MAX_PRODUCTS = 5

# The score at which a case counts as passing. The number the run reports is
# this count, not the mean: an unanchored average drifts between identical
# runs and so cannot gate a prompt change, while "17 of 20" can.
PASS_SCORE = 4

# Cases are independent and each spends most of its time waiting on the model.
# The trace is ContextVar-scoped, so each worker collects its own steps.
MAX_WORKERS = 6

# The spec fields worth grading on. The catalogue's documents also carry
# product URLs, stock counts, and marketing bullets, which say nothing about
# whether a phone suits the shopper and would have the judge grading the
# catalogue's copywriting. Narratives are left out for the same reason.
SPEC_FIELDS = (
    "display_inches",
    "display_type",
    "display_resolution",
    "refresh_rate_hz",
    "chipset",
    "ram_gb",
    "storage_gb",
    "rear_camera_mp",
    "rear_camera_count",
    "front_camera_mp",
    "has_ois",
    "battery_mah",
    "battery_life_hrs",
    "charging_w",
    "wireless_charging_w",
    "os",
    "ip_rating",
    "weight_g",
    "form_factor",
    "has_5g",
    "has_nfc",
    "has_sd_slot",
)


class Case(BaseModel):
    """One eval: what the shopper typed, and what a good answer looks like.

    Extra keys are rejected rather than ignored, so a misspelled field in a
    hand-written file fails at load instead of silently dropping the
    expectation it was meant to carry.
    """

    model_config = ConfigDict(extra="forbid")

    query: str
    expect: str


class Judgement(BaseModel):
    """The judge's verdict on one answer."""

    score: int = Field(description="how well the answer met the expectation, from 0 to 5")
    reason: str = Field(description="one line naming the phone or number that decided the score")


class Result(BaseModel):
    """One scored case, as the report renders it."""

    query: str
    score: int
    reason: str
    latency_ms: int = 0

    @property
    def passed(self) -> bool:
        return self.score >= PASS_SCORE


def load_cases(path: Path | None = None) -> list[Case]:
    """Read and validate the eval file."""
    path = path or CASES_PATH
    raw = yaml.safe_load(path.read_text()) or []
    if not isinstance(raw, list):
        raise RuntimeError(f"{path.name} must be a list of cases")
    return [Case.model_validate(case) for case in raw]


def evidence_for(response: RecommendResponse) -> dict:
    """What the judge is shown of one answer.

    The products in rank order with the specs worth grading on, joined back to
    the catalogue because the card projection carries prices and colours but no
    specs, plus the summary when the layer wrote one.
    """
    docs = {entry.doc.id: entry.doc for entry in load_catalog()}
    products = []
    for product in response.products[:MAX_PRODUCTS]:
        doc = docs.get(product.id)
        specs = doc.specs if doc else {}
        products.append(
            {
                "name": product.name,
                "brand": product.brand,
                "price_inr": product.price,
                "specs": {k: v for k, v in specs.items() if k in SPEC_FIELDS},
            }
        )
    return {"products": products, "summary": response.summary}


def judge(case: Case, response: RecommendResponse) -> Judgement:
    """Score one answer against its expectation."""
    payload = {
        "query": case.query,
        "expectation": case.expect,
        "answer": evidence_for(response),
    }
    return llmfn(
        instructions=JUDGE_PATH.read_text(),
        input=json.dumps(payload, indent=2),
        output_schema=Judgement,
        label="judge",
    )


def run_case(app, case: Case) -> Result:
    """Run one case through the layer and score what comes back.

    Nothing here raises. A pipeline that breaks, a layer that finds nothing,
    and a judge call that fails are all answers of a sort -- each scores 0 and
    says why in the report, so one bad case never costs the other nineteen.
    """
    started = time.perf_counter()

    def done(score: int, reason: str) -> Result:
        elapsed = int((time.perf_counter() - started) * 1000)
        return Result(query=case.query, score=score, reason=reason, latency_ms=elapsed)

    try:
        response = app.run_query(case.query)
    except Exception as exc:
        return done(0, f"pipeline raised: {exc}")

    # run_query catches what the pipeline raised and reports it on the turn
    # rather than propagating, so the error arrives here rather than above.
    turn = response.trace
    if turn is not None and turn.error:
        return done(0, f"pipeline failed: {turn.error}")
    if not response.products:
        return done(0, "no results")

    try:
        judgement = judge(case, response)
    except Exception as exc:
        return done(0, f"judge failed: {exc}")
    return done(max(0, min(5, judgement.score)), judgement.reason.strip())


def run_evals(app, path: Path | None = None) -> int:
    """Score every case against this app and report. Returns an exit code.

    The profile is pointed at a scratch file for the duration: layers 6 and 7
    read and write one shared ``data/memory/memory.json``, so without this the
    cases would teach each other preferences and the run would leave whatever
    it learned in the profile of whoever is using the app.
    """
    cases = load_cases(path)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory() as scratch:
        memory.configure_path(Path(scratch) / "memory.json")
        try:
            results = _run_quietly(app, cases)
        finally:
            memory.configure_path(memory.DEFAULT_MEMORY_PATH)
    report(results, time.perf_counter() - started)
    return 1 if any(not result.passed for result in results) else 0


def _run_quietly(app, cases: list[Case]) -> list[Result]:
    """Run every case with the SDK's serialisation warnings silenced.

    The trace records each response as the provider returned it, and putting
    those objects back through pydantic warns once per union member per call.
    Under a server that noise goes to a log nobody reads; here it would bury
    the report it is printed alongside.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return _run_all(app, cases)


def _run_all(app, cases: list[Case]) -> list[Result]:
    if not cases:
        return []
    workers = min(MAX_WORKERS, len(cases))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda case: run_case(app, case), cases))


# --- Report ---------------------------------------------------------------

QUERY_WIDTH = 42
REASON_WIDTH = 62


def report(results: list[Result], elapsed: float) -> None:
    """Print one line per case, then the count that is the actual result."""
    for result in results:
        mark = "PASS" if result.passed else "FAIL"
        query = _fit(result.query, QUERY_WIDTH)
        reason = _fit(result.reason, REASON_WIDTH)
        print(f"{result.score}  {mark}  {query}  {reason}")

    if not results:
        print("no cases")
        return

    passed = sum(1 for result in results if result.passed)
    average = sum(result.score for result in results) / len(results)
    print(f"\n{passed}/{len(results)} passed · avg {average:.1f} · {elapsed:.1f}s")


def _fit(text: str, width: int) -> str:
    text = " ".join(text.split())
    if len(text) > width:
        text = text[: width - 1] + "…"
    return text.ljust(width)
