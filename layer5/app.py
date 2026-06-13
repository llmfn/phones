"""Layer 5 - State

Layer 5 of Phone recommender adds session state to the contextual pipeline.
The search path still rewrites the query, retrieves phones, and writes a
grounded summary, but follow-up chat turns now receive the persisted message
history for the current search session. HTTP and LLM calls remain stateless;
the application provides continuity by appending each turn to a session
transcript and passing that transcript back into the chat prompt.
"""
import json

from phonekit import Application, apply_filters, search_semantic, llmfn
from phonekit.catalog import load_catalog
from pydantic import BaseModel, Field
from phonekit.schema import Filters

app = Application(__name__)

app.set_design_flag("FILTER_UI", "popover")
app.set_design_flag("CONVERSATION_UI", "left_sidebar")

PROMPT = app.read_file("prompt.md")
PROMPT_SUMMARY = app.read_file("prompt_summary.md")
PROMPT_CHAT = app.read_file("prompt_chat.md")

class Schema(BaseModel):
    """Structured query plan used before retrieval."""
    query: str = Field(description="rewritten search query optimised for embedding space over phone specs")
    filters: Filters = Field(description="hard filters to apply to the search results")
    persona: str | None = Field(description='one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null')

def summarize(query, products):
    """Generate the first assistant turn from the top-3 retrieved products."""
    docs = {entry.doc.id: entry.doc for entry in load_catalog()}
    context = [
        {
            "name": p.name,
            "price": p.price,
            "narrative": docs[p.id].narrative,
            "specs": docs[p.id].specs,
        }
        for p in products[:3]
    ]
    input = f"Query: {query}\n\nPhones:\n{json.dumps(context, indent=2)}"
    return llmfn(instructions=PROMPT_SUMMARY, input=input)

def search(query, filters):
    """Run the contextual search pipeline that creates a new stateful session."""
    response = llmfn(instructions=PROMPT, input=query, output_schema=Schema)
    products = search_semantic(response.query)
    result = apply_filters(products, filters)
    result = apply_filters(result.products, response.filters)
    if result.products:
        result.summary = summarize(query, result.products)
    return result

class ChatResponseSchema(BaseModel):
    """Rich assistant reply for the conversation sidebar."""

    text: str = Field("The response from the llm")
    suggestions: list[str]|None = Field("The possible suggestions for the user if the response is a questions with multiple options. This could be empty or null")

def chat(session, message):
    """Answer a follow-up using the session transcript as conversation state."""
    # The current message has already been appended to the transcript by
    # PhoneKit before this hook runs.
    past_messages = session.get_messages()
    # TODO: inject the search results as the first message so that the agent
    # has context of the current results the user is looking at
    response = llmfn(instructions=PROMPT_CHAT, input=past_messages, output_schema=ChatResponseSchema)
    return response.model_dump()

if __name__ == "__main__":
    app.search = search
    app.chat = chat
    app.run()
