"""App configuration.

The backend owns which layer is active -- the frontend never sends a layer (see
docs/specs.md). Bump this number as later layers are implemented.
"""

from pathlib import Path

CURRENT_LAYER = 1

# The phone catalogue database (built by scripts/import_phones.py). An absolute
# path anchored to the repo root -- the parent of the `app/` package -- so the
# app and the import script agree regardless of the working directory.
DB_PATH = Path(__file__).resolve().parent.parent / "phones.db"
