"""App configuration.

The backend owns which layer is active -- the frontend never sends a layer (see
docs/specs.md). Bump this number as later layers are implemented.
"""

from pathlib import Path

CURRENT_LAYER = 1

# The phone catalogue: one JSON document per phone, loaded into memory at
# startup (app/catalog.py). An absolute path anchored to the repo root -- the
# parent of the `app/` package -- so it works regardless of working directory.
PHONES_DIR = Path(__file__).resolve().parent.parent / "data" / "phones"
