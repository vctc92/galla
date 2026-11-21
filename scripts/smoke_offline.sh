#!/usr/bin/env bash
# Offline end-to-end smoke test. No API keys, no network, doesn't touch galla.db or send Telegram.
# Starts a fake LLM (:8199) + backend (:8198) on a temp DB and checks the full udhaar -> reminder -> pay -> follow-up loop.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
cleanup() { kill $(jobs -p) 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "== tool edge cases =="
.venv/bin/python scripts/test_tools.py 2>&1 | grep -v "dry-run"
echo "== end-to-end =="

.venv/bin/uvicorn --app-dir scripts fake_openai:app --port 8199 --log-level warning &
DB_PATH="$TMP/smoke.db" OPENAI_API_KEY=fake LLM_BASE_URL=http://127.0.0.1:8199/v1 LLM_PROXY_SECRET=smoke \
TELEGRAM_BOT_TOKEN= PUBLIC_URL=http://localhost:8198 FOLLOWUP_DELAY_SECONDS=2 MAX_FOLLOWUPS=1 \
  .venv/bin/uvicorn backend.main:app --port 8198 --log-level warning > "$TMP/backend.log" 2>&1 &

for _ in $(seq 1 40); do curl -sf localhost:8198/api/health >/dev/null && break; sleep 0.25; done

.venv/bin/python - <<'PY'
import time, httpx
B = "http://localhost:8198"
c = httpx.Client(base_url=B, timeout=20)
ok = lambda cond, msg: print(("PASS " if cond else "FAIL ") + msg) or cond
results = []

results.append(ok(c.get("/api/health").json()["ok"], "health"))

sse = c.post("/llm/ta/chat/completions", headers={"Authorization": "Bearer smoke"},
             json={"messages": [{"role": "user", "content": "Murugan anna rendu kilo arisi oru Surf vaanginaar"}], "stream": True}).text
results.append(ok("data: [DONE]" in sse and "chat.completion.chunk" in sse, "Agora SSE endpoint streams OpenAI chunks"))
results.append(ok(c.post("/llm/ta/chat/completions", headers={"Authorization": "Bearer wrong"}, json={"messages": []}).status_code == 401, "bad LLM key rejected"))

s = c.get("/api/state").json()
mur = next(x for x in s["customers"] if x["name"] == "Murugan")
surf = next(p for p in s["products"] if p["name"] == "Surf Excel")
results.append(ok(mur["balance"] == 1180 and surf["stock"] == 2, f"add_credit: Murugan 1180 (got {mur['balance']}), Surf stock 2 (got {surf['stock']})"))

r = c.post("/api/chat", json={"message": "Murugan ku reminder anuppu", "lang": "ta"}).json()
a = r["actions"][0]
results.append(ok(a["tool"] == "send_payment_reminder" and a["result"]["ok"] and a["result"]["dry_run"], "reminder tool (Telegram dry-run)"))
rid = a["result"]["pay_link"].rsplit("/", 1)[-1]

info = c.get(f"/api/pay/{rid}").json()
results.append(ok(info["amount"] == 1180 and info["language"] == "ta", "pay page data"))
conf = c.post(f"/api/pay/{rid}/confirm").json()
results.append(ok(conf["new_balance"] == 0, "pay confirm clears balance"))
mur = next(x for x in c.get("/api/state").json()["customers"] if x["name"] == "Murugan")
results.append(ok(mur["status"] == "paid", "ledger status -> paid"))

c.post("/api/chat", json={"message": "Ramesh ko reminder bhejo", "lang": "hi"})
time.sleep(6)
acts = [x["text"] for x in c.get("/api/state").json()["activity"]]
results.append(ok(any("Auto follow-up sent to Ramesh" in t for t in acts), "scheduler auto follow-up"))

summ = c.post("/api/chat", json={"message": "Aaj ka hisaab batao", "lang": "hi"}).json()["actions"][0]
results.append(ok(summ["tool"] == "daily_summary" and summ["result"]["recovered"] == 1180, "daily_summary numbers"))

html = c.get("/app")
results.append(ok(html.status_code == 200 and "<div id=\"root\">" in html.text, "SPA served at /app (needs web/dist build)"))

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
PY
