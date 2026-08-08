import json
from pathlib import Path

import pytest

from phonekit import evals, memory
from phonekit.app import Application
from phonekit.catalog import load_catalog
from phonekit.schema import Product, SearchResult


def a_response(count=1, summary=None):
    entries = load_catalog()[:count]
    return SearchResult(
        products=[Product.from_entry(entry) for entry in entries],
        summary=summary,
    )


def an_app(search):
    app = Application(__name__)
    app.search = search
    return app


def a_case_file(tmp_path, cases):
    path = tmp_path / "evals.yaml"
    lines = [f"- query: {case}\n  expect: something reasonable\n" for case in cases]
    path.write_text("".join(lines))
    return path


def stub_judge(monkeypatch, score=5, reason="looks right"):
    seen = []

    def fake_llmfn(instructions, input, output_schema=None, **kwargs):
        seen.append(json.loads(input))
        return evals.Judgement(score=score, reason=reason)

    monkeypatch.setattr(evals, "llmfn", fake_llmfn)
    return seen


# --- The eval file itself --------------------------------------------------


def test_shipped_cases_load():
    cases = evals.load_cases()
    assert len(cases) >= 15
    assert all(case.query and case.expect for case in cases)


def test_unknown_key_in_a_case_fails_at_load(tmp_path):
    path = tmp_path / "evals.yaml"
    path.write_text("- query: a phone\n  expects: a typo\n")
    with pytest.raises(Exception):
        evals.load_cases(path)


# --- What the judge is shown ----------------------------------------------


def test_evidence_is_capped_and_carries_no_narrative():
    evidence = evals.evidence_for(a_response(count=10))

    assert len(evidence["products"]) == evals.MAX_PRODUCTS
    narratives = {entry.doc.narrative for entry in load_catalog()}
    rendered = json.dumps(evidence)
    assert not any(narrative[:60] in rendered for narrative in narratives)
    assert all("specs" in product for product in evidence["products"])


def test_evidence_drops_spec_fields_that_are_not_about_the_phone():
    evidence = evals.evidence_for(a_response(count=5))
    for product in evidence["products"]:
        assert not {"product_url", "product_code", "availability", "selling_points"} & set(
            product["specs"]
        )


def test_judge_is_sent_the_query_expectation_and_answer(monkeypatch):
    seen = stub_judge(monkeypatch)
    case = evals.Case(query="a foldable phone", expect="every result folds")

    evals.judge(case, a_response(count=2, summary="Two folding phones."))

    payload = seen[0]
    assert payload["query"] == "a foldable phone"
    assert payload["expectation"] == "every result folds"
    assert payload["answer"]["summary"] == "Two folding phones."


# --- Running a case --------------------------------------------------------


def test_empty_results_score_zero_without_asking_the_judge(monkeypatch):
    seen = stub_judge(monkeypatch)
    app = an_app(lambda q, f: SearchResult(products=[]))

    result = evals.run_case(app, evals.Case(query="anything", expect="something"))

    assert result.score == 0
    assert result.reason == "no results"
    assert seen == []


def test_a_case_whose_pipeline_raises_scores_zero_and_reports_the_error(monkeypatch):
    stub_judge(monkeypatch)

    def explode(query, filters):
        raise ValueError("embeddings unavailable")

    result = evals.run_case(an_app(explode), evals.Case(query="a phone", expect="phones"))

    assert result.score == 0
    assert "embeddings unavailable" in result.reason


def test_a_failing_judge_scores_zero_rather_than_aborting(monkeypatch):
    def explode(**kwargs):
        raise RuntimeError("rate limited")

    monkeypatch.setattr(evals, "llmfn", explode)
    app = an_app(lambda q, f: a_response())

    result = evals.run_case(app, evals.Case(query="a phone", expect="phones"))

    assert result.score == 0
    assert "rate limited" in result.reason


def test_a_score_outside_the_scale_is_clamped(monkeypatch):
    stub_judge(monkeypatch, score=9)
    app = an_app(lambda q, f: a_response())

    result = evals.run_case(app, evals.Case(query="a phone", expect="phones"))

    assert result.score == 5


# --- The whole run ---------------------------------------------------------


def test_a_broken_case_does_not_stop_the_others(monkeypatch, tmp_path, capsys):
    stub_judge(monkeypatch)

    def search(query, filters):
        if query == "boom":
            raise ValueError("kaboom")
        return a_response()

    path = a_case_file(tmp_path, ["one", "boom", "three"])
    code = evals.run_evals(an_app(search), path)

    out = capsys.readouterr().out
    assert code == 1
    assert "kaboom" in out
    assert "2/3 passed" in out


def test_a_run_where_everything_passes_exits_zero(monkeypatch, tmp_path, capsys):
    stub_judge(monkeypatch)
    path = a_case_file(tmp_path, ["one", "two"])

    code = evals.run_evals(an_app(lambda q, f: a_response()), path)

    assert code == 0
    assert "2/2 passed" in capsys.readouterr().out


def test_a_score_below_the_threshold_fails_the_run(monkeypatch, tmp_path, capsys):
    stub_judge(monkeypatch, score=3)
    path = a_case_file(tmp_path, ["one"])

    code = evals.run_evals(an_app(lambda q, f: a_response()), path)

    assert code == 1
    assert "0/1 passed" in capsys.readouterr().out


def test_a_run_leaves_the_real_profile_alone(monkeypatch, tmp_path, capsys):
    stub_judge(monkeypatch)
    profile = tmp_path / "real" / "memory.json"
    profile.parent.mkdir()
    profile.write_text(json.dumps({"budget_inr": 20000}) + "\n")
    memory.configure_path(profile)

    def search(query, filters):
        memory.merge({"budget_inr": 999, "context": query})
        return a_response()

    try:
        evals.run_evals(an_app(search), a_case_file(tmp_path, ["one", "two"]))
        assert json.loads(profile.read_text()) == {"budget_inr": 20000}
    finally:
        memory.configure_path(memory.DEFAULT_MEMORY_PATH)


def test_the_profile_path_is_restored_after_a_run(monkeypatch, tmp_path, capsys):
    stub_judge(monkeypatch)
    evals.run_evals(an_app(lambda q, f: a_response()), a_case_file(tmp_path, ["one"]))
    assert memory._path == memory.DEFAULT_MEMORY_PATH


# --- Wiring ----------------------------------------------------------------


def test_eval_flag_runs_the_evals_instead_of_the_server(monkeypatch):
    called = {}

    def fake_run_evals(app, *args, **kwargs):
        called["app"] = app
        return 0

    monkeypatch.setattr(evals, "run_evals", fake_run_evals)
    monkeypatch.setattr("sys.argv", ["app.py", "--eval"])

    app = an_app(lambda q, f: a_response())
    with pytest.raises(SystemExit):
        app.run()

    assert called["app"] is app


def test_a_bare_invocation_still_serves(monkeypatch):
    served = {}
    monkeypatch.setattr("flask.Flask.run", lambda self, *a, **k: served.setdefault("debug", k.get("debug")))
    monkeypatch.setattr("sys.argv", ["app.py"])

    an_app(lambda q, f: a_response()).run()

    assert served["debug"] is True
