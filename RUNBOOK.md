# Galla Runbook — configure, run, verify

All commands from the repo root (`cd ~/Developer/hackathon/galla`). Terminals: **T1** ngrok · **T2** backend · **T3** UI dev (optional) · **T4** checks.

## 0. One-time setup
```bash
uv venv --python 3.11 .venv
uv pip install -r requirements.txt --python .venv/bin/python
cd web && npm install && npm run build && cd ..
brew install ngrok && ngrok config add-authtoken <YOUR_NGROK_TOKEN>
cp -n .env.example .env        # then fill in keys
```

## 1. Environment
The backend loads `.env` itself. Source it only so your own shell commands can use the values (`$PUBLIC_URL`, `$TELEGRAM_BOT_TOKEN`):
```bash
set -a; source .env; set +a
```
- Values containing spaces must be quoted in `.env` (e.g. `SHOP_NAME="Lakshmi Kirana Store"`).
- ⚠️ Exported shell vars **override** `.env`. After editing `.env`, re-source it in every terminal and **restart the backend** (config is read once at startup).

**Verify keys are loaded:**
```bash
.venv/bin/python -c "from backend import config; import json; print(json.dumps(config.status(), indent=2))"
```
Everything `true` except `public_url_https` (fixed in step 2).

## 2. T1 — ngrok
```bash
ngrok http 8000          # stable free domain: ngrok http --url=<name>.ngrok-free.app 8000
```
Write the https URL into `.env` (from T4):
```bash
URL=$(curl -s localhost:4040/api/tunnels | python3 -c "import sys,json;print([t['public_url'] for t in json.load(sys.stdin)['tunnels'] if t['public_url'].startswith('https')][0])")
sed -i '' "s|^PUBLIC_URL=.*|PUBLIC_URL=$URL|" .env && grep PUBLIC_URL .env
set -a; source .env; set +a
```
The free random URL changes on every ngrok restart. Redo this and restart the backend each time.

## 3. T2 — backend (also serves the built UI)
```bash
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
✅ Log shows `Galla up. PUBLIC_URL=https://… integrations={…}`
```bash
curl -s localhost:8000/api/health | python3 -m json.tool      # local
curl -s $PUBLIC_URL/api/health | python3 -m json.tool         # via tunnel
```

## 4. T3 — UI dev mode (optional)
```bash
cd web && npm run dev     # http://localhost:5173, hot reload, proxies API to :8000
```
For the demo use `$PUBLIC_URL`. After UI changes run `npm run build` so the backend serves them.

## 5. T4 — verify

**0) Offline smoke test (no keys, no network, safe anytime)**
```bash
./scripts/smoke_offline.sh      # expect: 11/11 checks passed
```

**a) OpenAI + tool calling**
```bash
curl -s -X POST localhost:8000/api/chat -H 'content-type: application/json' \
  -d '{"message":"Ramesh ne do kilo chawal liya, udhaar mein likh do","lang":"hi"}' | python3 -m json.tool
```
✅ `actions[0].tool = "add_credit"`, `result.ok = true`, `total = 120`, Hindi `reply`.

**b) Agora-facing LLM endpoint, through the tunnel**
```bash
curl -N -X POST $PUBLIC_URL/llm/ta/chat/completions -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Murugan ku evvalavu baaki?"}],"stream":true}'
```
✅ `data: {...}` chunks with Tamil text, ending `data: [DONE]`.

**c) Murf TTS**
```bash
curl -s -X POST localhost:8000/api/tts -H 'content-type: application/json' \
  -d '{"text":"வணக்கம்! Galla ready.","lang":"ta"}' -o /tmp/galla.mp3 && afplay /tmp/galla.mp3
```
✅ Tamil voice plays. A 502 means a bad key or voice ID.

**d) Telegram.** Send `/start` to the bot from both phones, then list the chat IDs:
```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | python3 -c \
"import sys,json;[print(u['message']['chat']['id'],u['message']['from'].get('first_name')) for u in json.load(sys.stdin)['result'] if 'message' in u]"
```
Put them in `TG_CHAT_SHOPKEEPER` / `TG_CHAT_CUSTOMER`, restart the backend, then:
```bash
curl -s -X POST localhost:8000/api/chat -H 'content-type: application/json' \
  -d '{"message":"Murugan ku reminder anuppu","lang":"ta"}' | python3 -m json.tool
```
✅ `delivered: true` and phone 2 buzzes. `dry_run: true` means the token or chat ID is missing.

**e) Pay + follow-up loop**
- Tap the pay link on phone 2 → **Pay** → ✅ dashboard celebration, Murugan turns green, the shopkeeper phone gets "Payment received".
- Send another reminder and don't pay → ✅ after 60 s, "Auto follow-up sent" appears in the activity feed.

**f) Agora voice, full loop**
Open `$PUBLIC_URL/app` on phone 1, set Engine to **Agora ConvoAI**, and tap the mic.
✅ Greeting plays → when you speak, the backend log shows `POST /llm/hi/chat/completions` and `tool add_credit(...)` → the dashboard updates.
Start/stop without a phone:
```bash
curl -s -X POST localhost:8000/agent/start -H 'content-type: application/json' -d '{"lang":"hi"}'   # expect agentId
curl -s -X POST localhost:8000/agent/stop
```

## 6. Before stage
```bash
curl -s -X POST localhost:8000/api/reset       # or "reset demo" in the dashboard footer
```
Dashboard on the projector laptop: `$PUBLIC_URL/dashboard`. On each phone, open `$PUBLIC_URL` once beforehand to click through ngrok's "Visit Site" warning.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Setup pending" banner in the app | Key missing in `.env` → fix → restart the backend |
| `/agent/start` 400 "PUBLIC_URL must be https" | Do step 2, restart the backend |
| Agora join 401/403 | Customer ID/Secret wrong, or Conversational AI not enabled for the project |
| Agent joins but stays silent | `/llm` isn't being hit. Check the ngrok inspector at http://127.0.0.1:4040 and that `PUBLIC_URL` is current |
| Tamil misheard | `ASR_VENDOR=sarvam` + `SARVAM_API_KEY`, restart |
| Phone mic blocked | Must use the `https://` ngrok URL |
| UI change not visible | `cd web && npm run build` |
| Agora dies mid-demo | `/app` → Engine → **Browser voice** (Chrome) |

The API has no auth. Share the ngrok URL only with the team during the demo.
