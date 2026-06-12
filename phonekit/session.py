"""File-backed search sessions and conversation history."""

import json
import uuid
from pathlib import Path
from typing import ClassVar, Literal

from .schema import Filters, RecommendResponse

DEFAULT_SESSION_ROOT = Path(__file__).parent.parent / "data" / "state"


class Session:
    """One search session stored under ``data/state/<session_id>/``."""

    root: ClassVar[Path] = DEFAULT_SESSION_ROOT

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.path = self.root / session_id

    @classmethod
    def configure_root(cls, root: str | Path) -> None:
        cls.root = Path(root)

    @classmethod
    def new(cls, query: str, filters: Filters, response: RecommendResponse) -> "Session":
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
        normalized = str(uuid.UUID(session_id))
        session = cls(normalized)
        if not session.path.exists():
            raise FileNotFoundError(session.path)
        return session

    def add_message(self, message: str, role: Literal["user", "assistant"] = "user") -> None:
        if role not in {"user", "assistant"}:
            raise ValueError("role must be 'user' or 'assistant'")

        conversation = self._read_json("conversation.json", {"session_id": self.session_id, "messages": []})
        conversation.setdefault("messages", []).append({"role": role, "content": message})
        self._write_json("conversation.json", conversation)

    def _read_json(self, filename: str, fallback):
        try:
            return json.loads((self.path / filename).read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return fallback

    def _write_json(self, filename: str, data) -> None:
        (self.path / filename).write_text(json.dumps(data, indent=2) + "\n")
