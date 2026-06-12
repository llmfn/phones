from . import config, trace
from openai import OpenAI
import functools

@functools.cache
def get_openai_client():
    settings = config.get_settings()
    return OpenAI(api_key=settings.openai_api_key)

@trace.trace_function
def llmfn(instructions, input, output_schema=None):
    """Utility to interact with the llm model.
    """
    settings = config.get_settings()
    client = get_openai_client()

    if not output_schema:
        response = client.responses.create(
            model=settings.openai_model,
            instructions=instructions,
            input=input)
        return response.output_text
    else:
        response = client.responses.parse(
            model=settings.openai_model,
            instructions=instructions,
            input=input,
            text_format=output_schema)
        return response.output_parsed

