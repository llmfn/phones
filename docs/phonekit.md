# Phonekit Quick Reference

The functions in this page are the building blocks you compose in `app.py`.
Import them from `phonekit` and keep the application pipeline in your own
`search` function.

## Search

Both search functions take a query and return a ranked `list[Product]`. They do
not apply filters or limit the number of results. An empty query returns the
full catalogue so a filter-only search still works.

```python
from phonekit import SearchResult, rerank_by_persona, search_bm25, search_semantic
```

### `search_bm25`

```python
search_bm25(query: str) -> list[Product]
```

Searches the full phone records by keyword. Every query word must match a
phone's record, so it works best for literal queries such as `"samsung 5g"`.
It runs locally and does not require an API key.

```python
def search(query, filters) -> SearchResult:
    products = search_bm25(query)
    return SearchResult(products=products)
```

### `search_semantic`

```python
search_semantic(query: str, min_score: float = 0.3) -> list[Product]
```

Embeds the query and ranks phones by similarity to their catalogue narratives.
It works for queries where the meaning matters more than exact words, such as
`"a simple phone for my mom"`. Results below `min_score` are excluded.

Semantic search uses OpenAI embeddings and requires the API key in
`settings.py`. Catalogue embeddings are cached locally.

```python
def search(query, filters) -> SearchResult:
    products = search_semantic(query)
    return SearchResult(products=products)
```

Use a different cutoff only when the default is too strict or too broad:

```python
products = search_semantic("a simple phone for my mom", min_score=0.25)
```

### `apply_filters`

```python
from phonekit import apply_filters

apply_filters(products: list[Product], filters: Filters | None) -> SearchResult
```

Applies the selected brand, colour, and price filters to search results. It also
computes the facets used by the interface and returns the `SearchResult` that
your `search` function should return.

```python
def search(query, filters) -> SearchResult:
    products = search_semantic(query)
    return apply_filters(products, filters)
```

Call `apply_filters` after searching so the search engine can rank the full
catalogue before products are removed.

### `rerank_by_persona`

```python
rerank_by_persona(products: list[Product], persona: str | None) -> list[Product]
```

Moves phones whose catalogue persona signals match `persona` ahead of the other
results. This is a soft re-rank rather than a filter: all products remain, and
their existing order is preserved within the matching and non-matching groups.
Passing `None` returns the ranking unchanged.

```python
products = search_semantic(rewrite.query)
products = rerank_by_persona(products, rewrite.persona)
return apply_filters(products, filters)
```

Call it after search and before `apply_filters`.

## Conversation State

```python
from phonekit import Session, llmfn
```

An assigned `app.chat` function receives the current `Session` and owns the
complete conversation state transition. Append the user message before reading
the transcript so the current turn is included in the LLM input, then append the
assistant reply before returning it.

```python
def chat(session, message):
    session.add_message(message, role="user")
    messages = session.get_messages()

    reply = llmfn(
        instructions="Answer as a phone shopping assistant.",
        input=messages,
        label="chat",
    )

    session.add_message(reply, role="assistant")
    return reply


app.chat = chat
```

`session.get_messages()` returns a copy of the transcript as OpenAI-style
`{"role": ..., "content": ...}` dictionaries. For a rich reply, store only its
assistant text; suggestions and other interface metadata are not conversation
messages.

## LLM Call

```python
from phonekit import llmfn
```

```python
llmfn(instructions, input, output_schema=None, tools=None, label="")
```

`llmfn` sends an input to the configured OpenAI model. It returns text by
default, or an instance of a Pydantic model when `output_schema` is supplied.

| Argument | Meaning |
| --- | --- |
| `instructions` | The prompt that tells the model what to do. |
| `input` | The user input or message list sent to the model. |
| `output_schema` | An optional Pydantic model class for structured output. |
| `tools` | Optional Pydantic model classes the model may call as tools. |
| `label` | A short purpose shown in the trace, such as `"rewrite"`. |

### Text output

Without an output schema, the result is a string.

```python
prompt = "Rewrite the request as a concise phone search query."
rewritten_query = llmfn(
    instructions=prompt,
    input="I need something easy for my mom",
    label="rewrite",
)
```

### Structured output

Pass a Pydantic model class when later code needs named, validated fields.

```python
from pydantic import BaseModel, Field


class QueryRewrite(BaseModel):
    query: str = Field(description="search query for phone catalogue narratives")
    persona: str | None = Field(description="the user's persona, or null")


rewrite = llmfn(
    instructions="Extract a semantic search query and persona.",
    input="I need something easy for my mom",
    output_schema=QueryRewrite,
    label="rewrite",
)

products = search_semantic(rewrite.query)
```

Pass the model class itself (`QueryRewrite`), not an instance
(`QueryRewrite(...)`). Field descriptions tell the model what each value means.
