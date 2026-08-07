import json
import threading
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from phonekit import Application, llm, search_bm25, trace
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


class Rewritten(BaseModel):
    query: str


class FakeResponses:
    """Stands in for ``client.responses``, keeping the calls it received."""

    def __init__(self, parsed=None):
        self.calls = []
        self.parsed = parsed

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(id="resp_1", output=[], output_text="A steady pick.")

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            id="resp_1",
            output=[],
            output_text=self.parsed.model_dump_json(),
            output_parsed=self.parsed,
        )


@pytest.fixture
def fake_llm(monkeypatch):
    """Run ``llmfn`` against a stub provider, so the trace can be read offline."""

    def install(parsed=None):
        responses = FakeResponses(parsed)
        settings = SimpleNamespace(openai_model="test-model")
        monkeypatch.setattr(llm.config, "get_settings", lambda: settings)
        monkeypatch.setattr(llm, "get_openai_client", lambda: SimpleNamespace(responses=responses))
        return responses

    return install


def test_the_llm_step_records_the_request_the_provider_received(fake_llm):
    # The panel renders what was sent, not a rendering of the call the layer
    # wrote: the step's request is the same object the client was handed.
    responses = fake_llm()
    prompt = "You are a phone expert.\n\nRules:\n- Be brief."

    trace.reset()
    llm.llmfn(instructions=prompt, input="a phone for my mom")
    (step,) = trace.collect()

    assert step.input["request"] == responses.calls[0]
    assert step.input["request"]["instructions"] == prompt
    assert step.input["model"] == "test-model"


def test_the_llm_step_keeps_text_literal_rather_than_encoded(fake_llm):
    # The prompt's newlines are newlines and its embedded JSON is still JSON --
    # a string holding an escaped copy of either is what the panel exists to
    # stop showing.
    fake_llm()
    context = json.dumps([{"name": "Pixel", "price": 45000}], indent=2)

    trace.reset()
    llm.llmfn(instructions="Summarize.", input=f"Phones:\n{context}")
    (step,) = trace.collect()

    sent = step.input["request"]["input"]
    assert isinstance(sent, str)
    assert sent == f"Phones:\n{context}"
    assert "\\n" not in sent
    assert step.output["text"] == "A steady pick."


def test_the_llm_step_records_structured_output_as_an_object(fake_llm):
    responses = fake_llm(parsed=Rewritten(query="budget android"))

    trace.reset()
    llm.llmfn(
        instructions="Rewrite it.",
        input="cheap phone",
        output_schema=Rewritten,
        label="rewrite",
    )
    (step,) = trace.collect()

    assert step.label == "rewrite"
    assert step.output["parsed"] == {"query": "budget android"}
    # The schema the model was held to, not the name of the class holding it:
    # "Rewritten" says a schema was used without saying what was asked for.
    assert step.input["request"]["text_format"] == Rewritten.model_json_schema()
    assert "query" in step.input["request"]["text_format"]["properties"]
    # Expanding it is the only difference from the call the client received.
    sent = dict(responses.calls[0], text_format=Rewritten.model_json_schema())
    assert step.input["request"] == sent


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


# --- Watching a run while it happens ---


def test_a_step_is_visible_while_it_is_still_running(tmp_path):
    # The point of the whole slice: the panel can see the step the query is
    # inside, not just the ones it has finished.
    seen = []

    def search(query, filters):
        with trace.new_step(name="search_semantic", input={"query": query}) as step:
            seen.append(trace.poll("run-1", 0, timeout=0)["changed"])
            step.set_output({"qualifying": 3})
        return RecommendResponse(products=[])

    make_app(tmp_path, search).run_query("a small phone", run_id="run-1")

    (mid_flight,) = seen
    assert [(row["index"], row["step"]["status"]) for row in mid_flight] == [(0, "running")]
    assert mid_flight[0]["step"]["label"] == "semantic search"

    settled = trace.poll("run-1", 0, timeout=0)
    assert [(row["index"], row["step"]["status"]) for row in settled["changed"]] == [(0, "success")]
    assert settled["done"] is True


def test_a_poll_carries_only_what_changed_since_the_version_it_holds(tmp_path):
    versions = []

    def search(query, filters):
        for name in ("search_semantic", "rerank_by_persona"):
            versions.append(trace.poll("run-2", 0, timeout=0)["version"])
            with trace.new_step(name=name, input={}) as step:
                step.set_output({})
        return RecommendResponse(products=[])

    make_app(tmp_path, search).run_query("a small phone", run_id="run-2")

    # Asked from the version held after the first step settled, the delta
    # carries the second step and nothing about the first.
    delta = trace.poll("run-2", versions[1], timeout=0)
    assert [row["index"] for row in delta["changed"]] == [1]


def test_a_poll_waits_for_the_pipeline_rather_than_polling_it(tmp_path):
    # The wait is the whole reason watching a query costs a handful of
    # requests instead of one every tick, so it is worth pinning both halves:
    # a poll with nothing to report does not answer, and it comes back on the
    # step landing rather than on its own timeout.
    started = threading.Event()
    released = threading.Event()
    answers = []

    def search(query, filters):
        started.set()
        released.wait(timeout=5)
        with trace.new_step(name="search_bm25", input={}) as step:
            step.set_output({"results": 1})
        return RecommendResponse(products=[])

    app = make_app(tmp_path, search)
    pipeline = threading.Thread(target=app.run_query, args=("samsung 5g", None, "run-3"))
    pipeline.start()
    assert started.wait(timeout=5)

    # From the version the run has now, with the pipeline parked, there is
    # nothing for a poll to say.
    since = trace.poll("run-3", 0, timeout=0)["version"]
    watcher = threading.Thread(target=lambda: answers.append(trace.poll("run-3", since, timeout=5)))
    watcher.start()
    watcher.join(timeout=0.2)
    assert answers == [], "the poll answered before the pipeline had anything to say"

    released.set()
    watcher.join(timeout=2)
    pipeline.join(timeout=5)

    # Back well inside its own five-second timeout, because the step woke it.
    assert not watcher.is_alive()
    assert [row["step"]["name"] for row in answers[0]["changed"]] == ["search_bm25"]


def test_a_poll_that_waits_through_a_quiet_pipeline_gives_up(tmp_path):
    # Nothing is running under this id, so the wait times out and answers with
    # an unchanged version -- which the panel reads as "ask again".
    answer = trace.poll("run-4", 0, timeout=0.05)

    assert answer == {"version": 0, "done": False, "changed": []}


def test_a_failing_step_settles_as_an_error_with_nothing_after_it(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_semantic", input={}) as step:
            step.set_output({"qualifying": 3})
        with trace.new_step(name="llmfn", input={}):
            raise RuntimeError("no API key configured")

    make_app(tmp_path, search).run_query("a small phone", run_id="run-5")

    answer = trace.poll("run-5", 0, timeout=0)
    assert [(row["step"]["name"], row["step"]["status"]) for row in answer["changed"]] == [
        ("search_semantic", "success"),
        ("llmfn", "error"),
    ]
    assert answer["done"] is True


def test_a_watched_turn_is_the_turn_the_response_carries(tmp_path):
    def search(query, filters):
        with trace.new_step(name="search_bm25", input={"query": query}) as step:
            step.set_output({"results": 0})
        return RecommendResponse(products=[])

    app = make_app(tmp_path, search)
    client = app.test_client()
    watched = client.post("/api/recommend", json={"query": "samsung 5g"}, headers={"X-Run-Id": "run-6"})
    plain = client.post("/api/recommend", json={"query": "samsung 5g"})

    # Being watched changes nothing about the answer: same steps, same shape.
    assert watched.get_json()["trace"]["steps"] == plain.get_json()["trace"]["steps"]
    # And what was watched is what the response settled on.
    changed = trace.poll("run-6", 0, timeout=0)["changed"]
    assert [row["step"] for row in changed] == watched.get_json()["trace"]["steps"]


def test_a_chat_turn_is_traced_like_a_search_turn(tmp_path):
    app = make_app(tmp_path, lambda query, filters: RecommendResponse(products=[]))
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    def chat(active_session, message):
        with trace.new_step(name="llmfn", input={"input": message}, label="reply") as step:
            step.set_output({"text": "Try the Pixel 8a."})
        return "Try the Pixel 8a."

    app.chat = chat
    response = app.test_client().post(
        "/api/conversation",
        json={"session_id": session.session_id, "message": "Need a good camera"},
        headers={"X-Run-Id": "run-7"},
    )

    turn = response.get_json()["trace"]
    assert turn["kind"] == "chat"
    assert turn["input"] == "Need a good camera"
    assert [step["label"] for step in turn["steps"]] == ["reply"]
    # And it was watchable while it ran, exactly as a search turn is.
    assert trace.poll("run-7", 0, timeout=0)["changed"][0]["step"]["label"] == "reply"


def test_a_chat_hook_that_raises_is_readable_in_the_panel(tmp_path):
    app = make_app(tmp_path, lambda query, filters: RecommendResponse(products=[]))
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    def chat(active_session, message):
        raise RuntimeError("no API key configured")

    app.chat = chat
    response = app.test_client().post(
        "/api/conversation",
        json={"session_id": session.session_id, "message": "Need a good camera"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["reply"] == "no API key configured"
    assert body["trace"]["status"] == "error"
    assert body["trace"]["error"] == "no API key configured"
