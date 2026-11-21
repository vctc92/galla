"""Agora Conversational AI agent lifecycle + RTC tokens.

ASR / LLM / TTS vendor settings are all built in `_join_body()` — change vendors there.
Docs: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/join
"""
import base64
import logging
import random
import time

import httpx
from agora_token_builder import RtcTokenBuilder

from . import config, db, prompts

log = logging.getLogger("galla.agent")
AGENT_UID = 1001
_active: dict = {}  # {"agent_id", "channel", "lang"}


def rtc_token(channel: str, uid: int, ttl: int = 3600) -> str:
    if not config.AGORA_APP_CERT:
        return ""  # project in testing mode (App ID only)
    return RtcTokenBuilder.buildTokenWithUid(config.AGORA_APP_ID, config.AGORA_APP_CERT, channel, uid, 1, int(time.time()) + ttl)


def _auth() -> str:
    raw = f"{config.AGORA_CUSTOMER_ID}:{config.AGORA_CUSTOMER_SECRET}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _asr(lang: str) -> dict:
    bcp = config.LANGS[lang]["bcp47"]
    if config.ASR_VENDOR == "sarvam":
        return {"vendor": "sarvam", "language": bcp, "params": {"api_key": config.SARVAM_API_KEY, "language": bcp}}
    # ARES keywords bias recognition towards our customer + product vocabulary
    words: list[str] = []
    for row in db.customers() + db.products():
        words += [row["name"]] + [a.strip() for a in row["aliases"].split(",") if a.strip().isascii()]
    return {"vendor": "ares", "language": bcp, "keywords": list(dict.fromkeys(words))[:128]}


def _tts(lang: str) -> dict:
    return {"vendor": "murf", "params": {
        "api_key": config.MURF_API_KEY, "base_url": config.MURF_WS_URL, "voiceId": config.MURF_VOICES[lang],
        "locale": config.LANGS[lang]["bcp47"], "rate": 0, "pitch": 0, "model": config.MURF_MODEL, "sample_rate": 24000,
    }}


def _join_body(channel: str, user_uid: int, lang: str) -> dict:
    return {
        "name": f"galla-{channel}",
        "properties": {
            "channel": channel,
            "token": rtc_token(channel, AGENT_UID),
            "agent_rtc_uid": str(AGENT_UID),
            "remote_rtc_uids": [str(user_uid)],
            "enable_string_uid": False,
            "idle_timeout": 60,
            "llm": {
                "url": f"{config.PUBLIC_URL}/llm/{lang}/chat/completions",
                "api_key": config.LLM_PROXY_SECRET,
                "system_messages": [{"role": "system", "content": "You are Galla, a kirana shop assistant."}],
                "greeting_message": prompts.GREETINGS[lang],
                "failure_message": prompts.FAILURE[lang],
                "max_history": 16,
                "params": {"model": config.LLM_MODEL},
            },
            "asr": _asr(lang),
            "tts": _tts(lang),
        },
    }


async def start(lang: str) -> dict:
    if lang not in config.LANGS:
        lang = "hi"
    missing = [k for k, v in {"AGORA_APP_ID": config.AGORA_APP_ID, "AGORA_CUSTOMER_ID": config.AGORA_CUSTOMER_ID,
                              "AGORA_CUSTOMER_SECRET": config.AGORA_CUSTOMER_SECRET, "MURF_API_KEY": config.MURF_API_KEY,
                              "OPENAI_API_KEY": config.LLM_API_KEY}.items() if not v]
    if missing:
        raise RuntimeError(f"Missing in .env: {', '.join(missing)}")
    if not config.PUBLIC_URL.startswith("https://"):
        raise RuntimeError("PUBLIC_URL must be your public https ngrok URL so Agora can reach /llm")
    await stop()
    channel = f"galla-{lang}-{random.randint(10000, 99999)}"
    user_uid = random.randint(2000, 9999)
    body = _join_body(channel, user_uid, lang)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{config.AGORA_API_BASE}/projects/{config.AGORA_APP_ID}/join", json=body,
                              headers={"Authorization": _auth()})
    if r.status_code >= 300:
        log.error("Agora join failed %s: %s", r.status_code, r.text)
        raise RuntimeError(f"Agora join failed ({r.status_code}): {r.text[:300]}")
    agent_id = r.json().get("agent_id")
    _active.update({"agent_id": agent_id, "channel": channel, "lang": lang})
    db.log_activity(f"Voice session started ({config.LANGS[lang]['label']})", "system")
    return {"appId": config.AGORA_APP_ID, "channel": channel, "token": rtc_token(channel, user_uid) or None,
            "uid": user_uid, "agentUid": AGENT_UID, "agentId": agent_id, "lang": lang}


async def stop() -> dict:
    agent_id = _active.pop("agent_id", None)
    _active.clear()
    if not agent_id:
        return {"stopped": False}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"{config.AGORA_API_BASE}/projects/{config.AGORA_APP_ID}/agents/{agent_id}/leave",
                              headers={"Authorization": _auth()})
    log.info("Agora leave %s: %s", r.status_code, r.text[:200])
    return {"stopped": r.status_code < 300}
