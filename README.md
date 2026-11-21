# Galla — Voice Bahi-Khata for Bharat's Kirana Shops

Shopkeepers run udhaar (credit), stock and payment follow-ups by **talking in Hinglish or Tanglish**.
Track: *Voice AI for Bharat* (PS11) · Agora Conversational AI + Murf Falcon TTS + OpenAI tool calling.

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, httpx, SQLite (stdlib), OpenAI SDK, agora-token-builder |
| Frontend | React 19 + Vite, Tailwind CSS v4, Motion (Framer Motion), lucide-react, agora-rtc-sdk-ng |
| Voice | Agora ConvoAI (ASR: ARES or Sarvam → our `/llm` tool loop → Murf Falcon TTS) |
| Notifications | Telegram Bot API |

## Run it

```bash
# 1. backend deps (once)
uv venv --python 3.11 .venv && uv pip install -r requirements.txt --python .venv/bin/python
# 2. frontend build (once, and after UI changes)
cd web && npm install && npm run build && cd ..
# 3. tunnel (Agora cloud must reach /llm; phones need HTTPS for the mic)
brew install ngrok && ngrok http 8000          # copy the https URL into PUBLIC_URL in .env
# 4. fill .env (copy of .env.example), then start
.venv/bin/uvicorn backend.main:app --port 8000
```

Open on the ngrok URL:
- `/app` → shopkeeper phone (tap mic)
- `/dashboard` → projector
- `/pay/<id>` → customer pay page (link arrives on Telegram)

**UI dev mode:** `cd web && npm run dev` → http://localhost:5173 (hot reload, proxies API to :8000).

## Keys (.env)

| Key | Where |
|---|---|
| `AGORA_APP_ID`, `AGORA_APP_CERT` | Agora Console → project (enable Conversational AI) |
| `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET` | Agora Console → RESTful API |
| `MURF_API_KEY` | Murf API dashboard. Voices default to `hi-IN-karan` / `ta-IN-iniya` |
| `OPENAI_API_KEY` | OpenAI. Model `LLM_MODEL=gpt-4.1-mini` (any OpenAI-compatible endpoint via `LLM_BASE_URL`) |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TG_CHAT_SHOPKEEPER`, `TG_CHAT_CUSTOMER` | Send `/start` to the bot from each phone, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id` |
| `PUBLIC_URL` | your `https://….ngrok-free.app` URL |

Missing keys never crash the app: Telegram runs in dry-run (logged in the activity feed) and the app shows a "Setup pending" banner.

## Demo script (3 min)

1. Dashboard on projector, `/app` on phone 1, Telegram open on phone 2. Click **reset demo** on the dashboard footer first.
2. हिंदी: *"Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein likh do"* → ledger + stock update live.
3. தமிழ்: *"Murugan anna rendu kilo arisi, oru Surf vaanginaar, kanakku la ezhudhu"* → ₹230 added, ₹1,180 due, Surf low → "order pannalama?"
4. *"Murugan ku reminder anuppu"* → phone 2 gets a Tamil Telegram message with a pay button; dashboard shows the follow-up countdown.
5. Tap **Pay** on phone 2 → dashboard celebration, Murugan turns green, shopkeeper gets a Telegram alert.
6. *"Aaj ka hisaab batao"* → spoken daily summary.

**Fallbacks:** if Agora fails on stage, switch *Engine → Browser voice* at the bottom of `/app` (Chrome speech recognition + same backend + Murf HTTP TTS). The sample-phrase chips and text box also send through the same tool loop.

## Where to change what

| Want to change… | File |
|---|---|
| Agent personality, reply language/script, tool descriptions | `backend/prompts.py` |
| Add/modify a tool (business action) | `backend/tools.py` (+ schema in `prompts.py`) |
| Products, customers, aliases (seed data) | `backend/db.py` → `SEED_*` (then **reset demo**) |
| Regional-name matching / RAG retrieval | `backend/catalog.py` |
| ASR / TTS / LLM vendor config for the Agora agent | `backend/agent.py` → `_asr`, `_tts`, `_join_body` |
| Telegram → WhatsApp, message templates per language | `backend/notify.py` |
| Follow-up timing | `.env` `FOLLOWUP_DELAY_SECONDS`, `MAX_FOLLOWUPS`; logic in `backend/scheduler.py` |
| LLM provider/model | `.env` `OPENAI_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |
| Romanised vs native-script replies | `.env` `REPLY_SCRIPT=latin|native` |
| Screens | `web/src/pages/ShopApp.jsx`, `Dashboard.jsx`, `Pay.jsx` |
| Colours / fonts | `web/src/index.css` (`@theme`) |

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/agent/start` `{lang}` | Start Agora ConvoAI agent, return RTC join info |
| POST | `/agent/stop` | Stop agent |
| POST | `/llm/{lang}/chat/completions` | OpenAI-compatible SSE endpoint Agora calls (tool loop inside) |
| POST | `/api/chat` `{message, lang}` | Same tool loop, JSON (text / browser-voice mode) |
| POST | `/api/tts` `{text, lang}` | Murf Falcon MP3 (browser-voice mode) |
| GET | `/api/state` | Ledger, stock, activity, conversation, numbers |
| GET/POST | `/api/pay/{id}` · `/api/pay/{id}/confirm` | Sandbox pay page data / mark paid |
| POST | `/api/reset` | Re-seed demo data |
