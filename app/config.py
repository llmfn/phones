"""App configuration.

The backend owns which layer is active -- the frontend never sends a layer (see
docs/specs.md). Bump this number as later layers are implemented.
"""

import os
from pathlib import Path

CURRENT_LAYER = 1

# Layer 1 has two levels: "bm25" (keyword matching) and "semantic" (embedding
# similarity over the narratives). bm25 is the default so the app runs without
# any API key; flip to "semantic" for the vibe-query demo.
SEARCH_MODE = "bm25"

# How many phones semantic search returns. There is no similarity cutoff --
# cosine scores aren't comparable across queries, so a fixed k is the honest
# choice (a threshold is hybrid-search territory).
SEMANTIC_TOP_K = 10

# OpenAI powers the embeddings (and the LLM layers later -- one vendor, one
# key). Read here so the rest of the app never touches the environment;
# validated only when a semantic query actually runs, so bm25 mode and app
# startup never require the key.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
EMBEDDING_MODEL = "text-embedding-3-small"

# The phone catalogue: one JSON document per phone, loaded into memory at
# startup (app/catalog.py). An absolute path anchored to the repo root -- the
# parent of the `app/` package -- so it works regardless of working directory.
PHONES_DIR = Path(__file__).resolve().parent.parent / "data" / "phones"

# Cached narrative embeddings, committed so students only pay for query-time
# embeddings (see app/search/embeddings.py for the staleness rules).
EMBEDDINGS_PATH = PHONES_DIR.parent / "phones_embeddings.json"
