"""Tool implementations the LLM can call. Each returns a JSON-serialisable dict.

Add a tool: write an async function here, register it in REGISTRY, and add its schema in prompts.TOOL_SCHEMAS.
"""
import json
import logging
import secrets
import time

from . import catalog, config, db, notify
from .notify import _inr

log = logging.getLogger("galla.tools")


def _not_found(kind: str, name: str, suggestions: list[str]) -> dict:
    return {"ok": False, "error": f"{kind} '{name}' not found", "known": suggestions,
            "hint": f"Ask the shopkeeper which {kind} they meant."}


def _low_stock_warnings(product_ids: list[int] | None = None) -> list[dict]:
    rows = db.q("SELECT * FROM products WHERE stock <= low_stock_threshold ORDER BY stock")
    if product_ids is not None:
        rows = [r for r in rows if r["id"] in product_ids]
    return [{"product": r["name"], "stock_left": r["stock"], "unit": r["unit"]} for r in rows]


def _pending_items(customer_id: int, limit: int = 3) -> list[str]:
    rows = db.q(
        "SELECT items_json FROM ledger WHERE customer_id=? AND type='credit' AND method != 'opening' "
        "ORDER BY created_at DESC LIMIT ?", (customer_id, limit))
    out = []
    for r in rows:
        for it in json.loads(r["items_json"]):
            out.append(f"{it['qty']:g} {it['unit']} {it['name']}".replace("  ", " "))
    return out


async def add_credit(customer_name: str, items: list[dict]) -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    priced, unknown, pids = [], [], []
    for it in items or []:
        prod, _ = catalog.resolve_product(str(it.get("name", "")))
        qty = float(it.get("qty") or 1)
        if not prod:
            unknown.append(it.get("name"))
            continue
        sub = round(prod["price"] * qty, 2)
        priced.append({"product_id": prod["id"], "name": prod["name"], "qty": qty, "unit": prod["unit"],
                       "price": prod["price"], "subtotal": sub})
        pids.append(prod["id"])
    if not priced:
        return {"ok": False, "error": "no known items", "unknown_items": unknown,
                "hint": "Ask which item they meant.", "catalog": catalog.catalog_summary()}
    total = round(sum(p["subtotal"] for p in priced), 2)
    db.ex("INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
          (cust["id"], json.dumps(priced, ensure_ascii=False), total, "credit", "udhaar", time.time()))
    for p in priced:
        db.ex("UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?", (p["qty"], p["product_id"]))
    bal = db.balance(cust["id"])
    desc = ", ".join(f"{p['qty']:g} {p['unit']} {p['name']}" for p in priced)
    db.log_activity(f"{_inr(total)} udhaar added for {cust['name']} — {desc}", "credit",
                    {"customer": cust["name"], "amount": total, "balance": bal})
    low = _low_stock_warnings(pids)
    for w in low:
        db.log_activity(f"Low stock: only {w['stock_left']:g} {w['unit']} {w['product']} left", "alert",
                        {"product": w["product"]})
    return {"ok": True, "customer": cust["name"], "items": [{k: p[k] for k in ("name", "qty", "unit", "subtotal")} for p in priced],
            "total": total, "new_balance": bal, "low_stock": low, "unknown_items": unknown,
            "note": "Stock already deducted for these items; do NOT call update_stock for them."}


async def record_payment(customer_name: str, amount: float, method: str = "cash") -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    amount = round(float(amount), 2)
    if amount <= 0:
        return {"ok": False, "error": "amount must be positive"}
    db.ex("INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
          (cust["id"], "[]", amount, "payment", method, time.time()))
    bal = db.balance(cust["id"])
    if bal <= 0:
        db.ex("UPDATE reminders SET status='paid', paid_at=?, next_followup_at=NULL WHERE customer_id=? AND status='sent'",
              (time.time(), cust["id"]))
    db.log_activity(f"{cust['name']} paid {_inr(amount)} ({method}). Balance {_inr(bal)}", "payment",
                    {"customer": cust["name"], "amount": amount, "balance": bal})
    return {"ok": True, "customer": cust["name"], "paid": amount, "new_balance": bal}


async def check_balance(customer_name: str) -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    last = db.one("SELECT * FROM ledger WHERE customer_id=? ORDER BY created_at DESC LIMIT 1", (cust["id"],))
    oldest_unpaid = db.one("SELECT MIN(created_at) AS t FROM ledger WHERE customer_id=? AND type='credit'", (cust["id"],))
    rem = db.one("SELECT * FROM reminders WHERE customer_id=? ORDER BY created_at DESC LIMIT 1", (cust["id"],))
    bal = db.balance(cust["id"])
    days = int((time.time() - oldest_unpaid["t"]) / 86400) if bal > 0 and oldest_unpaid and oldest_unpaid["t"] else 0
    return {
        "ok": True, "customer": cust["name"], "balance_due": bal, "fully_paid": bal <= 0,
        "days_pending": days, "long_pending": days >= 14,
        "last_entry": {"type": last["type"], "amount": last["amount"],
                       "items": [i["name"] for i in json.loads(last["items_json"])]} if last else None,
        "last_reminder_status": rem["status"] if rem else None,
    }


async def check_stock(product_name: str) -> dict:
    prod, sugg = catalog.resolve_product(product_name)
    if not prod:
        return _not_found("product", product_name, sugg)
    return {"ok": True, "product": prod["name"], "stock": prod["stock"], "unit": prod["unit"], "price": prod["price"],
            "low": prod["stock"] <= prod["low_stock_threshold"]}


async def update_stock(product_name: str, qty_change: float) -> dict:
    prod, sugg = catalog.resolve_product(product_name)
    if not prod:
        return _not_found("product", product_name, sugg)
    qty_change = float(qty_change)
    db.ex("UPDATE products SET stock = MAX(stock + ?, 0) WHERE id=?", (qty_change, prod["id"]))
    new = db.one("SELECT * FROM products WHERE id=?", (prod["id"],))
    verb = "restocked" if qty_change > 0 else "reduced"
    db.log_activity(f"{new['name']} {verb} by {abs(qty_change):g} {new['unit']} → {new['stock']:g} left", "stock",
                    {"product": new["name"]})
    low = new["stock"] <= new["low_stock_threshold"]
    if low:
        db.log_activity(f"Low stock: only {new['stock']:g} {new['unit']} {new['name']} left", "alert", {"product": new["name"]})
    return {"ok": True, "product": new["name"], "stock": new["stock"], "unit": new["unit"], "low": low}


async def place_reorder(product_name: str, qty: float) -> dict:
    prod, sugg = catalog.resolve_product(product_name)
    if not prod:
        return _not_found("product", product_name, sugg)
    text = f"📦 Order request from {config.SHOP_NAME}: {float(qty):g} {prod['unit']} {prod['name']} (stock now {prod['stock']:g})."
    res = await notify.send(config.TG_CHAT_SUPPLIER, text)
    db.log_activity(f"Reorder sent to supplier: {float(qty):g} {prod['unit']} {prod['name']}", "stock",
                    {"product": prod["name"], "delivered": res.get("ok"), "dry_run": res.get("dry_run", False)})
    return {"ok": True, "product": prod["name"], "qty": qty, "sent_to_supplier": res.get("ok") or res.get("dry_run", False)}


def _pay_link(rid: str) -> str:
    return f"{config.PUBLIC_URL}/pay/{rid}"


async def send_reminder_message(reminder: dict, cust: dict, kind: str = "reminder") -> dict:
    lang = cust["language"]
    amount = _inr(reminder["amount"])
    items = _pending_items(cust["id"])
    items_line = notify.render("items_label", lang, items=", ".join(items)) if items else ""
    text = notify.render(kind, lang, name=cust["name"], amount=amount, items=items_line, link=_pay_link(reminder["id"]))
    return await notify.send(notify.customer_chat(cust), text.replace("\n\n", "\n"),
                             button_text=notify.render("button", lang, amount=amount), button_url=_pay_link(reminder["id"]))


async def send_payment_reminder(customer_name: str) -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    bal = db.balance(cust["id"])
    if bal <= 0:
        return {"ok": False, "customer": cust["name"], "error": "nothing due", "balance_due": bal}
    # supersede any older open reminder for this customer
    db.ex("UPDATE reminders SET status='cancelled', next_followup_at=NULL WHERE customer_id=? AND status='sent'", (cust["id"],))
    rid = secrets.token_urlsafe(6).replace("-", "x").replace("_", "y")
    now = time.time()
    db.ex("INSERT INTO reminders(id, customer_id, amount, status, followups_sent, next_followup_at, created_at) "
          "VALUES (?,?,?,?,?,?,?)", (rid, cust["id"], bal, "sent", 0, now + config.FOLLOWUP_DELAY_SECONDS, now))
    rem = db.one("SELECT * FROM reminders WHERE id=?", (rid,))
    res = await send_reminder_message(rem, cust)
    channel = "Telegram" if res.get("ok") else ("Telegram (dry-run)" if res.get("dry_run") else "Telegram (failed)")
    db.log_activity(f"Reminder sent to {cust['name']} for {_inr(bal)} via {channel}", "reminder",
                    {"customer": cust["name"], "amount": bal, "reminder_id": rid, "delivered": res.get("ok")})
    return {"ok": True, "customer": cust["name"], "amount": bal, "language": cust["language"],
            "delivered": bool(res.get("ok")), "dry_run": res.get("dry_run", False), "pay_link": _pay_link(rid),
            "follow_up_in_seconds": config.FOLLOWUP_DELAY_SECONDS}


def summary_numbers() -> dict:
    t0 = db.start_of_today()
    credit = db.one("SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM ledger WHERE type='credit' AND method!='opening' AND created_at>=?", (t0,))
    paid = db.one("SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM ledger WHERE type='payment' AND created_at>=?", (t0,))
    outstanding = sum(max(db.balance(c["id"]), 0) for c in db.customers())
    return {"sales": round(credit["s"], 2), "credit_given": round(credit["s"], 2), "credit_entries": credit["n"],
            "recovered": round(paid["s"], 2), "payments": paid["n"], "outstanding": round(outstanding, 2),
            "reminders_sent": db.one("SELECT COUNT(*) n FROM reminders WHERE created_at>=?", (t0,))["n"]}


async def daily_summary() -> dict:
    nums = summary_numbers()
    low = _low_stock_warnings()
    top = sorted(({"customer": c["name"], "due": db.balance(c["id"])} for c in db.customers()), key=lambda x: -x["due"])
    db.log_activity(f"Daily summary: credit {_inr(nums['credit_given'])}, recovered {_inr(nums['recovered'])}", "system")
    return {"ok": True, **nums, "low_stock": low, "top_dues": [t for t in top if t["due"] > 0][:3]}


REGISTRY = {
    "add_credit": add_credit,
    "record_payment": record_payment,
    "check_balance": check_balance,
    "check_stock": check_stock,
    "update_stock": update_stock,
    "place_reorder": place_reorder,
    "send_payment_reminder": send_payment_reminder,
    "daily_summary": daily_summary,
}


async def execute(name: str, args: dict) -> dict:
    fn = REGISTRY.get(name)
    if not fn:
        return {"ok": False, "error": f"unknown tool {name}"}
    try:
        return await fn(**args)
    except TypeError as e:
        return {"ok": False, "error": f"bad arguments: {e}"}
    except Exception as e:
        log.exception("tool %s failed", name)
        return {"ok": False, "error": str(e)}
