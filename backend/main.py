"""Galla backend: FastAPI routes. Run from repo root:  .venv/bin/uvicorn backend.main:app --reload --port 8000"""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import agent, config, db, llm_proxy, notify, scheduler, tools, tts
from .notify import _inr

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("galla")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    task = asyncio.create_task(scheduler.run_forever())
    log.info("Galla up. PUBLIC_URL=%s integrations=%s", config.PUBLIC_URL, config.status())
    yield
    task.cancel()


app = FastAPI(title="Galla", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------- voice agent ----------------
class StartReq(BaseModel):
    lang: str = "hi"


@app.post("/agent/start")
async def agent_start(req: StartReq):
    try:
        return await agent.start(req.lang)
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/agent/stop")
async def agent_stop():
    return await agent.stop()


# ---------------- OpenAI-compatible endpoint Agora calls ----------------
async def _llm(request: Request, lang: str):
    auth = request.headers.get("authorization", "")
    if auth and auth.removeprefix("Bearer ").strip() != config.LLM_PROXY_SECRET:
        raise HTTPException(401, "bad key")
    body = await request.json()
    lang = lang if lang in config.LANGS else "hi"
    return StreamingResponse(llm_proxy.sse_stream(body.get("messages", []), lang), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/llm/{lang}/chat/completions")
async def llm_lang(lang: str, request: Request):
    return await _llm(request, lang)


@app.post("/llm/chat/completions")
async def llm_default(request: Request):
    return await _llm(request, "hi")


# ---------------- text + browser-voice fallback ----------------
class ChatReq(BaseModel):
    message: str
    lang: str = "hi"
    session_id: str = "default"


@app.post("/api/chat")
async def chat(req: ChatReq):
    if not config.LLM_API_KEY:
        raise HTTPException(400, "Missing OPENAI_API_KEY in .env")
    return await llm_proxy.chat_once(req.session_id, req.message, req.lang)


class TTSReq(BaseModel):
    text: str
    lang: str = "hi"


@app.post("/api/tts")
async def speak(req: TTSReq):
    if not config.MURF_API_KEY:
        raise HTTPException(400, "Missing MURF_API_KEY")
    try:
        return Response(await tts.synthesize(req.text, req.lang), media_type="audio/mpeg")
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@app.post("/api/reset")
async def reset():
    await agent.stop()
    db.init(reset=True)
    llm_proxy.reset_sessions()
    return {"ok": True}


# ---------------- dashboard / app state ----------------
def _customer_rows() -> list[dict]:
    out = []
    t0 = db.start_of_today()
    for c in db.customers():
        bal = db.balance(c["id"])
        first = db.one("SELECT MIN(created_at) t FROM ledger WHERE customer_id=? AND type='credit'", (c["id"],))
        last_pay = db.one("SELECT MAX(created_at) t FROM ledger WHERE customer_id=? AND type='payment'", (c["id"],))
        last = db.one("SELECT MAX(created_at) t FROM ledger WHERE customer_id=?", (c["id"],))
        rem = db.one("SELECT * FROM reminders WHERE customer_id=? ORDER BY created_at DESC LIMIT 1", (c["id"],))
        days = int((time.time() - first["t"]) / 86400) if bal > 0 and first and first["t"] else 0
        if bal <= 0:
            status = "paid" if last_pay and last_pay["t"] and last_pay["t"] >= t0 else "clear"
        elif rem and rem["status"] == "sent":
            status = "reminded"
        elif days >= 14:
            status = "overdue"
        else:
            status = "due"
        out.append({"id": c["id"], "name": c["name"], "language": c["language"], "balance": bal, "status": status,
                    "days_pending": days, "updated_at": last["t"] if last else None,
                    "next_followup_at": rem["next_followup_at"] if rem and rem["status"] == "sent" else None})
    return sorted(out, key=lambda r: -r["balance"])


@app.get("/api/state")
async def state():
    acts = db.q("SELECT * FROM activity ORDER BY id DESC LIMIT 40")
    for a in acts:
        a["meta"] = json.loads(a.pop("meta_json") or "{}")
    convo = db.q("SELECT * FROM conversation ORDER BY id DESC LIMIT 20")
    for m in convo:
        m["tools"] = json.loads(m.pop("tools_json") or "[]")
    prods = db.products()
    for p in prods:
        p["low"] = p["stock"] <= p["low_stock_threshold"]
    return {
        "shop": {"name": config.SHOP_NAME, "upi": config.SHOP_UPI_ID},
        "integrations": config.status(),
        "numbers": tools.summary_numbers(),
        "customers": _customer_rows(),
        "products": prods,
        "activity": acts,
        "conversation": convo[::-1],
        "server_time": time.time(),
    }


# ---------------- customer pay page (sandbox) ----------------
def _reminder_or_404(rid: str) -> tuple[dict, dict]:
    rem = db.one("SELECT * FROM reminders WHERE id=?", (rid,))
    if not rem:
        raise HTTPException(404, "Payment link not found")
    cust = db.one("SELECT * FROM customers WHERE id=?", (rem["customer_id"],))
    return rem, cust


@app.get("/api/pay/{rid}")
async def pay_info(rid: str):
    rem, cust = _reminder_or_404(rid)
    from urllib.parse import quote
    upi = (f"upi://pay?pa={quote(config.SHOP_UPI_ID)}&pn={quote(config.SHOP_NAME)}&am={rem['amount']:.2f}"
           f"&cu=INR&tn={quote('Galla ' + rid)}")
    return {"id": rid, "status": rem["status"], "amount": rem["amount"], "customer": cust["name"],
            "language": cust["language"], "items": tools._pending_items(cust["id"], 5), "shop": config.SHOP_NAME,
            "upi_link": upi, "paid_at": rem["paid_at"]}


@app.post("/api/pay/{rid}/confirm")
async def pay_confirm(rid: str):
    rem, cust = _reminder_or_404(rid)
    if rem["status"] == "paid":
        return {"ok": True, "already_paid": True, "amount": rem["amount"]}
    bal = db.balance(cust["id"])
    amount = round(min(rem["amount"], bal), 2) if bal > 0 else 0
    now = time.time()
    if amount > 0:
        db.ex("INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
              (cust["id"], "[]", amount, "payment", "upi", now))
    db.ex("UPDATE reminders SET status='paid', paid_at=?, next_followup_at=NULL WHERE customer_id=? AND status='sent'",
          (now, cust["id"]))
    db.ex("UPDATE reminders SET status='paid', paid_at=? WHERE id=?", (now, rid))
    new_bal = db.balance(cust["id"])
    db.log_activity(f"💸 {cust['name']} paid {_inr(amount)} via UPI. Balance {_inr(new_bal)}", "payment",
                    {"customer": cust["name"], "amount": amount, "balance": new_bal, "celebrate": True})
    await notify.send(config.TG_CHAT_SHOPKEEPER,
                      f"✅ Payment received: {cust['name']} paid {_inr(amount)} via UPI.\nBalance now {_inr(new_bal)}. — Galla")
    await notify.send(notify.customer_chat(cust), notify.render("thanks", cust["language"], name=cust["name"], amount=_inr(amount)))
    return {"ok": True, "amount": amount, "new_balance": new_bal}


@app.get("/api/health")
async def health():
    return {"ok": True, "integrations": config.status(), "public_url": config.PUBLIC_URL}


# ---------------- React app (built into web/dist) ----------------
if (config.WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=config.WEB_DIST / "assets"), name="assets")


@app.get("/{path:path}")
async def spa(path: str):
    f = (config.WEB_DIST / path).resolve()
    if path and f.is_relative_to(config.WEB_DIST.resolve()) and f.is_file():
        return FileResponse(f)
    index = config.WEB_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"error": "Frontend not built. Run: cd web && npm install && npm run build"}, 404)
