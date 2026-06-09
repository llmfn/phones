# phones

Phone recommender app

## Overview


We build one product recommender and improve it layer by layer. The system evolves from search to prompts, schema, context, state, memory, tool use, and evals. Each layer reveals what the system needs next. We learn by building, breaking and refining the systems together.

This folder contains the product recommender app that is used by the students during the course. The app will have config flags to enable/disable the layers.

# Running

Dependencies are managed with [uv](https://docs.astral.sh/uv/).

```sh
# 1. Build the phone catalogue database (data/phones/*.json -> phones.db)
make import

# 2. Run the app at http://127.0.0.1:5000
make run
```

`make import` reads the per-phone JSON documents in `data/phones/`, (re)creates
`phones.db` from `data/schema.sql`, and rebuilds the FTS5 search index. Re-run it
whenever the catalogue data or schema changes. The database is a build artifact
and is git-ignored.

The active layer is owned by the backend (`app/config.py`, `CURRENT_LAYER`), not
the UI — the frontend never selects a layer.

# Specs

See docs/specs.md for the product specs. 

