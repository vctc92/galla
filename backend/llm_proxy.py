"""OpenAI-compatible tool-calling loop.

Agora ConvoAI calls POST /llm/{lang}/chat/completions with the conversation; we add the system prompt + RAG context,
run tools against the shop's data, and stream only the final spoken text back as SSE.
The same loop powers the text/browser-voice fallback (/api/chat).
"""
import json
import logging
import time
import uuid
from typing import AsyncIterator

from openai import AsyncOpenAI

from . import catalog, config, db, prompts, tools

log = logging.getLogger("galla.llm")
MAX_TOOL_ROUNDS = 5
_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=config.LLM_API_KEY or "missing", base_url=config.LLM_BASE_URL)
    return _client


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(p.get("text", "") for p in content if isinstance(p, dict))
    return ""


def build_messages(history: list[dict], lang: str) -> list[dict]:
    """Keep user/assistant turns from the caller, prepend our own system prompt + retrieved context."""
    convo = [{"role": m["role"], "content": _text(m.get("content"))}
             for m in history if m.get("role") in ("user", "assistant") and _text(m.get("content")).strip()]
    convo = convo[-12:]
    last_user = next((m["content"] for m in reversed(convo) if m["role"] == "user"), "")
    msgs = [{"role": "system", "content": prompts.system_prompt(lang)}]
    ctx = catalog.retrieve_context(last_user)
    if ctx:
        msgs.append({"role": "system", "content": "Retrieved facts for this turn:\n" + ctx})
    return msgs + convo


async def run_turn(history: list[dict], lang: str, source: str, actions: list | None = None) -> AsyncIterator[str]:
    """Yields reply text deltas. Executes tool calls in between. `actions` collects tool results for the caller."""
    actions = actions if actions is not None else []
    messages = build_messages(history, lang)
    user_text = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    if user_text:
        db.log_turn("user", user_text, lang, source)
    reply = ""
    t0 = time.time()
    for _ in range(MAX_TOOL_ROUNDS):
        stream = await client().chat.completions.create(
            model=config.LLM_MODEL, messages=messages, tools=prompts.TOOL_SCHEMAS,
            tool_choice="auto", temperature=0.3, stream=True,
        )
        calls: dict[int, dict] = {}
        content = ""
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                content += delta.content
                yield delta.content
            for tc in delta.tool_calls or []:
                c = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                c["id"] = tc.id or c["id"]
                if tc.function:
                    c["name"] += tc.function.name or ""
                    c["args"] += tc.function.arguments or ""
        reply += content
        if not calls:
            break
        ordered = [calls[i] for i in sorted(calls)]
        messages.append({"role": "assistant", "content": content or None, "tool_calls": [
            {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["args"] or "{}"}}
            for c in ordered]})
        for c in ordered:
            try:
                args = json.loads(c["args"] or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await tools.execute(c["name"], args)
            log.info("tool %s(%s) -> %s", c["name"], args, result)
            actions.append({"tool": c["name"], "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(result, ensure_ascii=False)})
        if content:
            yield " "
    log.info("turn done in %.2fs: %s", time.time() - t0, reply)
    if reply.strip():
        db.log_turn("assistant", reply.strip(), lang, source,
                    [{"tool": a["tool"], "ok": a["result"].get("ok")} for a in actions])


async def sse_stream(history: list[dict], lang: str) -> AsyncIterator[str]:
    """Wrap run_turn as OpenAI chat.completion.chunk SSE events for Agora."""
    cid = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())

    def chunk(delta: dict, finish=None) -> str:
        return "data: " + json.dumps({"id": cid, "object": "chat.completion.chunk", "created": created,
                                       "model": config.LLM_MODEL,
                                       "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]},
                                      ensure_ascii=False) + "\n\n"

    yield chunk({"role": "assistant", "content": ""})
    try:
        async for piece in run_turn(history, lang, "agora"):
            yield chunk({"content": piece})
    except Exception:
        log.exception("LLM turn failed")
        yield chunk({"content": prompts.FAILURE.get(lang, prompts.FAILURE["hi"])})
    yield chunk({}, "stop")
    yield "data: [DONE]\n\n"


# ---------- text / browser-voice sessions (fallback + testing) ----------
_sessions: dict[str, list[dict]] = {}


async def chat_once(session_id: str, message: str, lang: str) -> dict:
    hist = _sessions.setdefault(session_id, [])
    hist.append({"role": "user", "content": message})
    actions: list = []
    reply = "".join([p async for p in run_turn(hist, lang, "text", actions)]).strip()
    hist.append({"role": "assistant", "content": reply})
    del hist[:-16]
    return {"reply": reply, "actions": actions}


def reset_sessions() -> None:
    _sessions.clear()
