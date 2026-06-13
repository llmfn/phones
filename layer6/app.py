"""Layer 6 - Memory

Layer 6 of Phone recommender extends state into durable memory. Layer 5 keeps
continuity inside one search session; Layer 6 adds a profile that survives
across sessions. The profile is loaded before Pass 1 and Pass 2 run so that
returning-user preferences (budget, feature priorities, context) silently shape
every recommendation. The chat reply schema includes a memory field the model
fills with what it learned this turn; the layer saves those updates and strips
the field before returning to the frontend.
"""
import json

from phonekit import Application, apply_filters, search_semantic, llmfn
from phonekit.catalog import load_catalog
from phonekit import memory as mem
from pydantic import BaseModel, Field
from phonekit.schema import Filters

app = Application(__name__)

app.set_design_flag("FILTER_UI", "popover")
app.set_design_flag("CONVERSATION_UI", "left_sidebar")

PROMPT = app.read_file("prompt.md")
PROMPT_SUMMARY = app.read_file("prompt_summary.md")
PROMPT_CHAT = app.read_file("prompt_chat.md")


class Schema(BaseModel):
    """Structured query plan, optionally influenced by remembered preferences."""
    query: str = Field(description="rewritten search query optimised for embedding space over phone specs")
    filters: Filters = Field(description="hard filters to apply to the search results")
    persona: str | None = Field(description='one of "elderly", "teen", "camera-lover", "gamer", "value-seeker", or null')


class MemoryUpdate(BaseModel):
    budget_inr: int | None = Field(None, description="user's stated budget in INR")
    budget_flexible: bool | None = Field(None, description="true if the user is open to stretching the budget")
    feature_priorities: list[str] | None = Field(None, description="what the user cares most about, e.g. ['camera', 'battery']")
    os_preference: str | None = Field(None, description="'Android' or 'iOS' if stated")
    brands_preferred: list[str] | None = Field(None, description="brands the user likes; prefix avoided brands with 'not:'")
    context: str | None = Field(None, description="any other durable context, e.g. 'buying as a gift for elderly mother'")


class ChatResponseSchema(BaseModel):
    """Rich assistant reply with optional quick-reply suggestions and memory updates."""
    text: str = Field(description="The response from the assistant")
    suggestions: list[str] | None = Field(None, description="Quick-reply suggestions if the response is a question with discrete options")
    memory: MemoryUpdate | None = Field(None, description="Preferences clearly established this turn — null fields are ignored and do not overwrite prior values")


def _profile_hint(profile: dict) -> str:
    """Format a stored profile as a short block to append to prompt instructions."""
    if not profile:
        return ""
    lines = ["What you already know about this user:"]
    if profile.get("budget_inr"):
        flex = " (flexible)" if profile.get("budget_flexible") else " (firm)"
        lines.append(f"- Budget: ₹{profile['budget_inr']:,}{flex}")
    if profile.get("feature_priorities"):
        lines.append(f"- Priorities: {', '.join(profile['feature_priorities'])}")
    if profile.get("os_preference"):
        lines.append(f"- OS: {profile['os_preference']}")
    if profile.get("brands_preferred"):
        lines.append(f"- Brand preferences: {', '.join(profile['brands_preferred'])}")
    if profile.get("context"):
        lines.append(f"- Context: {profile['context']}")
    return "\n".join(lines)


def summarize(query, products, hint=""):
    """Generate a grounded assistant summary for the retrieved products."""
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
    input_text = f"Query: {query}\n\nPhones:\n{json.dumps(context, indent=2)}"
    instructions = f"{PROMPT_SUMMARY}\n\n{hint}" if hint else PROMPT_SUMMARY
    return llmfn(instructions=instructions, input=input_text)


def search(query, filters):
    """Run the contextual search pipeline, personalised with the stored profile."""
    profile = mem.load()
    hint = _profile_hint(profile)
    instructions = f"{PROMPT}\n\n{hint}" if hint else PROMPT

    response = llmfn(instructions=instructions, input=query, output_schema=Schema)
    products = search_semantic(response.query)
    result = apply_filters(products, filters)
    result = apply_filters(result.products, response.filters)
    if result.products:
        result.summary = summarize(query, result.products, hint)
    return result


def chat(session, message):
    """Answer a follow-up, ask a narrowing question, and update the stored profile."""
    profile = mem.load()
    hint = _profile_hint(profile)
    instructions = f"{PROMPT_CHAT}\n\n{hint}" if hint else PROMPT_CHAT

    past_messages = session.get_messages()
    response = llmfn(instructions=instructions, input=past_messages, output_schema=ChatResponseSchema)

    if response.memory:
        mem.merge(response.memory.model_dump(exclude_none=True))

    return {"text": response.text, "suggestions": response.suggestions}


if __name__ == "__main__":
    app.search = search
    app.chat = chat
    app.run()
