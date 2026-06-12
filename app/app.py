"""The Flask application: serves the UI and the recommend API.

``app`` is re-exported from the package ``__init__`` so it runs as
``flask --app app``. Templates and static assets sit beside this module
(``app/templates``, ``app/static``); Flask resolves them from this file's
location by default.

The active layer is owned by the backend (``app/config.py``), not the request.
Each query is handed to that layer, which returns the products, facets, and
trace defined by the contract in docs/specs.md.
"""

from flask import Flask, jsonify, render_template, request

from . import config
from .layers import create_layer
from .layers.schema import Filters

app = Flask(__name__)

if config.SEARCH_MODE == "semantic":
    # Build (or load) the narrative-embedding cache up front, so the one-time
    # corpus embedding happens visibly at startup rather than inside the first
    # query. bm25 mode skips this and never needs an API key.
    from .search.embeddings import corpus_embeddings

    corpus_embeddings()


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/recommend")
def recommend():
    body = request.get_json(silent=True) or {}
    query = body.get("query", "")
    filters = Filters.model_validate(body.get("filters") or {})

    layer = create_layer()
    result = layer.run_query(query, filters)

    return jsonify(result.model_dump(exclude_none=True))
