"""Persistent user profile stored at data/memory/memory.json."""

import json
from pathlib import Path

_MEMORY_PATH = Path(__file__).parent.parent / "data" / "memory" / "memory.json"


def load() -> dict:
    """Load the profile, returning an empty dict if none exists yet."""
    try:
        return json.loads(_MEMORY_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def merge(updates: dict) -> dict:
    """Merge updates into the profile, persist, and return the result.

    Only the keys present in ``updates`` are changed; everything else is kept.
    The caller should pass ``model_dump(exclude_none=True)`` so that null
    fields from the LLM do not overwrite previously known values.
    """
    profile = load()
    profile.update(updates)
    _MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _MEMORY_PATH.write_text(json.dumps(profile, indent=2) + "\n")
    return profile
