"""Run the shared query expectations through a simple yes/no judge."""

import json
import time
import warnings
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from .catalog import load_catalog
from .llm import llmfn
from .schema import SearchResult, TraceTurn

# One case file for every layer: the same shopper queries run against whichever
# app.py is being measured, which is what makes the scores comparable. Anchored
# to the repo root so a solution's app.py finds it too.
CASES_PATH = Path(__file__).resolve().parent.parent / "evals.yml"

MAX_PRODUCTS = 5
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
    """One shopper query and the answer it should produce."""

    model_config = ConfigDict(extra="forbid")

    query: str
    expect: str


class Judgement(BaseModel):
    """The judge's yes/no decision and its short explanation."""

    passed: bool = Field(description="true only when the answer meets the expectation")
    reason: str = Field(description="one short sentence explaining the decision")


class Result(BaseModel):
    """One completed eval, including the app trace students inspect."""

    query: str
    expect: str
    passed: bool
    reason: str
    latency_ms: int = 0
    trace: TraceTurn | None = None


def load_cases(app, path: Path | None = None) -> list[Case]:
    """Read the evals.yml at the repo root, shared by every layer."""
    path = path or CASES_PATH
    raw = yaml.safe_load(path.read_text()) or []
    if not isinstance(raw, list):
        raise RuntimeError(f"{path.name} must be a list of cases")
    return [Case.model_validate(case) for case in raw]


def evidence_for(response: SearchResult) -> dict:
    """Return the ranked products and useful specs the judge may grade."""
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
                "colors": [color.name for color in product.colors],
                "specs": {key: value for key, value in specs.items() if key in SPEC_FIELDS},
            }
        )
    return {"products": products, "summary": response.summary}


def judge(app, case: Case, response: SearchResult) -> Judgement:
    """Ask the app-local judge prompt for one yes/no decision."""
    payload = {
        "query": case.query,
        "expectation": case.expect,
        "answer": evidence_for(response),
    }
    return llmfn(
        instructions=app.read_file("prompts/eval.md"),
        input=json.dumps(payload, indent=2),
        output_schema=Judgement,
        label="judge",
    )


def run_case(app, case: Case) -> Result:
    """Run and judge one case without allowing it to stop the remaining cases."""
    started = time.perf_counter()
    trace = None

    def done(passed: bool, reason: str) -> Result:
        return Result(
            query=case.query,
            expect=case.expect,
            passed=passed,
            reason=reason.strip(),
            latency_ms=int((time.perf_counter() - started) * 1000),
            trace=trace,
        )

    try:
        response = app.run_query(case.query)
    except Exception as exc:
        return done(False, f"pipeline raised: {exc}")

    trace = response.trace
    if trace is not None and trace.error:
        return done(False, f"pipeline failed: {trace.error}")
    if not response.products:
        return done(False, "no results")

    try:
        judgement = judge(app, case, response)
    except Exception as exc:
        return done(False, f"judge failed: {exc}")
    return done(judgement.passed, judgement.reason)


def run_evals(app, path: Path | None = None) -> int:
    """Run every case sequentially, print yes/no results, and return an exit code."""
    cases = load_cases(app, path)
    started = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        results = [run_case(app, case) for case in cases]
    report(results, time.perf_counter() - started)
    return 1 if any(not result.passed for result in results) else 0


QUERY_WIDTH = 42
REASON_WIDTH = 68


def report(results: list[Result], elapsed: float) -> None:
    """Print one yes/no line per case followed by the pass count."""
    for result in results:
        verdict = "YES" if result.passed else "NO"
        print(f"{verdict:<3}  {_fit(result.query, QUERY_WIDTH)}  {_fit(result.reason, REASON_WIDTH)}")

    if not results:
        print("no cases")
        return

    passed = sum(result.passed for result in results)
    print(f"\n{passed}/{len(results)} passed | {elapsed:.1f}s")


def _fit(text: str, width: int) -> str:
    text = " ".join(text.split())
    if len(text) > width:
        text = text[: width - 3] + "..."
    return text.ljust(width)
