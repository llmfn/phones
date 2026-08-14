import json
from pathlib import Path

import pytest

from phonekit import evals, trace
from phonekit.app import Application
from phonekit.catalog import load_catalog
from phonekit.schema import Product, SearchResult

ROOT = Path(__file__).parent.parent


def a_response(count=1, summary=None):
    entries = load_catalog()[:count]
    return SearchResult(
        products=[Product.from_entry(entry) for entry in entries],
        summary=summary,
    )


def write_eval_files(tmp_path, queries=("a phone",)):
    cases = "".join(
        f"- query: {query}\n  expect: a useful phone recommendation\n" for query in queries
    )
    (tmp_path / "evals.yml").write_text(cases)
    prompts = tmp_path / "prompts"
    prompts.mkdir(exist_ok=True)
    (prompts / "eval.md").write_text("Judge this answer with yes or no.\n")


def an_app(monkeypatch, tmp_path, search):
    write_eval_files(tmp_path)
    monkeypatch.setattr(evals, "CASES_PATH", tmp_path / "evals.yml")
    app = Application(__name__, session_root=tmp_path / "state")
    app.root_path = str(tmp_path)
    app.search = search
    return app


def stub_judge(monkeypatch, passed=True, reason="meets the expectation"):
    seen = []

    def fake_llmfn(instructions, input, output_schema=None, **kwargs):
        seen.append({"instructions": instructions, "input": json.loads(input)})
        return evals.Judgement(passed=passed, reason=reason)

    monkeypatch.setattr(evals, "llmfn", fake_llmfn)
    return seen


def test_every_solution_can_read_the_judge_prompt():
    for layer in sorted((ROOT / "solutions").glob("layer*")):
        assert (layer / "prompts" / "eval.md").exists(), layer.name


def test_unknown_key_in_a_case_fails_at_load(tmp_path):
    (tmp_path / "evals.yml").write_text("- query: a phone\n  expects: a typo\n")

    with pytest.raises(Exception):
        evals.load_cases(None, tmp_path / "evals.yml")


def test_judge_uses_the_app_prompt_and_answer(monkeypatch, tmp_path):
    seen = stub_judge(monkeypatch)
    app = an_app(monkeypatch, tmp_path, lambda q, f: a_response())
    case = evals.Case(query="a foldable phone", expect="every result folds")

    evals.judge(app, case, a_response(count=2, summary="Two folding phones."))

    assert seen[0]["instructions"] == "Judge this answer with yes or no.\n"
    assert seen[0]["input"]["query"] == "a foldable phone"
    assert seen[0]["input"]["expectation"] == "every result folds"
    assert seen[0]["input"]["answer"]["summary"] == "Two folding phones."


def test_evidence_is_capped_and_carries_specs_without_narratives():
    evidence = evals.evidence_for(a_response(count=10))

    assert len(evidence["products"]) == evals.MAX_PRODUCTS
    assert all("specs" in product for product in evidence["products"])
    assert all("colors" in product for product in evidence["products"])
    rendered = json.dumps(evidence)
    narratives = {entry.doc.narrative for entry in load_catalog()}
    assert not any(narrative[:60] in rendered for narrative in narratives)


def test_a_passing_case_keeps_the_search_trace(monkeypatch, tmp_path):
    stub_judge(monkeypatch)

    def search(query, filters):
        with trace.new_step(name="search_test", input={"query": query}) as step:
            step.set_output({"results": 1})
        return a_response()

    result = evals.run_case(
        an_app(monkeypatch, tmp_path, search),
        evals.Case(query="a phone", expect="one useful phone"),
    )

    assert result.passed is True
    assert result.expect == "one useful phone"
    assert result.trace is not None
    assert [step.name for step in result.trace.steps] == ["search_test"]


def test_empty_results_fail_without_asking_the_judge(monkeypatch, tmp_path):
    seen = stub_judge(monkeypatch)
    app = an_app(monkeypatch, tmp_path, lambda q, f: SearchResult(products=[]))

    result = evals.run_case(app, evals.Case(query="anything", expect="something"))

    assert result.passed is False
    assert result.reason == "no results"
    assert result.trace is not None
    assert seen == []


def test_pipeline_and_judge_failures_become_failed_results(monkeypatch, tmp_path):
    def explode(query, filters):
        raise ValueError("embeddings unavailable")

    pipeline = evals.run_case(
        an_app(monkeypatch, tmp_path, explode),
        evals.Case(query="a phone", expect="phones"),
    )
    assert pipeline.passed is False
    assert "embeddings unavailable" in pipeline.reason

    def broken_judge(**kwargs):
        raise RuntimeError("rate limited")

    monkeypatch.setattr(evals, "llmfn", broken_judge)
    judged = evals.run_case(
        an_app(monkeypatch, tmp_path, lambda q, f: a_response()),
        evals.Case(query="a phone", expect="phones"),
    )
    assert judged.passed is False
    assert "rate limited" in judged.reason


def test_cli_runs_in_order_and_reports_yes_or_no(monkeypatch, tmp_path, capsys):
    seen = []

    def search(query, filters):
        seen.append(query)
        return a_response()

    app = an_app(monkeypatch, tmp_path, search)
    write_eval_files(tmp_path, ("one", "two"))
    stub_judge(monkeypatch)

    code = evals.run_evals(app)

    output = capsys.readouterr().out
    assert code == 0
    assert seen == ["one", "two"]
    assert output.count("YES") == 2
    assert "2/2 passed" in output


def test_cli_exits_nonzero_when_the_judge_says_no(monkeypatch, tmp_path, capsys):
    app = an_app(monkeypatch, tmp_path, lambda q, f: a_response())
    stub_judge(monkeypatch, passed=False, reason="wrong phone")

    code = evals.run_evals(app)

    assert code == 1
    assert "NO" in capsys.readouterr().out


def test_evals_page_lists_cases_without_running_them(monkeypatch, tmp_path):
    calls = []
    app = an_app(monkeypatch, tmp_path, lambda q, f: calls.append(q) or a_response())

    response = app.test_client().get("/evals")
    page = response.data.decode()

    assert response.status_code == 200
    assert "Run evals" in page
    assert "a useful phone recommendation" in page
    assert 'id="trace"' in page
    assert "evals.js" in page
    assert calls == []


def test_eval_endpoint_runs_one_case_and_returns_its_trace(monkeypatch, tmp_path):
    stub_judge(monkeypatch, passed=False, reason="the first phone is wrong")

    def search(query, filters):
        with trace.new_step(name="search_test", input={"query": query}) as step:
            step.set_output({"results": 1})
        return a_response()

    app = an_app(monkeypatch, tmp_path, search)
    response = app.test_client().post("/api/evals/0")
    body = response.get_json()

    assert response.status_code == 200
    assert body["passed"] is False
    assert body["reason"] == "the first phone is wrong"
    assert body["trace"]["input"] == "a phone"
    assert body["trace"]["steps"][0]["name"] == "search_test"
    assert "score" not in body


def test_unknown_eval_index_returns_404(monkeypatch, tmp_path):
    app = an_app(monkeypatch, tmp_path, lambda q, f: a_response())

    response = app.test_client().post("/api/evals/9")

    assert response.status_code == 404
    assert response.get_json() == {"error": "unknown eval"}


def test_home_page_links_to_evals(monkeypatch, tmp_path):
    app = an_app(monkeypatch, tmp_path, lambda q, f: a_response())

    assert 'href="/evals">Evals</a>' in app.test_client().get("/").data.decode()


def test_eval_flag_runs_evals_instead_of_server(monkeypatch, tmp_path):
    called = {}

    def fake_run_evals(app, *args, **kwargs):
        called["app"] = app
        return 0

    monkeypatch.setattr(evals, "run_evals", fake_run_evals)
    monkeypatch.setattr("sys.argv", ["app.py", "--eval"])

    app = an_app(monkeypatch, tmp_path, lambda q, f: a_response())
    with pytest.raises(SystemExit):
        app.run()

    assert called["app"] is app


def test_bare_invocation_still_serves(monkeypatch, tmp_path):
    served = {}
    monkeypatch.setattr("flask.Flask.run", lambda self, *a, **k: served.setdefault("debug", k.get("debug")))
    monkeypatch.setattr("sys.argv", ["app.py"])

    an_app(monkeypatch, tmp_path, lambda q, f: a_response()).run()

    assert served["debug"] is True
