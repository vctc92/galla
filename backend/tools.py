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


WHOLE_UNITS = {"piece", "packet"}  # can't sell 2.5 eggs or half a packet


def _number(raw) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _qty_problem(qty: float | None, raw, unit: str) -> str | None:
    if qty is None:
        return f"quantity '{raw}' is not a number"
    if qty <= 0:
        return "quantity must be more than zero"
    if unit in WHOLE_UNITS and qty != int(qty):
        return f"{unit} items are sold whole, not {qty:g}"
    return None


def _suggested_reorder(prod: dict) -> float:
    return max(prod["low_stock_threshold"] * 3 - prod["stock"], prod["low_stock_threshold"])


async def add_credit(customer_name: str, items: list[dict], confirm_oversell: bool = False) -> dict:
    """All-or-nothing: if any item is unclear, invalid or short on stock, NOTHING is recorded."""
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    if not items:
        return {"ok": False, "error": "no items given", "hint": "Ask what the customer took."}

    lines: dict[int, dict] = {}  # product_id -> line (same item said twice is merged)
    unknown, invalid = [], []
    for it in items:
        name = str(it.get("name", "")).strip()
        prod, _ = catalog.resolve_product(name)
        if not prod:
            unknown.append(name)
            continue
        raw = it.get("qty")
        qty = 1.0 if raw is None else _number(raw)  # "ek Surf" with no number = 1
        problem = _qty_problem(qty, raw, prod["unit"])
        if problem:
            invalid.append({"item": prod["name"], "problem": problem})
            continue
        line = lines.setdefault(prod["id"], {"prod": prod, "qty": 0.0})
        line["qty"] += qty

    if unknown or invalid:
        return {"ok": False, "error": "unclear items, nothing recorded", "unknown_items": unknown,
                "invalid_items": invalid, "recognised": [l["prod"]["name"] for l in lines.values()],
                "hint": "Nothing was saved. Ask one short question about the unclear item, then call add_credit "
                        "again with ALL items.", "catalog": catalog.catalog_summary() if unknown else None}

    shortages = [{"product": l["prod"]["name"], "requested": l["qty"], "in_stock": l["prod"]["stock"],
                  "unit": l["prod"]["unit"]} for l in lines.values() if l["qty"] > l["prod"]["stock"]]
    if shortages and not confirm_oversell:
        return {"ok": False, "error": "not enough stock, nothing recorded", "shortages": shortages,
                "hint": "Nothing was saved. Tell the shopkeeper how many are in stock and ask ONE question: record only "
                        "the available quantity, or did they really hand over the full quantity (stock count was off)? "
                        "Full quantity -> call add_credit again with confirm_oversell=true. Available only -> call again "
                        "with that quantity. Then offer to reorder from the supplier."}

    priced = [{"product_id": l["prod"]["id"], "name": l["prod"]["name"], "qty": l["qty"], "unit": l["prod"]["unit"],
               "price": l["prod"]["price"], "subtotal": round(l["prod"]["price"] * l["qty"], 2)} for l in lines.values()]
    total = round(sum(p["subtotal"] for p in priced), 2)
    desc = ", ".join(f"{p['qty']:g} {p['unit']} {p['name']}" for p in priced)
    with db.tx():  # ledger entry and stock deduction succeed or fail together
        db.ex("INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
              (cust["id"], json.dumps(priced, ensure_ascii=False), total, "credit", "udhaar", time.time()))
        for p in priced:
            db.ex("UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?", (p["qty"], p["product_id"]))
        bal = db.balance(cust["id"])
        db.log_activity(f"{_inr(total)} udhaar added for {cust['name']} — {desc}", "credit",
                        {"customer": cust["name"], "amount": total, "balance": bal})
        for s in shortages:  # confirmed: the shelf had more than the system thought
            db.log_activity(f"Stock count corrected: sold {s['requested']:g} {s['unit']} {s['product']} but system had "
                            f"{s['in_stock']:g}. Now 0 — please recount.", "alert", {"product": s["product"]})
        low = _low_stock_warnings([p["product_id"] for p in priced])
        for w in low:
            db.log_activity(f"{'Out of stock' if w['stock_left'] <= 0 else 'Low stock'}: "
                            f"{w['stock_left']:g} {w['unit']} {w['product']} left", "alert", {"product": w["product"]})
    for w in low:
        w["out_of_stock"] = w["stock_left"] <= 0
    return {"ok": True, "customer": cust["name"], "items": [{k: p[k] for k in ("name", "qty", "unit", "subtotal")} for p in priced],
            "total": total, "new_balance": bal, "low_stock": low, "stock_corrected": shortages,
            "note": "Stock already deducted for these items; do NOT call update_stock for them."
                    + (" Some items are low/out of stock: offer to reorder from the supplier." if low else "")}


async def record_payment(customer_name: str, amount: float, method: str = "cash", confirm_advance: bool = False) -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)
    if not cust:
        return _not_found("customer", customer_name, sugg)
    amount = _number(amount)
    if amount is None or amount <= 0:
        return {"ok": False, "error": "amount must be a positive number", "hint": "Ask how much they paid."}
    amount = round(amount, 2)
    due = db.balance(cust["id"])
    if amount > max(due, 0) and not confirm_advance:
        return {"ok": False, "error": "amount is more than the balance due, nothing recorded", "balance_due": due,
                "hint": f"Confirm the amount (maybe misheard). If correct, the extra {amount - max(due, 0):g} rupees is kept "
                        "as advance: call again with confirm_advance=true."}
    db.ex("INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
          (cust["id"], "[]", amount, "payment", method, time.time()))
    bal = db.balance(cust["id"])
    if bal <= 0:
        db.ex("UPDATE reminders SET status='paid', paid_at=?, next_followup_at=NULL WHERE customer_id=? AND status='sent'",
              (time.time(), cust["id"]))
    db.log_activity(f"{cust['name']} paid {_inr(amount)} ({method}). Balance {_inr(bal)}", "payment",
                    {"customer": cust["name"], "amount": amount, "balance": bal, "method": method})
    return {"ok": True, "customer": cust["name"], "paid": amount, "new_balance": bal, "advance": max(-bal, 0)}


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
    low = prod["stock"] <= prod["low_stock_threshold"]
    return {"ok": True, "product": prod["name"], "stock": prod["stock"], "unit": prod["unit"], "price": prod["price"],
            "low": low, "out_of_stock": prod["stock"] <= 0,
            "suggested_reorder_qty": _suggested_reorder(prod) if low else None}


async def update_stock(product_name: str, qty_change: float) -> dict:
    prod, sugg = catalog.resolve_product(product_name)
    if not prod:
        return _not_found("product", product_name, sugg)
    change = _number(qty_change)
    if change is None or change == 0:
        return {"ok": False, "error": f"stock change '{qty_change}' is not a non-zero number", "hint": "Ask how many."}
    if prod["unit"] in WHOLE_UNITS and change != int(change):
        return {"ok": False, "error": f"{prod['unit']} items are counted whole", "hint": "Ask how many."}
    clamped = change < 0 and -change > prod["stock"]
    db.ex("UPDATE products SET stock = MAX(stock + ?, 0) WHERE id=?", (change, prod["id"]))
    new = db.one("SELECT * FROM products WHERE id=?", (prod["id"],))
    verb = "restocked" if change > 0 else "reduced"
    db.log_activity(f"{new['name']} {verb} by {abs(change):g} {new['unit']} → {new['stock']:g} left", "stock",
                    {"product": new["name"]})
    low = new["stock"] <= new["low_stock_threshold"]
    if low:
        db.log_activity(f"{'Out of stock' if new['stock'] <= 0 else 'Low stock'}: {new['stock']:g} {new['unit']} "
                        f"{new['name']} left", "alert", {"product": new["name"]})
    return {"ok": True, "product": new["name"], "stock": new["stock"], "unit": new["unit"], "low": low,
            "out_of_stock": new["stock"] <= 0,
            "note": f"Only {prod['stock']:g} were in stock, so stock is now 0." if clamped else None}


async def place_reorder(product_name: str, qty: float | None = None) -> dict:
    """Order from the supplier over Telegram. No qty -> a sensible suggested amount (3x the low-stock level)."""
    prod, sugg = catalog.resolve_product(product_name)
    if not prod:
        return _not_found("product", product_name, sugg)
    suggested = qty is None
    qty = _suggested_reorder(prod) if suggested else _number(qty)
    problem = _qty_problem(qty, qty, prod["unit"])
    if problem:
        return {"ok": False, "error": problem, "hint": "Ask how much to order."}
    text = (f"📦 Order request from {config.SHOP_NAME}\n{qty:g} {prod['unit']} × {prod['name']}\n"
            f"Current stock: {prod['stock']:g} {prod['unit']}. Please confirm delivery time.")
    res = await notify.send(config.TG_CHAT_SUPPLIER, text)
    to = "supplier" if config.TG_CHAT_SUPPLIER_SET else "shopkeeper's own Telegram (no supplier chat configured)"
    db.log_activity(f"Reorder sent: {qty:g} {prod['unit']} {prod['name']} → {to.split(' (')[0]}"
                    + ("" if res.get("ok") else " (dry-run)" if res.get("dry_run") else " (failed)"), "stock",
                    {"product": prod["name"], "qty": qty, "delivered": res.get("ok")})
    return {"ok": bool(res.get("ok") or res.get("dry_run")), "product": prod["name"], "qty": qty, "unit": prod["unit"],
            "qty_was_suggested": suggested, "sent_to": to,
            "note": "Order request only; stock increases when the delivery arrives (update_stock with a positive number)."}


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
            "follow_up_in_seconds": config.FOLLOWUP_DELAY_SECONDS,
            "note": "A payment REMINDER message asking the customer to pay was sent. No money was sent or received."}


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
