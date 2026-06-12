"""Narrative embeddings for semantic search, with a local corpus cache.

Each phone's parent ``narrative`` is embedded once via the OpenAI API and
cached in ``data/cache/phones_embeddings.json``. A cache entry is keyed by
phone id and stamped with the embedding model and a hash of the narrative it
embedded, so editing a narrative (or switching models) re-embeds exactly the
phones that changed -- the file layout never decides recompute granularity,
the stamps do. ``data/cache/`` is gitignored: the catalogue is baked data, but
embeddings are computed in front of the class on the first semantic startup,
logging each phone as it lands; later startups pay only for query-time
embeddings.

Like BM25 (``bm25.py``), the similarity math is hand-rolled and inspectable:
cosine over plain Python lists, no vector store, so the X-Ray trace can show
exactly why a phone ranked where it did.
"""

import hashlib
import json
from functools import lru_cache

from .. import config
from ..catalog import CatalogEntry, load_catalog

# Where the narrative-embedding cache lives. data/cache/ is gitignored: the
# phone catalogue is baked data, but embeddings are computed live on first
# semantic startup so the class sees it happen.
EMBEDDINGS_PATH = config.PHONES_DIR.parent / "cache" / "phones_embeddings.json"


@lru_cache(maxsize=1)
def _client():
    """One OpenAI client per process, so query embeddings reuse the HTTP
    connection instead of paying DNS + TLS setup on every request."""
    if not config.OPENAI_API_KEY:
        raise RuntimeError(
            "SEARCH_MODE is 'semantic' but OPENAI_API_KEY is not set in the "
            "environment (see app/config.py)."
        )
    from openai import OpenAI  # deferred so bm25 mode never needs the package

    return OpenAI(api_key=config.OPENAI_API_KEY)


def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts in one OpenAI API call, in order."""
    response = _client().embeddings.create(model=config.EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity. OpenAI embeddings come back unit-length, so this is
    effectively a dot product; the norms keep it honest for any input."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _narrative_hash(narrative: str) -> str:
    return hashlib.sha256(narrative.encode("utf-8")).hexdigest()


def _is_fresh(entry: CatalogEntry, cached: dict | None) -> bool:
    return (
        cached is not None
        and cached.get("model") == config.EMBEDDING_MODEL
        and cached.get("narrative_sha256") == _narrative_hash(entry.doc.narrative)
    )


@lru_cache(maxsize=1)
def corpus_embeddings() -> tuple[tuple[CatalogEntry, ...], list[list[float]]]:
    """The catalogue with one narrative embedding per phone, cache-backed.

    Loads the local cache, embeds only phones whose entry is missing or
    stale, prunes entries for deleted phones, and rewrites the file iff
    anything changed. Built once per process, like ``catalog_index()`` --
    restart the app after changing the catalogue.
    """
    entries = load_catalog()
    cache: dict[str, dict] = {}
    if EMBEDDINGS_PATH.exists():
        cache = json.loads(EMBEDDINGS_PATH.read_text())

    stale = [e for e in entries if not _is_fresh(e, cache.get(e.doc.id))]
    if stale:
        print(
            f"[embeddings] embedding {len(stale)} narrative(s) "
            f"with {config.EMBEDDING_MODEL} ...",
            flush=True,
        )
        for entry, vector in zip(stale, embed([e.doc.narrative for e in stale])):
            print(f"[embeddings]   {entry.doc.name}", flush=True)
            cache[entry.doc.id] = {
                "model": config.EMBEDDING_MODEL,
                "narrative_sha256": _narrative_hash(entry.doc.narrative),
                "embedding": vector,
            }

    fresh_cache = {e.doc.id: cache[e.doc.id] for e in entries}
    if stale or len(fresh_cache) != len(cache):
        EMBEDDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        EMBEDDINGS_PATH.write_text(json.dumps(fresh_cache, sort_keys=True))

    return entries, [fresh_cache[e.doc.id]["embedding"] for e in entries]
