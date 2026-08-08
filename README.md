# Phone Recommender Training

In this training you will build a phone recommender one capability at a time.
You will start with keyword search, inspect why it succeeds or fails, and then
replace it with semantic search.

You need [Git](https://git-scm.com/) and
[uv](https://docs.astral.sh/uv/) installed.

## Step 0: Get ready

### Clone the repository

```sh
git clone https://github.com/llmfn/phones.git
cd phones
```

### Add your OpenAI key

Create your local settings file:

```sh
cp settings.py.example settings.py
```

Open `settings.py` and replace the example value with your OpenAI API key:

```python
OPENAI_API_KEY = "your-key-here"
```

### Check your setup

```sh
make check
```

This is the short form of:

```sh
uv run python app.py --check
```

The check confirms that `settings.py` exists and `OPENAI_API_KEY` is set. It
does not call OpenAI or start the application.

## Step 1: Make keyword search work

Open `app.py`. Its `search` function currently returns no products. Change it
to search the phone catalogue with `search_bm25` and return the products in a
`SearchResult`.

BM25 matches query words against the phone records. It works well when the user
knows the words that appear in the catalogue.

### Run the application

```sh
make run
```

Open <http://127.0.0.1:5000> and try a literal query such as:

```text
samsung 5g
```

### Look at the trace

Open the X-Ray trace beside the results. Look at:

- How the query was tokenized
- How many catalogue records matched each token
- Why a phone was included or excluded
- How BM25 ranked the matching phones

Now try a query that describes a need instead of naming phone features. Notice
which words prevent BM25 from finding useful results.

### Check the evals

Run the evaluation set against your current `app.py`:

```sh
make eval
```

The evals are in `evals/evals.yaml`. Some failures are expected at this step.
The point is to establish a baseline and see which kinds of query keyword
search cannot handle.

### Add a failing query

Add one query that BM25 handles poorly to `evals/evals.yaml`:

```yaml
- query: describe what the shopper needs
  expect: >
    Describe what a useful answer should recommend and why.
```

Write the expectation in terms of the shopper's desired result, not the search
function you expect the application to use. Run `make eval` again and confirm
that the new case captures the failure you observed.

## Step 2: Replace BM25 with semantic search

Change `search` in `app.py` to use `search_semantic` instead of `search_bm25`.
Keep returning the products in a `SearchResult`.

Semantic search compares the meaning of the query with each phone's catalogue
narrative, so the words do not need to match exactly. The first run may take a
little longer while catalogue embeddings are created and cached.

Restart the application and try the failing query you added in Step 1. Inspect
the trace again to see the cosine similarity scores, then run:

```sh
make eval
```

Compare the result with your BM25 baseline. Which queries improved, and which
ones still need more than retrieval alone?
