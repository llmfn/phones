"""Build the phone catalogue database from the JSON documents in ``data/phones``.

Run from the repo root::

    uv run python -m scripts.import_phones   # or: make import

Each ``data/phones/<id>.json`` is validated, then the script (re)creates the
database at ``config.DB_PATH`` from ``data/schema.sql`` and loads every phone.
Re-running is safe -- the schema drops and recreates the tables, so the database
always matches the JSON on disk. The FTS index is rebuilt once at the end rather
than maintained by triggers, because the app only ever reads.
"""

import json
import sqlite3
from pathlib import Path

from app import config
from app.layers.schema import Product

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_PHONES_DIR = _DATA_DIR / "phones"
_SCHEMA_SQL = _DATA_DIR / "schema.sql"


class PhoneDoc(Product):
    """A catalogue entry: the API ``Product`` plus the search-only text.

    ``description`` is indexed by FTS5 but never returned to the browser, so it
    lives here and in the database, not in ``Product`` (see docs/specs.md).
    """

    description: str


def load_phones() -> list[PhoneDoc]:
    """Read and validate every phone document, sorted by id for stable output."""
    paths = sorted(_PHONES_DIR.glob("*.json"))
    if not paths:
        raise SystemExit(f"No phone documents found in {_PHONES_DIR}")
    phones = []
    for path in paths:
        data = json.loads(path.read_text())
        try:
            phones.append(PhoneDoc.model_validate(data))
        except Exception as exc:  # surface which file is malformed
            raise SystemExit(f"Invalid phone document {path.name}: {exc}") from exc
    return phones


def build_database(phones: list[PhoneDoc]) -> None:
    conn = sqlite3.connect(config.DB_PATH)
    try:
        conn.executescript(_SCHEMA_SQL.read_text())
        conn.executemany(
            "INSERT INTO phones (id, brand, name, price, image, description) "
            "VALUES (:id, :brand, :name, :price, :image, :description)",
            [p.model_dump() for p in phones],
        )
        # Populate the external-content FTS index from the rows just inserted.
        conn.execute("INSERT INTO phones_fts(phones_fts) VALUES ('rebuild')")
        conn.commit()
    finally:
        conn.close()


def main() -> None:
    phones = load_phones()
    build_database(phones)
    print(f"Imported {len(phones)} phones into {config.DB_PATH}")


if __name__ == "__main__":
    main()
