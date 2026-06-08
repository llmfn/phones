"""The Flask application: serves the UI and the recommend API.

``app`` is re-exported from the package ``__init__`` so it runs as
``flask --app app``. Templates and static assets sit beside this module
(``app/templates``, ``app/static``); Flask resolves them from this file's
location by default.

Skeleton stage (PLAN.md Task 1): /api/recommend is a stub. It returns the
response shape from the contract in docs/specs.md with a fabricated trace —
layers in active_layers are "success", later layers are "skipped". Real layer
logic (Search, Prompt, ...) is filled in by later tasks.
"""

import random

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Single source of truth for layer numbers and names. Index = layer number - 1.
LAYERS = [
    (1, "Search"),
    (2, "Prompt"),
    (3, "Schema"),
    (4, "Context"),
    (5, "State"),
    (6, "Memory"),
    (7, "Tool Use"),
    (8, "Evals"),
]


def _stub_trace(query, active_layers):
    """Build one trace row per layer: active -> success, later -> skipped."""
    active = set(active_layers)
    trace = []
    for number, name in LAYERS:
        if number in active:
            trace.append(
                {
                    "layer": number,
                    "name": name,
                    "input": {"query": query},
                    "output": {"note": f"{name} layer stub — not implemented yet"},
                    "status": "success",
                    "latency_ms": random.randint(20, 180),
                }
            )
        else:
            trace.append(
                {
                    "layer": number,
                    "name": name,
                    "input": {},
                    "output": {},
                    "status": "skipped",
                    "latency_ms": 0,
                }
            )
    return trace


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/recommend")
def recommend():
    body = request.get_json(silent=True) or {}
    query = body.get("query", "")
    active_layers = body.get("active_layers") or []
    simulate_failure = bool(body.get("simulate_failure"))

    if simulate_failure:
        return jsonify(
            {
                "answer": "Simulated API failure — this is a forced error for testing.",
                "products": [],
                "trace": [
                    {
                        "layer": 1,
                        "name": LAYERS[0][1],
                        "input": {"query": query},
                        "output": {"error": "simulate_failure was set to true"},
                        "status": "error",
                        "latency_ms": random.randint(5, 40),
                    }
                ],
            }
        )

    return jsonify(
        {
            "answer": f'You asked: "{query}"',
            "products": [],
            "trace": _stub_trace(query, active_layers),
        }
    )
