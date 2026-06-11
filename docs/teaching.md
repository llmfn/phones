# llmfn — Layer Design & Teaching Reference
## Eight Layers: From Search to Evals

---

## Architecture Overview

One product. One dataset. Eight layers.

The product is a phone recommender. The dataset is a JSON file of 100–200 phones, each with specs, signals, and a narrative field written for semantic search. No database. No infrastructure. Everything runs in memory.

The full pipeline at Layer 7:

```
User query
→ Pass 1: LLM rewrites query [+ tool calls if needed]
→ Semantic search on narrative embeddings
→ Top 3 phones retrieved
→ Pass 2: LLM generates grounded response [+ tool calls for live data]
→ Pass 3: LLM extracts memory → updates user profile
→ Response + cards displayed in UI
```

### Architectural Notation

```
search(query) → y0           Layer 1: Search
f(query) → y0                Layer 2: Prompt
f(query) → y0 (structured)   Layer 3: Schema
f(query, context) → y1       Layer 4: Context
f(query, state, context) → y2        Layer 5: State
f(query, state, context) → y2        Layer 6: Memory (persistent state)
g(query, state, context, tools) → y3 Layer 7: Tools
measures y0 → y3                     Layer 8: Evals
```

---

## Dataset Design

Two files. Loaded once at startup.

**phones.json** — the product dataset
**phones_embeddings.json** — pre-computed narrative vectors

Each phone record has three sections:

```json
{
  "id": "pixel-9a",
  "brand": "Google",
  "model": "Pixel 9a",
  "price_inr": 49999,

  "specs": {
    "display_inches": 6.3,
    "display_type": "pOLED",
    "refresh_rate_hz": 120,
    "chipset": "Google Tensor G4",
    "ram_gb": 8,
    "storage_gb": 256,
    "rear_camera_mp": 48,
    "front_camera_mp": 13,
    "battery_mah": 5100,
    "charging_wired_w": 23,
    "charging_wireless_w": 7.5,
    "os": "Android 15",
    "os_updates_years": 7,
    "ip_rating": "IP68",
    "colours": ["Obsidian", "Porcelain", "Peony", "Iris"]
  },

  "signals": {
    "use_cases": ["photography", "daily-driver", "ai-features"],
    "personas": ["value-seeker", "camera-lover", "clean-android"],
    "price_segment": "mid-range"
  },

  "narrative": "The Pixel 9a is Google's best value smartphone — a mid-range phone with a flagship-grade camera system, clean Android experience, and seven years of software updates. Ideal for users who want reliable performance and exceptional photos without paying flagship prices."
}
```

**Why three sections:**
- `specs` — structured, filterable, injected as context in Layer 4
- `signals` — persona re-ranking after retrieval
- `narrative` — the field that gets embedded; written in natural language for semantic search

---

## Layer 1: Search

### Design

**Pattern:** Pre-LLM
**Notation:** `search(query) → y0`
**Storage:** phones.json in memory
**Search method:** BM25 on full JSON records

The baseline. A search box. BM25 scores documents by term frequency across all JSON fields. Returns a ranked list of phones as cards.

**What it fixes:** Users can find phones by keyword.
**What it reveals:** Intent is ignored. `"something for my mom"` has zero term overlap with any phone record. Returns nothing.

**Level 2 — Semantic Search:**
Embed only the `narrative` field, not the full JSON. Pre-compute embeddings into `phones_embeddings.json`. At query time, compute cosine similarity in memory. No database needed.

Why not embed the whole JSON:
- Spec fields (`"ram_gb": 8`) don't embed meaningfully against natural language
- Numbers have no semantic neighbourhood in embedding space
- Noise from irrelevant fields degrades retrieval

Production pattern: hybrid search — BM25 for exact model names, semantic for intent, re-ranker combines both signals.

### Teaching

**The failure moment:**
User types `"something for my mom who struggles with technology"`. BM25 returns zero results. Every word in the query is meaningful. None maps to a JSON field.

**The lesson:**
Search matches tokens. It has no model of intent. This is not a failure of the search implementation — it is a fundamental limit of the approach.

**What to show in the X-Ray trace:**
```
Query: "something for my mom who struggles with technology"
BM25 tokens: [something, mom, struggles, technology]
Matches: 0
```

---

## Layer 2: Prompt

### Design

**Pattern:** Stateless LLM
**Notation:** `f(query) → y0`
**LLM calls:** 1 (Pass 1 — query rewriting)

The first LLM call. The model rewrites the natural language query into a better search query for semantic retrieval. The rewritten query then hits semantic search.

**Three prompt engineering levels:**

Zero-shot (baseline):
```
System: Rewrite this query for semantic search over phone specs.
User:   "something for my mom who struggles with technology"
Output: "simple smartphone easy to use elderly large display"
```

Few-shot (better):
```
System: Rewrite queries for semantic search. Examples:
        Input:  "wireless headphones under ₹3000"
        Output: "wireless audio headphones budget affordable"
        Input:  "something for a morning run"
        Output: "fitness outdoor activity sports lightweight"
User:   "something for my mom who struggles with technology"
Output: "simple large display easy navigation elderly user"
```

Chain-of-thought (most reliable):
```
System: First identify: user profile, primary need, constraints.
        Then rewrite as a search query.
User:   "something for my mom who struggles with technology"
Thinking: user=elderly, need=simplicity, constraint=ease-of-use
Output: "simple smartphone large display easy navigation elderly"
```

**What it fixes:** Intent now maps to semantic search space.
**What it reveals:** Output is inconsistent — sometimes a sentence, sometimes fragments, sometimes adds filters, sometimes doesn't. Downstream code cannot rely on the shape.

**Level 2 rabbit hole:** At scale, hand-crafting few-shot examples breaks down. DSPy treats prompts as programs — optimising examples algorithmically against a dataset.

### Teaching

**The failure moment:**
Run the same query twice. Pass 1 returns different shapes:
```
Run 1: "simple smartphone easy navigation elderly large screen"
Run 2: {"category": "budget", "user": "elderly", "features": ["large display"]}
```

Different shape every time. Layer 3 exists because of this failure.

**The lesson:**
Better prompt engineering reduces inconsistency but doesn't eliminate it. The prompt is now a maintained artifact — it drifts, breaks, needs versioning.

**What to show in X-Ray trace:**
```
[Pass 1 Input]  "something for my mom who struggles with technology"
[Pass 1 Output] "simple large display easy navigation elderly user"
[Search]        cosine similarity → Moto G84 (0.91), Samsung A35 (0.87), Pixel 9a (0.82)
```

---

## Layer 3: Schema

### Design

**Pattern:** Stateless LLM + output contract
**Notation:** `f(query) → y0` (structured)
**LLM calls:** 1 (Pass 1 — query rewriting with schema enforced)

A strict output contract on Pass 1. The model must return a consistent shape every time. Validated before hitting semantic search.

```json
{
  "query": "simple large display easy navigation elderly",
  "filters": {
    "max_price": null,
    "min_battery_mah": null,
    "os": null
  },
  "persona": "elderly"
}
```

**Three example inputs and outputs:**

| User query | Structured output |
|---|---|
| `"something my teenage daughter would love under ₹20k"` | `{query: "trendy smartphone front camera social media teen", filters: {max_price: 20000}, persona: "teen"}` |
| `"best camera phone under ₹40k"` | `{query: "high quality rear camera photography", filters: {max_price: 40000}, persona: null}` |
| `"phone for my mom who struggles with technology"` | `{query: "simple large display easy navigation elderly", filters: {}, persona: "elderly"}` |

**How persona works:**
Persona is a re-ranking signal applied *after* semantic retrieval, not before. Semantic search returns 10 candidates. Persona re-ranks them — `"elderly"` boosts large display, simple UI, loud speaker. Without persona, a query about simplicity might surface a gaming phone ahead of a large-display budget phone.

**What it fixes:** Consistent shape every call. Downstream code can rely on it.
**What it reveals:** Output is now structured and reliable — but the model answers from its own knowledge, not from actual product data.

**Level 2 rabbit hole:** Pydantic (Python) or Zod (JS) for strict validation with custom error messages. Graceful fallback loops when validation fails.

### Teaching

**The failure moment:**
Schema is working. Query is structured. Search returns Moto G84 as top result. User asks: *"Does it have wireless charging?"*

The model answers confidently. But it isn't looking at your phones.json. It is answering from training weights. The spec it states may be wrong.

**The lesson:**
Schema controls the shape of output. It does not control the source of truth. Grounding comes next.

---

## Layer 4: Context

### Design

**Pattern:** Contextual LLM
**Notation:** `f(query, context) → y1`
**LLM calls:** 2 (Pass 1 — query rewriting, Pass 2 — response generation)
**UI change:** Search box + cards + natural language summary above cards

The pipeline becomes two passes with different jobs.

**Pass 1 — Query Rewriting** (same as Layer 3):
```
Input:  user query
Output: structured query object
→ semantic search → top 3 phones
```

**Pass 2 — Response Generation (new):**
```
Input:  original user query + top 3 phone records (selected fields only)
Output: grounded natural language recommendation
```

**What gets injected as context:**
Not the full phones.json. Not even the full phone record. Only the top 3 retrieved phones, stripped to fields relevant to the query:

```json
[
  {
    "model": "Pixel 9a",
    "price_inr": 49999,
    "narrative": "Google's best value smartphone...",
    "specs": {
      "rear_camera_mp": 48,
      "battery_mah": 5100,
      "os_updates_years": 7,
      "charging_wireless_w": 7.5
    }
  }
]
```

**Why not inject the whole phones.json:**
The Haystack problem — burying the answer in too much data degrades the response. 200 phones × full records = massive context. Model gets confused, slow, and expensive. Context is a selection, not a dump.

**Why two passes instead of one:**
Pass 1 optimises for retrieval — the query needs to match embedding space well.
Pass 2 optimises for communication — the response needs to be useful to the user.
Conflating them into one call means neither is done well.

**What it fixes:** Model answers from your data. Specs are accurate. No hallucination on facts in context.
**What it reveals:** Pipeline is stateless. Follow-up questions break. *"What about the second one?"* — the model has no memory of the previous turn.

**Level 2 rabbit hole:** Dynamic context selection — pull only fields relevant to the query rather than a fixed subset. RAG pipelines, chunking, hybrid search, re-ranking models.

### Teaching

**The failure moment:**
Turn 1: *"show me phones for my mom"* → Moto G84, Samsung A35, Pixel 9a displayed.
Turn 2: *"what about the second one?"* → pipeline runs blind, returns wrong results.

**The X-Ray trace at Layer 4:**
```
[Pass 1 Input]   "show me phones for my mom"
[Pass 1 Output]  {query: "simple large display elderly", persona: "elderly"}
[Search]         Moto G84 (0.93), Samsung A35 (0.89), Pixel 9a (0.82)
[Context]        3 phone records injected (selected fields)
[Pass 2 Input]   original query + 3 phone records
[Pass 2 Output]  "Based on your needs, the Moto G84 is the strongest match..."
```

**The lesson:**
Context changes what the model can answer. But the pipeline has no continuity between turns. State exists as a concept — this is the moment to name it.

---

## Layer 5: State

### Design

**Pattern:** Stateful LLM
**Notation:** `f(query, state, context) → y2`
**LLM calls:** 2 (same passes, both now receive conversation history)
**UI:** Search box + cards + threaded summary (each turn appended)

**Traditional parallel:** HTTP session / session store (Redis).
State is the session. Stateless protocol (HTTP / LLM call) with continuity layered on top. Gone when the session ends.

The message array is appended to every LLM call:

```python
messages = [
  {"role": "system", "content": "You are a phone recommender..."},
  {"role": "user", "content": "show me phones for my mom"},
  {"role": "assistant", "content": "Based on your needs, the Moto G84..."},
  {"role": "user", "content": "what about the second one?"}
]
```

Both Pass 1 and Pass 2 receive the full history.

**Why keep search box + cards rather than moving to full chat UI:**
The search box and cards have been the teaching vehicle since Layer 1. A full chat UI is a product decision worth discussing explicitly — not a foregone conclusion. The threaded summary makes state visible without losing the card metaphor.

**The product decision to surface:**
When does your product need to become a chat interface, and what do you lose when it does?

**What it fixes:** Follow-up questions resolve correctly. Conversation continuity restored.
**What it reveals:** History grows unbounded. Long conversations hit context window limits. Token costs grow every turn. When the session ends, everything is gone.

**Level 2 rabbit hole:**
Sliding window — keep last N turns only.
Summarisation buffer — compress older turns into a rolling summary.
Production apps must choose one.

### Teaching

**The failure moment:**
Show the payload growing turn by turn in the X-Ray trace. By turn 10, the message array is large. Ask: what happens at turn 50? What happens at turn 500?

**The X-Ray trace at Layer 5:**
```
Turn 1 payload: [system, user_1, assistant_1]           ~800 tokens
Turn 2 payload: [system, user_1, assistant_1, user_2]   ~1100 tokens
Turn 3 payload: [system, user_1, assistant_1, user_2, assistant_2, user_3]  ~1500 tokens
```

**The lesson:**
State is cheap to add. Expensive at scale. The sliding window / summarisation decision is a product tradeoff — recency vs. full history.

---

## Layer 6: Memory

### Design

**Pattern:** Stateful LLM + persistent user profile
**Notation:** `f(query, state, context) → y2` (state now spans sessions)
**LLM calls:** 3 (Pass 1, Pass 2, Pass 3 — memory extraction)
**Storage:** user_profile.json, written at session end, loaded at session start

**Traditional parallel:** User database / user profile table.
What you explicitly write about a user that persists across sessions. Login restores context. In LLM pipeline, the model decides what to extract — that's what's new.

**Two operations:**

**Write — Pass 3 at session end:**
```
Input:  full session transcript
Job:    extract durable user preferences
Output: {
  "persona": "elderly-parent-buyer",
  "budget_inr": 20000,
  "brand_preference": "Indian",
  "note": "buying for mother, not self",
  "last_session": "2026-06-13"
}
→ written to user_profile.json
```

**Read — at session start:**
```
user_profile.json loaded
→ injected into Pass 1 system prompt
→ injected into Pass 2 context
```

**The difference from State:**

| | State | Memory |
|---|---|---|
| Duration | One session | Permanent |
| Storage | In-memory message array | user_profile.json |
| Written by | Automatic (append) | LLM extraction (Pass 3) |
| Survives session end | No | Yes |
| Traditional parallel | HTTP session | User database |
| Design commitment | None | Privacy, retention, extraction logic |

**What it fixes:** System recognises returning users. Preferences persist. Recommendations improve over time.
**What it reveals:** Pipeline can read and write a user profile — but it is still sealed. Cannot check live stock, fetch current prices, book anything. The system cannot interact with the world outside the context window.

**Level 2 rabbit hole:**
Episodic memory — storing specific past interactions, not just extracted preferences.
Vector-backed profile retrieval when the profile grows large.
Retention policy — what to keep, what to forget, for how long. A privacy decision as much as an engineering one.

### Teaching

**The failure moment:**
Session 1: User establishes they want a phone for elderly mother, budget ₹20k, prefers Indian brands.
Session 2 (next day): *"show me some options"* → pipeline has no idea who this user is. Starts from scratch.

**The key teaching point:**
In a traditional app, you decide what to write to the database — explicit form fields, clicks, purchases.
In an LLM pipeline, the model decides what to extract and write. That's new. And it raises questions the workshop should surface: what should be remembered? For how long? Who decides?

**The X-Ray trace at Layer 6:**
```
[Session Start]  user_profile.json loaded
                 {persona: "elderly-parent-buyer", budget: 20000}
[Pass 1]         profile injected into system prompt
[Pass 2]         profile injected into context
[Session End]    Pass 3 fires
                 transcript → extracted preferences → profile updated
```

---

## Layer 7: Tools

### Design

**Pattern:** Capabilities — Agent (LLM + Tools)
**Notation:** `g(query, state, context, tools) → y3`
**LLM calls:** 3 passes (same as Layer 6) + tool calls within passes
**Tools:** check_stock(), fetch_current_price(), get_emi_options()

The pipeline can now interact with the world outside the context window.

**Three tools:**
```python
check_stock(model, store)      → {"in_stock": true, "units": 3}
fetch_current_price(model)     → {"price_inr": 44999, "offer": "Flipkart sale"}
get_emi_options(price, bank)   → {"emi_6mo": 7499, "emi_12mo": 3749}
```

**Where tool calls happen:**

Pass 1 (optional) — fetch live prices before rewriting query, so the rewritten query reflects current pricing.

Pass 2 (primary) — check stock and fetch offers before generating the response. Model decides which tools to call based on the query.

```
User: "Is the Pixel 9a in stock at Croma Koramangala?"
→ Pass 2 calls check_stock("Pixel 9a", "Croma Koramangala")
→ Tool returns: {in_stock: true, units: 3}
→ Response: "Yes, the Pixel 9a is currently in stock at Croma Koramangala with 3 units available."
```

**The full pipeline at Layer 7:**
```
User query
→ Pass 1: rewrite query [+ fetch_current_price if price-sensitive]
→ Semantic search → top 3 phones
→ Pass 2: generate response [+ check_stock, get_emi_options as needed]
→ Pass 3: extract memory → update profile
→ Response + cards displayed
```

**What it fixes:** System answers questions requiring real-world data — stock, current pricing, financing options.
**What it reveals:** Tool calls can fail. APIs time out. The model hallucinates parameters. Failures are invisible without instrumentation. A broken tool call silently degrades the response or crashes the pipeline.

**Level 2 rabbit hole:**
Parallel tool calls — check stock and fetch price simultaneously.
Defensive parameter validation — intercept hallucinated parameters before they hit the API.
Graceful fallback — structured error response when a tool fails, not a crash.

### Teaching

**The failure moment:**
Introduce a simulated API failure. `check_stock()` returns a 500 error. Without defensive handling the pipeline crashes. With defensive handling the response degrades gracefully: *"I wasn't able to check live stock — you may want to verify at the store."*

**The X-Ray trace at Layer 7:**
```
[Pass 2]        "Is the Pixel 9a in stock at Croma Koramangala?"
[Tool Call]     check_stock("Pixel 9a", "Croma Koramangala")
[Tool Result]   {in_stock: true, units: 3}
[Pass 2 cont.]  response generated using tool result
```

**The lesson:**
Tools extend what the pipeline can do. They also extend what can go wrong. Every tool is a new failure mode. Evals exist because of this.

---

## Layer 8: Evals

### Design

**Pattern:** Measurement across y0 → y3
**Notation:** measures the full pipeline
**LLM calls:** 1 (LLM-as-Judge for qualitative scoring)

Evals sit differently from Layers 1–7. They don't add a new input to the function. They measure whether the function is working.

**Three levels of evals:**

**Level 1 — Assertion (simple):**
```python
assert "Pixel 9a" in response
assert response["price_inr"] <= query["filters"]["max_price"]
assert len(results) > 0
```
Fast. Binary. Catches hard failures.

**Level 2 — LLM-as-Judge:**
A separate LLM call scores the response on a rubric:

```
Given this user query, these phone records, and this response,
score on a scale of 1–5:

Fidelity:    Did the model hallucinate any spec not in the context?
Relevance:   Did the response address the user's actual need?
Tone:        Was the response appropriate for the persona?
```

**What to evaluate across the pipeline:**
- Pass 1 output: does the rewritten query match the intent?
- Retrieval: are the top 3 phones genuinely relevant?
- Pass 2 output: is the response grounded in the injected context?
- Tool calls: did the model call the right tool with valid parameters?
- Memory: did Pass 3 extract the right preferences?

**What it fixes:** Failures are visible and measurable. Output quality can be tracked over time.
**What it reveals:** Nothing. This is the last layer. What you build next are product decisions.

**Level 2 rabbit hole:**
Synthetic test dataset generation — use an LLM to generate 100 diverse test queries with expected outputs.
Evaluation platforms — Phoenix, LangSmith, Braintrust for production monitoring.
Regression testing — run evals on every prompt change before shipping.

### Teaching

**The failure moment:**
Show a response that looks correct but isn't. The model said the Pixel 9a has 64MP camera. The context says 48MP. No assertion caught it. An LLM-as-Judge fidelity score of 2/5 catches it.

**The X-Ray trace at Layer 8:**
```
[Eval Run]
Query:     "best camera phone under ₹50k"
Response:  "The Pixel 9a has a 64MP camera..."
Context:   rear_camera_mp: 48

Fidelity:  2/5  ← hallucinated spec
Relevance: 4/5
Tone:      5/5
```

**The lesson:**
A product that breaks badly is worse than one that does less. Evals are not a final step — they are the mechanism that tells you whether your pipeline can be trusted. Without them, every prompt change is a risk shipped blind.

---

## UI Evolution Across Layers

| Layer | Interface | What's visible to user |
|---|---|---|
| 1 | Search box + cards | Ranked phone cards |
| 2 | Search box + cards | Ranked phone cards (better results) |
| 3 | Search box + cards | Ranked phone cards (more consistent) |
| 4 | Search box + cards + summary | Cards + natural language recommendation above |
| 5 | Search box + cards + threaded summary | Cards + conversation thread accumulates |
| 6 | Same as 5 | Personalised from first query |
| 7 | Same as 6 | Live stock, current prices in response |
| 8 | Same as 7 | No visible change — evals run in background |

---

## X-Ray Trace Panel — What to Show Per Layer

| Layer | Key trace elements |
|---|---|
| 1 | BM25 token matching, result count |
| 2 | Pass 1 input/output, cosine similarity scores |
| 3 | Structured query object, validation result, persona |
| 4 | Pass 1, search results, context injected, Pass 2 |
| 5 | Growing message array, token count per turn |
| 6 | Profile loaded at start, Pass 3 output, profile updated |
| 7 | Tool calls as distinct rows, tool results, fallback on failure |
| 8 | Eval scores per dimension, failing assertions highlighted |

---

## Pipeline Summary

```
Layer 1  search(query) → y0
         BM25 on phones.json, returns ranked cards

Layer 2  f(query) → y0
         Pass 1: LLM rewrites query for semantic search
         Semantic search on narrative embeddings

Layer 3  f(query) → y0 (structured)
         Pass 1 output enforced to consistent schema
         Persona extracted for re-ranking

Layer 4  f(query, context) → y1
         Pass 1: query rewriting
         Pass 2: LLM generates response grounded in top 3 phones

Layer 5  f(query, state, context) → y2
         Both passes receive full conversation history
         State = message array, lives in session only

Layer 6  f(query, state, context) → y2 (persistent)
         Pass 3: LLM extracts memory at session end
         Profile loaded at session start
         Memory = user_profile.json, persists across sessions

Layer 7  g(query, state, context, tools) → y3
         Tool calls within Pass 1 and Pass 2
         check_stock, fetch_current_price, get_emi_options

Layer 8  measures y0 → y3
         Assertions + LLM-as-Judge scoring
         Fidelity, relevance, tone evaluated per response
```
