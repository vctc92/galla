---
name: galla-run
description: Start, configure and verify the Galla stack (env, ngrok, FastAPI backend, React UI) and check each integration (OpenAI, Murf, Telegram, Agora). Use when asked to run, start, launch, demo, smoke-test, debug setup, or confirm Galla works end to end.
---

# Run and verify Galla

The full human runbook is `RUNBOOK.md` at the repo root. Follow it. Rules for doing it as an agent:

1. **Check config without printing secrets:**
   `.venv/bin/python -c "from backend import config; import json; print(json.dumps(config.status(), indent=2))"`
   Never `cat .env` or echo key values. Report only which integrations are true/false.
2. **Always run the offline check first:** `./scripts/smoke_offline.sh` (expect `11/11 checks passed`). It uses a temp DB, ports 8198/8199, a fake LLM, and Telegram dry-run, so it is safe while the real backend is running.
3. **Start long-running services in the background** (`run_in_background`), never in the foreground:
   - backend: `.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000`
   - tunnel: `ngrok http 8000`, then put the https URL into `PUBLIC_URL` (RUNBOOK step 2) and restart the backend.
   Config is read once at startup, so **any `.env` change needs a backend restart**. Exported shell vars override `.env`.
4. **Don't damage demo data.** For experiments, use `DB_PATH=<scratch path>` and another port. Only call `POST /api/reset` when the user wants a clean demo state.
5. **Live checks** (RUNBOOK section 5 a–f) cost real API credit and send real Telegram messages. Run them only when the user asks for live verification, and say which ones you ran.
6. **UI must be built** (`cd web && npm run build`) for `:8000/app` to show the latest frontend.

## Interpreting failures
- `/agent/start` 400: read the `detail`. It names the missing env keys or a non-https `PUBLIC_URL`.
- Agent joins but stays silent: Agora isn't reaching `/llm`. Check `http://127.0.0.1:4040` (ngrok inspector) and the backend log for `POST /llm/...`.
- Reminder `dry_run: true`: `TELEGRAM_BOT_TOKEN` or the chat ID is missing.
- `/api/tts` 502: Murf key or voice ID. Valid IDs are in the `galla-voice-stack` skill.
