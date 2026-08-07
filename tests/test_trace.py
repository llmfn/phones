import pytest

from phonekit import Application, trace
from phonekit.schema import Filters, RecommendResponse
from phonekit.session import Session


@pytest.fixture(autouse=True)
def restore_session_root():
    original = Session.root
    yield
    Session.configure_root(original)


def make_app(tmp_path, search):
    app = Application(__name__, session_root=tmp_path)
    app.config.update(TESTING=True)
    app.search = search
    return app


def test_steps_are_grouped_under_the_turn_that_produced_them(tmp_path):
    def search(query, filters):
        with trace.new_step(name="llmfn", input={"input": query}) as step:
            step.set_output({"result": "compact android phone"})
        with trace.new_step(name="search_semantic", input={"query": query}) as step:
            step.set_output({"qualifying": 3})
        return RecommendResponse(products=[])

    turn = make_app(tmp_path, search).run_query("a small phone").trace

    assert turn.kind == "search"
    assert turn.input == "a small phone"
    assert turn.status == "success"
    assert turn.error is None
    assert [step.name for step in turn.steps] == ["llmfn", "search_semantic"]


def test_steps_carry_a_purpose_label(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_semantic", input={"query": query}) as step:
            step.set_output({})
        with trace.new_step(name="llmfn", input={}, label="summarize") as step:
            step.set_output({})
        with trace.new_step(name="curate_shortlist", input={}) as step:
            step.set_output({})
        return RecommendResponse(products=[])

    turn = make_app(tmp_path, search).run_query("a small phone").trace

    # A known building block reads as its purpose, a caller can name its own,
    # and an unknown step still gets something plain rather than nothing.
    assert [step.label for step in turn.steps] == ["semantic search", "summarize", "curate shortlist"]


def test_a_failed_pipeline_still_produces_its_turn(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_semantic", input={"query": query}) as step:
            step.set_output({"qualifying": 3})
        with trace.new_step(name="llmfn", input={}):
            raise RuntimeError("no API key configured")

    response = make_app(tmp_path, search).run_query("a small phone")
    turn = response.trace

    assert response.products == []
    assert turn.status == "error"
    assert turn.error == "no API key configured"
    assert [(step.name, step.status) for step in turn.steps] == [
        ("search_semantic", "success"),
        ("llmfn", "error"),
    ]


def test_a_failure_outside_a_step_is_carried_by_the_turn(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_semantic", input={"query": query}) as step:
            step.set_output({"qualifying": 3})
        raise ValueError("bad filters")

    turn = make_app(tmp_path, search).run_query("a small phone").trace

    assert turn.status == "error"
    assert turn.error == "bad filters"
    assert [step.status for step in turn.steps] == ["success"]


def test_recommend_returns_the_turn_in_the_response(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_bm25", input={"query": query}) as step:
            step.set_output({"results": 0})
        return RecommendResponse(products=[])

    app = make_app(tmp_path, search)
    response = app.test_client().post("/api/recommend", json={"query": "samsung 5g"})

    assert response.status_code == 200
    turn = response.get_json()["trace"]
    assert turn["input"] == "samsung 5g"
    assert [step["label"] for step in turn["steps"]] == ["keyword search"]
