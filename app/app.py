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

from .layers import create_layer
from .layers.schema import Filters

app = Flask(__name__)


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
