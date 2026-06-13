import json

import pytest

from phonekit import Application
from phonekit.schema import Filters, RecommendResponse
from phonekit.session import Session


@pytest.fixture(autouse=True)
def restore_session_root():
    original = Session.root
    yield
    Session.configure_root(original)


def read_json(path):
    return json.loads(path.read_text())


def make_app(tmp_path):
    app = Application(__name__, session_root=tmp_path)
    app.config.update(TESTING=True)
    return app


def test_conversation_uses_default_reply_when_no_hook_is_assigned(tmp_path):
    app = make_app(tmp_path)
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))

    response = app.test_client().post(
        "/api/conversation",
        json={"session_id": session.session_id, "message": "I prefer compact phones"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"session_id": session.session_id, "reply": "message received"}
    conversation = read_json(session.path / "conversation.json")
    assert conversation["messages"] == [
        {"role": "user", "content": "I prefer compact phones"},
        {"role": "assistant", "content": "message received"},
    ]


def test_conversation_dispatches_to_layer_chat_hook(tmp_path):
    app = make_app(tmp_path)
    session = Session.new("small phone", Filters(), RecommendResponse(products=[]))
    calls = []

    def chat(active_session, message):
        calls.append((active_session.session_id, message))
        return "Try the Pixel 8a."

    app.chat = chat

    response = app.test_client().post(
        "/api/conversation",
        json={"session_id": session.session_id, "message": "Need a good camera"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"session_id": session.session_id, "reply": "Try the Pixel 8a."}
    assert calls == [(session.session_id, "Need a good camera")]

    conversation = read_json(session.path / "conversation.json")
    assert conversation["messages"] == [
        {"role": "user", "content": "Need a good camera"},
        {"role": "assistant", "content": "Try the Pixel 8a."},
    ]
