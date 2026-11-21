"""Fake OpenAI-compatible LLM for offline tests. Picks a tool by keyword, then streams a short reply.

Run: .venv/bin/uvicorn --app-dir scripts fake_openai:app --port 8199
"""
import json
import time

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()


def _chunk(delta: dict, finish=None) -> str:
    return "data: " + json.dumps({"id": "fake", "object": "chat.completion.chunk", "created": int(time.time()), "model": "fake",
                                  "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}) + "\n\n"


def _pick_tool(text: str) -> tuple[str, dict]:
    t = text.lower()
    who = "Ramesh" if "ramesh" in t else "Murugan"
    if "reminder" in t or "anuppu" in t or "bhejo" in t:
        return "send_payment_reminder", {"customer_name": who}
    if "order" in t:
        return "place_reorder", {"product_name": "eggs"}
    if "hisaab" in t or "kanakku sollu" in t or "summary" in t:
        return "daily_summary", {}
    if "baaki" in t or "balance" in t:
        return "check_balance", {"customer_name": who}
    return "add_credit", {"customer_name": who, "items": [{"name": "arisi", "qty": 2}, {"name": "surf", "qty": 1}]}


@app.post("/v1/chat/completions")
async def completions(req: Request):
    body = await req.json()
    last = body["messages"][-1]
    user = next(m["content"] for m in reversed(body["messages"]) if m["role"] == "user")

    async def gen():
        if last["role"] == "tool":
            for w in ["Sari, ", "done ", "pannitten."]:
                yield _chunk({"content": w})
            yield _chunk({}, "stop")
        else:
            name, args = _pick_tool(user)
            raw = json.dumps(args)
            yield _chunk({"role": "assistant", "tool_calls": [{"index": 0, "id": "call_1", "type": "function",
                                                               "function": {"name": name, "arguments": ""}}]})
            for i in range(0, len(raw), 12):  # split args like the real API does
                yield _chunk({"tool_calls": [{"index": 0, "function": {"arguments": raw[i:i + 12]}}]})
            yield _chunk({}, "tool_calls")
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
