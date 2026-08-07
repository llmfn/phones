from . import config, trace
from openai import OpenAI
import functools
import json

from pydantic import BaseModel

@functools.cache
def get_openai_client():
    settings = config.get_settings()
    return OpenAI(api_key=settings.openai_api_key)

def llmfn(instructions, input, output_schema=None, tools=None, label=""):
    """Utility to interact with the llm model.

    ``label`` is the plain-language purpose the trace panel shows for this
    call: two ``llmfn`` calls in one pipeline both read "llm call" otherwise,
    so a layer that rewrites and then summarizes should say which is which.

    The step this records is the request as the provider received it and the
    response as it came back, rather than this function's own arguments -- so
    the panel shows a student the payload their code produced, not a rendering
    of the call they already wrote.
    """
    settings = config.get_settings()
    client = get_openai_client()
    tool_defs, tool_models = _prepare_tools(tools)

    request = _build_request(
        model=settings.openai_model,
        instructions=instructions,
        input=input,
        output_schema=output_schema,
        tool_defs=tool_defs,
    )
    step_input = {"model": settings.openai_model, "request": _traceable(request, output_schema)}
    # Where anything the layer marked (see ``trace.highlight``) ended up in the
    # instructions it built -- ranges over the string as sent, so the panel
    # points at the memory folded into a prompt without taking the prompt apart.
    marks = trace.marks_in(instructions) if isinstance(instructions, str) else []
    if marks:
        step_input["highlights"] = marks

    with trace.new_step(name="llmfn", input=step_input, label=label) as step:
        response = _send(client, request)

        for _ in range(3):
            tool_calls = _get_tool_calls(response)
            if not tool_calls:
                step.set_output(_step_output(response, output_schema))
                return response.output_parsed if output_schema else response.output_text

            outputs = [_run_tool_call(call, tool_models) for call in tool_calls]
            request = _build_request(
                model=settings.openai_model,
                input=outputs,
                output_schema=output_schema,
                tool_defs=tool_defs,
                previous_response_id=response.id,
            )
            response = _send(client, request)

        raise RuntimeError("LLM exceeded the maximum number of tool-call rounds")


def _traceable(request, output_schema):
    """The request as the trace records it.

    Identical to what is sent but for ``text_format``: the SDK is handed the
    schema class and expands it on the way out, and a class name is the one
    thing in the request a reader cannot act on -- "Schema" says a schema was
    used without saying what was asked for. The expansion is what the provider
    is actually given, and it carries the field descriptions the layer wrote,
    so it belongs in the panel.
    """
    traced = trace.jsonable(request)
    if output_schema:
        traced["text_format"] = output_schema.model_json_schema()
    return traced


def _step_output(response, output_schema):
    """What the trace records of a finished response.

    ``text`` and ``parsed`` are what the panel renders literally, so neither is
    a JSON string holding another one; ``response`` is the whole object as it
    came back, which is what the raw tab shows and what a later tool-call view
    reads its rounds out of.
    """
    parsed = response.output_parsed if output_schema else None
    return {
        "text": getattr(response, "output_text", None),
        "parsed": trace.jsonable(parsed),
        "response_id": getattr(response, "id", None),
        "response": trace.jsonable(response),
    }


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


def _build_request(
    model,
    input,
    output_schema=None,
    instructions=None,
    tool_defs=None,
    previous_response_id=None,
):
    """The keyword arguments for one call to the responses API.

    Built rather than passed straight through so the trace can record the
    request itself -- what the provider is asked for -- instead of the
    arguments ``llmfn`` happened to be called with.
    """
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
        kwargs["text_format"] = output_schema
    return kwargs


def _send(client, request):
    """Run one built request. ``text_format`` is what makes it a parse call."""
    if "text_format" in request:
        return client.responses.parse(**request)
    return client.responses.create(**request)


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
