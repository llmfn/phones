"""Settings for the application, read from settings.py at the repo root."""

import runpy
from pathlib import Path
from dataclasses import dataclass
import functools

@dataclass
class Settings:
    openai_api_key: str
    openai_model: str

ROOT = Path(__file__).parent.parent
SETTINGS_PATH = ROOT / "settings.py"


def check_settings() -> None:
    """Verify that settings.py contains a configured OpenAI API key."""
    if not SETTINGS_PATH.exists():
        raise RuntimeError("settings.py is missing. Copy it from settings.py.example and fill it.")

    values = runpy.run_path(str(SETTINGS_PATH))
    key = values.get("OPENAI_API_KEY")
    if not isinstance(key, str) or not key.strip() or key.strip() == "sk-proj-...":
        raise RuntimeError("OPENAI_API_KEY is not set in settings.py.")


@functools.cache
def get_settings() -> Settings:
    """Loads settings from settings.py in the root of the repo."""
    if not SETTINGS_PATH.exists():
        raise RuntimeError("settings.py is missing. Copy it from settings.py.example and fill it.")

    values = runpy.run_path(str(SETTINGS_PATH))
    try:
        return Settings(
            openai_api_key=values["OPENAI_API_KEY"],
            openai_model=values["OPENAI_MODEL"],
        )
    except KeyError as name:
        raise RuntimeError(
            f"settings.py must define {name}. See settings.py.example."
        ) from None
