# phones

Phone recommender app

## Overview


We build one product recommender and improve it layer by layer. The system evolves from search to prompts, schema, context, state, memory, tool use, and evals. Each layer reveals what the system needs next. We learn by building, breaking and refining the systems together.

This folder contains the product recommender app that is used by the students during the course. The app will have config flags to enable/disable the layers.

# Running

Dependencies are managed with [uv](https://docs.astral.sh/uv/).

```sh
# Run the app at http://127.0.0.1:5000
make run
```

The phone catalogue is the per-phone JSON documents in `data/phones/`, loaded
into memory at startup — there is no database or build step. Restart the app
after changing the catalogue data.

The active layer is owned by the backend (`app/config.py`, `CURRENT_LAYER`), not
the UI — the frontend never selects a layer.

# Specs

See docs/specs.md for the product specs. 

