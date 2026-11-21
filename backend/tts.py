"""Direct Murf Falcon TTS over HTTP — used only by the browser-voice fallback (Agora mode streams TTS itself)."""
import httpx

from . import config


async def synthesize(text: str, lang: str) -> bytes:
    """Returns MP3 bytes. Replies are 1-2 sentences, so buffering keeps error handling simple."""
    body = {"text": text, "voiceId": config.MURF_VOICES.get(lang, config.MURF_VOICES["hi"]), "model": config.MURF_MODEL,
            "locale": config.LANGS.get(lang, config.LANGS["hi"])["bcp47"], "format": "MP3", "sampleRate": 24000}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(config.MURF_HTTP_URL, json=body, headers={"api-key": config.MURF_API_KEY})
    if r.status_code >= 300:
        raise RuntimeError(f"Murf TTS failed ({r.status_code}): {r.text[:300]}")
    return r.content
