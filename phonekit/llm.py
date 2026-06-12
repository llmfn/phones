from . import config
from openai import OpenAI
import functools

@functools.cache
def get_openai_client():
    settings = config.get_settings()
    return OpenAI(api_key=settings.openai_api_key)
    
def llmfn(instructions, input):
    settings = config.get_settings()
    client = get_openai_client()
    response = client.responses.create(
        model=settings.openai_model,
        instructions=instructions,
        input=input)
    return response.output_text
