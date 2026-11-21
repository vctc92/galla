# Galla — project guide

Voice bahi-khata (credit ledger) for Indian kirana shops. Hackathon MVP for **PS11 "Voice AI for Bharat"**: the shopkeeper speaks Hinglish/Tanglish → Agora ConvoAI → our tool-calling LLM endpoint → ledger/stock/Telegram actions → Murf Falcon speaks the reply. Product spec: README.md. Operations: RUNBOOK.md.

## Locked decisions: ask the user before changing any of these
- **Backend:** Python 3.11 + FastAPI. `httpx` for outbound HTTP. SQLite via stdlib `sqlite3`, **no ORM**.
- **LLM:** official `openai` SDK against an OpenAI-compatible endpoint (default OpenAI `gpt-4.1-mini`). The tool loop is hand-written in `backend/llm_proxy.py`. **No LangChain, LangGraph, LlamaIndex, CrewAI or other agent frameworks.**
- **Voice:** Agora Conversational AI (ASR `ares` or `sarvam`) calls our `/llm/{lang}/chat/completions` (SSE), and TTS is **Murf Falcon**. PS11 requires Agora + Murf; never swap them out.
- **Notifications:** Telegram Bot API via raw httpx, no bot library. Payments are a sandbox page plus a `upi://` link.
- **Frontend:** React 19 + Vite + Tailwind v4 + **Motion** (`import { motion } from 'motion/react'`) + lucide-react. Plain **JavaScript/JSX (no TypeScript)**. No router library (path switch in `web/src/App.jsx`), no state library, no component kit.
- **Single origin:** FastAPI serves `web/dist`. ngrok exposes port 8000 for Agora and the phones.
- **Scheduler:** asyncio loop in `backend/scheduler.py`. No Celery, Redis or APScheduler.
- **New dependencies** (pip or npm) need the user's OK.

## Where things live
| Concern | File |
|---|---|
| Env/config (only place that reads env) | `backend/config.py` |
| Schema, seed data, `db.q/one/ex`, `log_activity`, `balance` | `backend/db.py` |
| Alias resolution + RAG context (arisi/chawal → Rice) | `backend/catalog.py` |
| Tool implementations + `REGISTRY` | `backend/tools.py` |
| System prompt, tool JSON schemas, greetings | `backend/prompts.py` |
| Streaming tool loop, Agora SSE wrapper, text-chat sessions | `backend/llm_proxy.py` |
| Agora agent join/leave, RTC tokens, ASR/TTS vendor config | `backend/agent.py` |
| Telegram send + hi/ta/en message templates | `backend/notify.py` |
| Murf HTTP TTS (browser-voice fallback only) | `backend/tts.py` |
| Routes, `/api/state`, pay endpoints, SPA fallback | `backend/main.py` |
| Screens | `web/src/pages/{ShopApp,Dashboard,Pay,Home}.jsx` |
| Voice engines | `web/src/lib/agoraVoice.js` (primary), `web/src/lib/browserVoice.js` (fallback) |
| Theme tokens | `web/src/index.css` `@theme` (canvas, surface, line, ink, muted, subtle, brand-*, ok, warn, bad) |

## Conventions
- **Tools** return a dict with `ok: bool`. They never raise into the loop. "Not found" returns suggestions so the LLM can ask one short question.
- **Every user-visible action calls `db.log_activity(text, kind)`**, because the dashboard and the app's action cards are driven by it. Kinds: `credit | payment | reminder | stock | alert | system`. Keep them in sync with `web/src/components/kinds.js`.
- **Voice replies:** 1–2 spoken sentences, no symbols or markdown. Tool arguments use Roman script. Language/script rules live in `prompts.py` (`REPLY_SCRIPT`).
- **Customer-facing messages** are deterministic templates in `notify.TEMPLATES` (hi/ta/en), never LLM-generated.
- **Missing keys degrade gracefully** (Telegram dry-run, "Setup pending" banner). Never crash the demo.
- **Money:** rupees as float. Format with `notify._inr` (backend) and `web/src/lib/format.js` `inr` (frontend); both use Indian digit grouping.
- **Demo numbers are load-bearing.** The seed in `db.py` gives Murugan an opening balance of 950, Rice ₹60/kg, and Surf ₹110 with stock 3 and threshold 5. The demo script relies on "₹230 added, ₹1,180 due, Surf 2 left". If you change the seed, update README.md and `scripts/smoke_offline.sh`.
- **Frontend design:** light, minimal, professional. White cards on a pale canvas, ONE accent (brand blue), semantic colours only for status (ok/warn/bad). No dark theme, glow, glassmorphism, gradient text or neon. Background = `GroceryBackdrop` (slow-drifting kirana line icons, masked centre). Use theme tokens, not raw hex. Animate with Motion (springs, `AnimatePresence`, `layout`). Read data through `useLiveState()` (polls `/api/state` every second). `/app` and `/pay` are mobile-first; `/dashboard` targets a 1600px projector. The Agora SDK is lazy-imported only in ShopApp.
- **Secrets:** never commit or print `.env`. Check key presence with `config.status()`.

## Commands
```bash
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000   # backend + built UI
cd web && npm run dev                                           # UI hot reload on :5173
cd web && npm run build                                         # required before serving UI changes
./scripts/smoke_offline.sh                                      # offline E2E check, no keys needed
```

## Before saying a change is done
- Backend change: `./scripts/smoke_offline.sh` must pass (it uses a temp DB, a fake LLM and Telegram dry-run).
- UI change: `npm run build`, then screenshot the affected page (see the `galla-ui` skill).
- New tool: follow the `galla-add-tool` skill.
- Vendor or config change for Agora, Murf or ASR: follow the `galla-voice-stack` skill. It holds the verified API shapes; don't guess them.
