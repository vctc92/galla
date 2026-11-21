"""Edge-case tests for backend/tools.py. Offline: temp DB, Telegram dry-run, no LLM.

Run: .venv/bin/python scripts/test_tools.py   (also run by scripts/smoke_offline.sh)
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "tools_test.db")
os.environ["TELEGRAM_BOT_TOKEN"] = ""  # never send real messages from tests
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import db, tools  # noqa: E402

results: list[bool] = []


def check(cond: bool, msg: str) -> None:
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + msg)


def stock(name: str) -> float:
    return db.one("SELECT stock FROM products WHERE name=?", (name,))["stock"]


def bal(name: str) -> float:
    return db.balance(db.one("SELECT id FROM customers WHERE name=?", (name,))["id"])


async def main() -> None:
    db.init(reset=True)

    # --- more than in stock (60 eggs) ---
    r = await tools.add_credit("Murugan", [{"name": "eggs", "qty": 80}])
    check(not r["ok"] and r["shortages"][0]["in_stock"] == 60, "80 eggs vs 60 in stock -> refused with shortage")
    check(stock("Eggs") == 60 and bal("Murugan") == 950, "...nothing recorded (stock 60, balance unchanged)")

    r = await tools.add_credit("Murugan", [{"name": "eggs", "qty": 60}])
    check(r["ok"] and r["total"] == 420 and stock("Eggs") == 0, "record only the available 60 -> stock 0")
    check(r["low_stock"] and r["low_stock"][0]["out_of_stock"], "...flags out of stock and asks to reorder")

    r = await tools.add_credit("Murugan", [{"name": "egg", "qty": 5}])
    check(not r["ok"] and r["shortages"], "selling from empty stock -> refused")
    r = await tools.add_credit("Murugan", [{"name": "egg", "qty": 5}], confirm_oversell=True)
    check(r["ok"] and r["stock_corrected"] and stock("Eggs") == 0, "confirmed oversell -> recorded, count-correction alert")

    # --- same item said twice is merged before the stock check (Surf stock 3) ---
    r = await tools.add_credit("Priya", [{"name": "surf", "qty": 2}, {"name": "surf excel", "qty": 2}])
    check(not r["ok"] and r["shortages"][0]["requested"] == 4, "Surf 2 + 2 merged = 4 > 3 -> refused")

    # --- bad quantities ---
    for qty, label in [(0, "zero"), (-3, "negative"), ("two", "text")]:
        r = await tools.add_credit("Ramesh", [{"name": "sugar", "qty": qty}])
        check(not r["ok"] and r["invalid_items"], f"{label} quantity -> refused")
    r = await tools.add_credit("Ramesh", [{"name": "egg", "qty": 2.5}], confirm_oversell=True)
    check(not r["ok"] and r["invalid_items"], "2.5 eggs (piece unit) -> refused")
    r = await tools.add_credit("Ramesh", [{"name": "rice", "qty": 1.5}])
    check(r["ok"] and r["total"] == 90, "1.5 kg rice (kg unit) -> allowed")
    r = await tools.add_credit("Ramesh", [{"name": "salt", "qty": None}])
    check(r["ok"] and r["items"][0]["qty"] == 1, "no quantity given ('ek namak') -> 1")

    # --- one unknown item blocks the whole entry (no half-recorded bills) ---
    before = bal("Priya")
    r = await tools.add_credit("Priya", [{"name": "rice", "qty": 1}, {"name": "xyzzy", "qty": 1}])
    check(not r["ok"] and r["unknown_items"] == ["xyzzy"] and bal("Priya") == before, "known + unknown item -> nothing recorded")

    # --- payments ---
    due = bal("Priya")
    r = await tools.record_payment("Priya", due + 4700)
    check(not r["ok"] and bal("Priya") == due, "payment above balance -> asks to confirm, nothing recorded")
    r = await tools.record_payment("Priya", due + 100, confirm_advance=True)
    check(r["ok"] and r["advance"] == 100, "confirmed advance -> recorded, advance 100")
    r = await tools.record_payment("Ramesh", "abc")
    check(not r["ok"], "non-numeric payment -> refused")

    # --- stock updates and reorders ---
    r = await tools.update_stock("milk", -100)
    check(r["ok"] and r["stock"] == 0 and r["note"], "remove 100 milk from 40 -> clamped to 0 with note")
    r = await tools.update_stock("milk", 0)
    check(not r["ok"], "stock change 0 -> refused")
    # --- supplier orders + delivery confirmation (the /supply page) ---
    r = await tools.place_reorder("eggs")
    check(r["ok"] and r["qty_was_suggested"] and r["qty"] == 36 and r["order_id"], "reorder with no qty -> order for suggested 36 eggs")
    oid = r["order_id"]
    check(db.on_order(db.one("SELECT id FROM products WHERE name='Eggs'")["id"]) == 36, "...36 eggs shown as on order")
    r = await tools.place_reorder("eggs", 10)
    check(not r["ok"] and r["already_on_order"] == 36, "second order while one is pending -> asks first")
    r = await tools.place_reorder("eggs", 0, confirm_extra=True)
    check(not r["ok"], "reorder qty 0 -> refused")
    r = tools.confirm_delivery(oid, 2.5)
    check(not r["ok"] and stock("Eggs") == 0, "delivery of 2.5 eggs -> refused, stock unchanged")
    r = tools.confirm_delivery(oid, 30)
    check(r["ok"] and r["short_delivery"] and stock("Eggs") == 30, "supplier confirms short delivery of 30 -> stock 30")
    r = tools.confirm_delivery(oid)
    check(r.get("already_delivered") and stock("Eggs") == 30, "confirming twice -> no double stock")
    check(not tools.confirm_delivery("nope")["ok"], "unknown order id -> refused")
    r = await tools.place_reorder("rice", 20)
    r2 = tools.confirm_delivery(r["order_id"])
    check(r2["ok"] and r2["delivered_qty"] == 20 and not r2["short_delivery"], "full delivery uses ordered qty by default")
    r = await tools.update_stock("eggs", 6)
    check(r["ok"] and stock("Eggs") == 36, "manual stock arrival still works (update_stock +6)")

    print(f"\n{sum(results)}/{len(results)} tool edge cases passed")
    raise SystemExit(0 if all(results) else 1)


asyncio.run(main())
