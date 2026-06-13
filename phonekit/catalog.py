"""The in-memory phone catalogue.

The catalogue is the JSON documents in ``data/phones/`` loaded straight into
memory -- no database, no build step. ``load_catalog()`` reads and validates
every document once per process; layers share the result. Each entry keeps the
raw JSON dict alongside the validated model so search can index the whole
record while the API returns only the typed ``Product`` projection.

Each document is a **parent phone plus its purchasable configurations** (see
docs/specs.md). The parent owns what every configuration shares -- specs,
signals, and the narrative written for semantic search. ``colors`` lists the
colour options (each with its own image); ``storage_options`` lists the storage
tiers with prices. The two arrays are independent: every colour is available in
every storage tier.
"""

import json
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

# The phone catalogue: one JSON document per phone. An absolute path anchored
# to the repo root so it works regardless of working directory.
PHONES_DIR = Path(__file__).resolve().parent.parent / "data" / "phones"

MODEL_ALIAS_STOPWORDS = {
    "phone",
    "smartphone",
    "mobile",
    "pro",
    "plus",
    "ultra",
    "max",
    "mini",
    "lite",
    "fe",
    "se",
    "ce",
    "edition",
    "limited",
    "special",
    "generation",
    "engineered",
    "with",
    "and",
    "by",
    "co",
}


class Color(BaseModel):
    """One colour option: marketing name, canonical family, optional hex, and image."""

    name: str
    family: str
    hex: Optional[str] = None
    image: str


class StorageOption(BaseModel):
    """One storage tier: capacity, display label, optional RAM, and price in INR."""

    gb: int
    label: str
    ram_gb: Optional[int] = None
    price: int


class Signals(BaseModel):
    """Use-case and persona tags for re-ranking after retrieval.

    ``use_cases`` describes what the phone is good at; ``personas`` describes
    who it suits; ``price_segment`` places it in the market.
    """

    use_cases: list[str] = Field(default_factory=list)
    personas: list[str] = Field(default_factory=list)
    price_segment: str = ""


class PhoneDoc(BaseModel):
    """A catalogue document: the parent product and its purchasable options.

    ``narrative``, ``specs``, and ``signals`` are search/teaching material,
    never returned to the browser. ``narrative`` is one paragraph written for
    semantic search; ``signals`` are structured re-ranking tags.
    """

    id: str
    brand: str
    name: str
    narrative: str
    specs: dict[str, Any] = Field(default_factory=dict)
    signals: Signals = Field(default_factory=Signals)
    colors: list[Color] = Field(min_length=1)
    storage_options: list[StorageOption] = Field(min_length=1)


class CatalogEntry:
    """One phone: the validated model plus the raw JSON it came from."""

    def __init__(self, doc: PhoneDoc, raw: dict):
        self.doc = doc
        self.raw = raw


@lru_cache(maxsize=1)
def load_catalog() -> tuple[CatalogEntry, ...]:
    """Read and validate every phone document, sorted by id for stable output."""
    paths = sorted(PHONES_DIR.glob("*.json"))
    if not paths:
        raise RuntimeError(f"No phone documents found in {PHONES_DIR}")
    entries = []
    for path in paths:
        raw = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        try:
            doc = PhoneDoc.model_validate(raw)
        except Exception as exc:  # surface which file is malformed
            raise RuntimeError(f"Invalid phone document {path.name}: {exc}") from exc
        entries.append(CatalogEntry(doc, raw))
    return tuple(entries)


def get_brands() -> list[dict]:
    """Return canonical catalogue brands and derived model-family aliases.

    ``name`` is the brand value stored on phone documents. ``aliases`` is built
    from repeated leading words in that brand's model names, after removing the
    canonical brand name, generic variant words such as "Pro", and any token
    containing numbers. This keeps the data source as the phone catalogue while
    still surfacing names users may treat like brands, such as Redmi.
    """
    aliases_by_brand: dict[str, Counter[str]] = defaultdict(Counter)
    for entry in load_catalog():
        alias = _model_alias(entry.doc.name, entry.doc.brand)
        if alias:
            aliases_by_brand[entry.doc.brand][alias] += 1

    brands = sorted({entry.doc.brand for entry in load_catalog()})
    return [
        {
            "name": brand,
            "aliases": sorted(
                alias
                for alias, count in aliases_by_brand[brand].items()
                if count > 1
            ),
        }
        for brand in brands
    ]


def _model_alias(model_name: str, brand: str) -> str | None:
    brand_words = {word.lower() for word in _words(brand)}
    for word in _words(model_name):
        lowered = word.lower()
        if lowered in brand_words or lowered in MODEL_ALIAS_STOPWORDS:
            continue
        if any(char.isdigit() for char in word):
            continue
        return word
    return None


def _words(value: str) -> list[str]:
    return [word for word in re.findall(r"[A-Za-z0-9]+", value) if word[0].isalpha()]
