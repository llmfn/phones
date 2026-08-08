"""Persistent user profile stored at data/memory/memory.json."""

import json
from pathlib import Path

DEFAULT_MEMORY_PATH = Path(__file__).parent.parent / "data" / "memory" / "memory.json"

_path = DEFAULT_MEMORY_PATH


def configure_path(path: str | Path) -> None:
    """Set the file the profile is read from and written to.

    One profile per installation is what the product wants and what the layers
    assume. A caller that runs many conversations at once -- scoring a file of
    evals, say -- points this at a scratch file first, so the runs neither
    teach each other preferences nor overwrite the profile of whoever is using
    the app.
    """
    global _path
    _path = Path(path)


def load() -> dict:
    """Load the profile, returning an empty dict if none exists yet."""
    try:
        return json.loads(_path.read_text())
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
    _path.parent.mkdir(parents=True, exist_ok=True)
    _path.write_text(json.dumps(profile, indent=2) + "\n")
    return profile
