import json

import pytest

from phonekit.schema import Filters, RecommendResponse
from phonekit.session import DEFAULT_SESSION_ROOT, Session


@pytest.fixture(autouse=True)
def restore_session_root():
    original = Session.root
    yield
    Session.configure_root(original)


def read_json(path):
    return json.loads(path.read_text())


def test_new_session_writes_search_results_and_summary_conversation(tmp_path):
    Session.configure_root(tmp_path)
    response = RecommendResponse(products=[], summary="Here are the best options.")

    session = Session.new("small phone", Filters(brands=["Apple"]), response)

    assert response.session_id == session.session_id
    assert session.path == tmp_path / session.session_id

    search_results = read_json(session.path / "search_results.json")
    assert search_results["session_id"] == session.session_id
    assert search_results["query"] == "small phone"
    assert search_results["filters"] == {"brands": ["Apple"], "colors": []}
    assert search_results["response"]["session_id"] == session.session_id
    assert search_results["response"]["summary"] == "Here are the best options."

    conversation = read_json(session.path / "conversation.json")
    assert conversation == {
        "session_id": session.session_id,
        "messages": [{"role": "assistant", "content": "Here are the best options."}],
    }


def test_new_session_writes_empty_conversation_without_summary(tmp_path):
    Session.configure_root(tmp_path)

    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    conversation = read_json(session.path / "conversation.json")
    assert conversation == {"session_id": session.session_id, "messages": []}


def test_load_returns_existing_session_and_add_message_appends(tmp_path):
    Session.configure_root(tmp_path)
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    loaded = Session.load(session.session_id)
    loaded.add_message("I prefer compact phones")
    loaded.add_message("message received", role="assistant")

    conversation = read_json(session.path / "conversation.json")
    assert conversation["messages"] == [
        {"role": "user", "content": "I prefer compact phones"},
        {"role": "assistant", "content": "message received"},
    ]


def test_get_messages_returns_openai_style_conversation(tmp_path):
    Session.configure_root(tmp_path)
    session = Session.new("small phone", Filters(), RecommendResponse(products=[], summary="Start here."))

    session.add_message("I prefer compact phones")
    session.add_message("Try the Pixel 8a.", role="assistant")

    assert session.get_messages() == [
        {"role": "assistant", "content": "Start here."},
        {"role": "user", "content": "I prefer compact phones"},
        {"role": "assistant", "content": "Try the Pixel 8a."},
    ]
    assert "session_id" not in session.get_messages()[0]


def test_load_rejects_missing_or_invalid_session(tmp_path):
    Session.configure_root(tmp_path)

    with pytest.raises(ValueError):
        Session.load("not-a-uuid")

    with pytest.raises(FileNotFoundError):
        Session.load("00000000-0000-0000-0000-000000000000")


def test_add_message_rejects_invalid_role(tmp_path):
    Session.configure_root(tmp_path)
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    with pytest.raises(ValueError, match="role must be"):
        session.add_message("hello", role="system")


def test_default_root_is_data_state():
    assert DEFAULT_SESSION_ROOT.name == "state"
    assert DEFAULT_SESSION_ROOT.parent.name == "data"
