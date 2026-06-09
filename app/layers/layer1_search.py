"""Layer 1: keyword search.

The first real search layer. It overrides ``search`` to match the query against
a SQLite FTS5 index (built by ``scripts/import_phones.py``) instead of returning
the whole catalogue. The base ``Layer`` still applies filters and computes facets
over the result, so only candidate selection changes.

This is keyword matching, nothing more: every query word must appear in a
phone's name, brand, or description, ranked by relevance. It handles literal
searches ("samsung 5g") but not vibe queries ("a phone for my mom") -- words like
"mom" match nothing, so the whole query returns no results (the empty state in
docs/specs.md). That brittleness is the limitation later layers exist to fix.
"""

import re
import sqlite3

from .. import config
from .base import Layer
from .schema import Product

# Words to feed FTS5 MATCH. Splitting on non-alphanumerics drops punctuation and
# FTS operator characters, so arbitrary user text can't break the query syntax.
_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


class Layer1(Layer):
    number = 1
    name = "Search"

    def search(self, query: str) -> list[Product]:
        terms = _TOKEN_RE.findall(query.lower())
        conn = self._connect()
        try:
            if not terms:
                # No usable query: return the whole catalogue so filter-only
                # flows (and clearing the query) still show results.
                rows = conn.execute(
                    "SELECT id, name, brand, price, image FROM phones"
                ).fetchall()
            else:
                # Require every term (space = implicit AND in FTS5), ranked by
                # bm25 (`rank`). Quoting each term keeps it a literal, not an
                # operator. AND is what makes naive keyword search whiff on vibe
                # queries -- the Layer 1 limitation docs/specs.md calls out.
                match = " ".join(f'"{term}"' for term in terms)
                rows = conn.execute(
                    "SELECT p.id, p.name, p.brand, p.price, p.image "
                    "FROM phones_fts f JOIN phones p ON p.rowid = f.rowid "
                    "WHERE phones_fts MATCH ? ORDER BY rank",
                    (match,),
                ).fetchall()
        finally:
            conn.close()
        return [Product(**dict(row)) for row in rows]

    def _connect(self) -> sqlite3.Connection:
        if not config.DB_PATH.exists():
            raise RuntimeError(
                f"Catalogue database not found at {config.DB_PATH}. "
                "Build it with `make import`."
            )
        conn = sqlite3.connect(f"file:{config.DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
