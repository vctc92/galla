---
name: galla-voice-stack
description: Verified reference for Galla's voice pipeline: Agora Conversational AI join/leave API, ASR vendors and language codes, Murf Falcon TTS params and Hindi/Tamil voice IDs, the custom-LLM SSE contract, and the OpenAI config. Use before changing backend/agent.py, backend/tts.py, backend/llm_proxy.py streaming, voices, languages, or any ASR/TTS/LLM vendor setting.
---

# Galla voice stack: verified facts (checked against vendor docs, Nov 2026)

Don't guess API shapes. If something here seems outdated, re-check the doc URL and then update this file.

## Agora Conversational AI (REST v2)
- Docs: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/join
- Join: `POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}/join` with header `Authorization: Basic base64(customer_id:customer_secret)`. The response contains `agent_id`.
- Leave: `POST …/projects/{appid}/agents/{agent_id}/leave`
- Body: `{name (unique), properties: {channel, token, agent_rtc_uid (string), remote_rtc_uids: [string] (only 1 supported), enable_string_uid, idle_timeout, llm, asr, tts}}`. Built in `backend/agent.py::_join_body`.
- `llm`: `{url, api_key, system_messages, greeting_message, failure_message, max_history, params: {model}}`. Agora sends `api_key` to our URL as `Authorization: Bearer <api_key>`; we set it to `LLM_PROXY_SECRET`. Optional `vendor: "custom"` adds `turn_id`/`timestamp` to messages, which our proxy ignores.
- Token: `agora_token_builder.RtcTokenBuilder.buildTokenWithUid(app_id, cert, channel, uid, 1, expire_ts)`. Agent and user each get their own token. With no App Certificate (testing mode) the token is empty/null.

## ASR
- `ares` (Agora built-in, default): `{"vendor":"ares","language":"hi-IN","keywords":[≤128 terms]}`. Keywords are allowed only with ares. We feed customer names and ASCII product aliases. **Tamil (`ta-IN`) support in ARES was not confirmed in the docs; test it live.**
- `sarvam` (Indian languages, code-mixed): `{"vendor":"sarvam","language":"hi-IN","params":{"api_key":…, "language":"hi-IN"|"ta-IN"|"unknown"}}`. Docs: https://docs.agora.io/en/ai/models/asr/sarvam
- Others Agora accepts: microsoft, deepgram, openai, google, gemini, amazon, assemblyai, smallestai, xai.

## Murf Falcon TTS
- Inside Agora (docs: https://docs.agora.io/en/ai/models/tts/murf):
  `{"vendor":"murf","params":{"api_key","base_url":"wss://global.api.murf.ai/v1/speech/stream-input","voiceId","locale","rate":0,"pitch":0,"model":"FALCON","sample_rate":24000}}`
- Direct HTTP (browser fallback, `backend/tts.py`): `POST https://global.api.murf.ai/v1/speech/stream` with header `api-key: <key>` and body `{text, voiceId, model, locale, format:"MP3", sampleRate:24000}`. India region: `https://in.api.murf.ai/v1/speech/stream`. Model ids `falcon-2.1`, `FALCON`, `falcon-2` all map to Falcon 2.1.
- Falcon voice IDs: **Hindi** `hi-IN-aman`, `hi-IN-karan` (default), `hi-IN-khyati`, `hi-IN-namrita`, `hi-IN-sunaina`. **Tamil** `ta-IN-abirami`, `ta-IN-dinesh`, `ta-IN-iniya` (default), `ta-IN-murali`, `ta-IN-sarvesh`. Change them via `MURF_VOICE_HI` / `MURF_VOICE_TA` in `.env`.

## Our custom-LLM contract (`/llm/{lang}/chat/completions`)
- Agora POSTs an OpenAI chat-completions request (`messages`, `stream: true`) and expects **SSE** `data: {chat.completion.chunk}` lines ending with `data: [DONE]`.
- `llm_proxy.sse_stream` drops Agora's system message, injects our system prompt + RAG context, runs the tool loop, and streams only the spoken text. Tool calls never reach Agora.
- Language comes from the URL path (`/llm/hi/...`, `/llm/ta/...`), which `agent.start(lang)` sets.
- The URL must be **public https** (ngrok). Agora cloud can't reach localhost.

## LLM
- Official `openai` SDK, `AsyncOpenAI(base_url=LLM_BASE_URL)`, default `gpt-4.1-mini` (fast, reliable tool calling). Any OpenAI-compatible provider works through `.env` alone. Keep a fast non-reasoning model for voice latency.

## Adding a language (e.g. Telugu)
1. `config.LANGS` add `"te": {"label": "Telugu", "bcp47": "te-IN"}`, and add `MURF_VOICES["te"]` (look up a `te-IN-*` Falcon voice).
2. `prompts.LANG_STYLE`, `GREETINGS`, `FAILURE`: add `te`.
3. `notify.TEMPLATES`: add `te` for every message kind.
4. Frontend: `LANGS` in `web/src/lib/format.js`, `COPY` in ShopApp, `T` in Pay.
5. Confirm ASR support for the language (ARES vs Sarvam) before the demo.
