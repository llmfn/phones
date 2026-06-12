"""App configuration.

The backend owns which layer is active -- the frontend never sends a layer (see
docs/specs.md). Bump this number as later layers are implemented.
"""

import os
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

@functools.cache
def get_settings() -> Settings:
    """Loads settings from settings.py in the root of the repo."""    
    if not SETTINGS_PATH.exists():
        raise RuntimeError("settings.py is missing. Copy it from settings.py.example and fill it.")

    print("Reading settings from", SETTINGS_PATH)
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


CURRENT_LAYER = 4

# Layer 1 has two levels: "bm25" (keyword matching) and "semantic" (embedding
# similarity over the narratives). bm25 is the default so the app runs without
# any API key; flip to "semantic" for the vibe-query demo.
#SEARCH_MODE = "bm25"
SEARCH_MODE = "semantic"

# How many semantic scores to include in the trace. Search still ranks the full
# catalogue so shared filtering can run after ranking.
SEMANTIC_TRACE_TOP_N = 10

# OpenAI powers the embeddings (and the LLM layers later -- one vendor, one
# key). Read here so the rest of the app never touches the environment;
# validated only when a semantic query actually runs, so bm25 mode and app
# startup never require the key.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-5.4-mini"

# The phone catalogue: one JSON document per phone, loaded into memory at
# startup (app/catalog.py). An absolute path anchored to the repo root -- the
# parent of the `app/` package -- so it works regardless of working directory.
PHONES_DIR = Path(__file__).resolve().parent.parent / "data" / "phones"


