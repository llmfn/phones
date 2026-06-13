"""File-backed search sessions and conversation history.

Each recommendation response creates one session directory under
``data/state/<session_id>/``. The directory stores the original search response
and a conversation transcript. Conversation turns are stored as ``role`` /
``content`` dictionaries so a layer can pass them directly to OpenAI-style chat
APIs.
"""

import json
import uuid
from pathlib import Path
from typing import Any, ClassVar, Literal, TypedDict

from .schema import Filters, RecommendResponse

DEFAULT_SESSION_ROOT = Path(__file__).parent.parent / "data" / "state"
ChatRole = Literal["user", "assistant"]


class ChatMessage(TypedDict):
    """One OpenAI-style chat message."""

    role: ChatRole
    content: str


class Session:
    """One search session stored under ``data/state/<session_id>/``."""

    root: ClassVar[Path] = DEFAULT_SESSION_ROOT

    def __init__(self, session_id: str):
        """Create a session object for an already-normalized session id."""
        self.session_id = session_id
        self.path = self.root / session_id

    @classmethod
    def configure_root(cls, root: str | Path) -> None:
        """Set the directory where session folders are read and written."""
        cls.root = Path(root)

    @classmethod
    def new(cls, query: str, filters: Filters, response: RecommendResponse) -> "Session":
        """Create a new persisted search session from a recommendation response.

        The response is assigned a fresh UUID ``session_id`` before being saved.
        If the response includes a summary, that summary becomes the first
        assistant message in the conversation transcript.
        """
        session = cls(str(uuid.uuid4()))
        session.path.mkdir(parents=True, exist_ok=False)

        response.session_id = session.session_id
        session._write_json(
            "search_results.json",
            {
                "session_id": session.session_id,
                "query": query,
                "filters": filters.model_dump(mode="json", exclude_none=True),
                "response": response.model_dump(mode="json", exclude_none=True),
            },
        )

        messages = []
        if response.summary:
            messages.append({"role": "assistant", "content": response.summary})
        session._write_json("conversation.json", {"session_id": session.session_id, "messages": messages})
        return session

    @classmethod
    def load(cls, session_id: str) -> "Session":
        """Load an existing session by UUID string.

        Raises ``ValueError`` for invalid UUIDs and ``FileNotFoundError`` when
        the UUID is well-formed but no session directory exists.
        """
        normalized = str(uuid.UUID(session_id))
        session = cls(normalized)
        if not session.path.exists():
            raise FileNotFoundError(session.path)
        return session

    def add_message(self, message: str, role: ChatRole = "user") -> None:
        """Append one message to the conversation transcript."""
        if role not in {"user", "assistant"}:
            raise ValueError("role must be 'user' or 'assistant'")

        conversation = self._read_json("conversation.json", {"session_id": self.session_id, "messages": []})
        conversation.setdefault("messages", []).append({"role": role, "content": message})
        self._write_json("conversation.json", conversation)

    def get_messages(self) -> list[ChatMessage]:
        """Return the conversation transcript as OpenAI-style chat messages.

        The returned list contains only message dictionaries, e.g.
        ``[{"role": "user", "content": "..."}]``. It omits session metadata and
        returns a copy so callers can safely add system/developer messages before
        passing the list to an LLM client.
        """
        conversation = self._read_json("conversation.json", {"session_id": self.session_id, "messages": []})
        return [
            {"role": message["role"], "content": message["content"]}
            for message in conversation.get("messages", [])
        ]

    def _read_json(self, filename: str, fallback: Any) -> Any:
        """Read a JSON file from this session, returning fallback if unavailable."""
        try:
            return json.loads((self.path / filename).read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return fallback

    def _write_json(self, filename: str, data: Any) -> None:
        """Write a JSON file in this session using stable pretty formatting."""
        (self.path / filename).write_text(json.dumps(data, indent=2) + "\n")
