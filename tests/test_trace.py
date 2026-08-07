import pytest

from phonekit import Application, search_bm25, trace
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


def test_the_keyword_search_step_records_what_each_token_matched():
    # The token band's two facts, on words the catalogue has and words it does
    # not: a query dies on the tokens nothing holds, and those sort last -- an
    # absent word earns the highest weight of all, so ranking on weight alone
    # would float exactly the words that matched nothing to the top.
    trace.reset()
    search_bm25("a phone for my mom")

    (step,) = trace.collect()
    tokens = {facts["token"]: facts for facts in step.output["tokens"]}
    assert tokens["phone"]["matches"] > 0
    assert tokens["mom"]["matches"] == 0
    assert [facts["token"] for facts in step.output["tokens"][-2:]] == ["my", "mom"]
    assert step.output["results"] == 0
    assert step.output["top_scores"] == []


def test_the_keyword_search_step_records_why_the_survivors_ranked():
    # Every result holds every token, so the order comes from the per-document
    # facts: how often each word repeats and how long the record is. The result
    # count is the AND, never merely the smallest per-token count.
    trace.reset()
    search_bm25("pink phone")

    (step,) = trace.collect()
    output = step.output
    assert output["results"] <= min(facts["matches"] for facts in output["tokens"])

    # Heaviest word first, and every ranked phone lists its tokens in that same
    # order, so a token keeps its place -- and its colour -- down the chart.
    weights = [facts["weight"] for facts in output["tokens"]]
    assert weights == sorted(weights, reverse=True)
    order = [facts["token"] for facts in output["tokens"]]
    assert order == ["pink", "phone"]

    top = output["top_scores"][0]
    assert top["length"] > 0
    assert [facts["token"] for facts in top["tokens"]] == order
    assert all(facts["count"] >= 1 for facts in top["tokens"])
    assert round(sum(facts["score"] for facts in top["tokens"]), 3) == round(top["score"], 3)


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
