from . import config, trace
from openai import OpenAI
import functools
import json

from pydantic import BaseModel

@functools.cache
def get_openai_client():
    settings = config.get_settings()
    return OpenAI(api_key=settings.openai_api_key)

@trace.trace_function
def llmfn(instructions, input, output_schema=None, tools=None):
    """Utility to interact with the llm model.
    """
    settings = config.get_settings()
    client = get_openai_client()
    tool_defs, tool_models = _prepare_tools(tools)

    response = _create_response(
        client=client,
        model=settings.openai_model,
        instructions=instructions,
        input=input,
        output_schema=output_schema,
        tool_defs=tool_defs,
    )

    for _ in range(3):
        tool_calls = _get_tool_calls(response)
        if not tool_calls:
            return response.output_parsed if output_schema else response.output_text

        outputs = [_run_tool_call(call, tool_models) for call in tool_calls]
        response = _create_response(
            client=client,
            model=settings.openai_model,
            input=outputs,
            output_schema=output_schema,
            tool_defs=tool_defs,
            previous_response_id=response.id,
        )

    raise RuntimeError("LLM exceeded the maximum number of tool-call rounds")


def _prepare_tools(tools):
    if not tools:
        return None, {}

    tool_defs = []
    tool_models = {}
    for tool in tools:
        if not isinstance(tool, type) or not issubclass(tool, BaseModel):
            raise TypeError("llmfn tools must be Pydantic BaseModel classes")
        schema = tool.model_json_schema()
        schema.setdefault("additionalProperties", False)
        tool_defs.append(
            {
                "type": "function",
                "name": tool.__name__,
                "description": (tool.__doc__ or "").strip() or None,
                "parameters": schema,
                "strict": True,
            }
        )
        tool_models[tool.__name__] = tool
    return tool_defs, tool_models


def _create_response(
    client,
    model,
    input,
    output_schema=None,
    instructions=None,
    tool_defs=None,
    previous_response_id=None,
):
    kwargs = {
        "model": model,
        "input": input,
    }
    if instructions is not None:
        kwargs["instructions"] = instructions
    if tool_defs:
        kwargs["tools"] = tool_defs
        kwargs["parallel_tool_calls"] = False
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id

    if output_schema:
        return client.responses.parse(text_format=output_schema, **kwargs)
    return client.responses.create(**kwargs)


def _get_tool_calls(response):
    return [item for item in response.output if _get(item, "type") == "function_call"]


def _run_tool_call(call, tool_models):
    name = _get(call, "name")
    arguments = _get(call, "arguments") or "{}"
    call_id = _get(call, "call_id")
    tool_model = tool_models[name]
    parsed_arguments = json.loads(arguments) if isinstance(arguments, str) else arguments

    try:
        instance = tool_model.model_validate(parsed_arguments)
        result = instance.run() if hasattr(instance, "run") else instance.model_dump()
    except Exception as exc:
        trace.add_step(
            name="tool_call",
            input={"tool": name, "arguments": parsed_arguments},
            output={"error": str(exc)},
            status="error",
        )
        raise

    trace.add_step(
        name="tool_call",
        input={"tool": name, "arguments": parsed_arguments},
        output={"result": result},
    )
    return {
        "type": "function_call_output",
        "call_id": call_id,
        "output": json.dumps(result),
    }


def _get(value, key):
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key)
