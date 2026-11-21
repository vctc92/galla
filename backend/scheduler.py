"""Follow-up scheduler: re-sends unpaid reminders after FOLLOWUP_DELAY_SECONDS (demo: 60s).

Plain asyncio loop; swap for APScheduler / a job queue if this ever runs multi-process.
"""
import asyncio
import logging
import time

from . import config, db, tools
from .notify import _inr

log = logging.getLogger("galla.scheduler")


async def tick() -> None:
    due = db.q("SELECT * FROM reminders WHERE status='sent' AND next_followup_at IS NOT NULL AND next_followup_at <= ?",
               (time.time(),))
    for rem in due:
        cust = db.one("SELECT * FROM customers WHERE id=?", (rem["customer_id"],))
        bal = db.balance(rem["customer_id"])
        if not cust or bal <= 0:
            db.ex("UPDATE reminders SET status='paid', next_followup_at=NULL WHERE id=?", (rem["id"],))
            continue
        rem["amount"] = bal
        res = await tools.send_reminder_message(rem, cust, kind="followup")
        sent = rem["followups_sent"] + 1
        nxt = time.time() + config.FOLLOWUP_DELAY_SECONDS if sent < config.MAX_FOLLOWUPS else None
        db.ex("UPDATE reminders SET followups_sent=?, next_followup_at=?, amount=? WHERE id=?", (sent, nxt, bal, rem["id"]))
        db.log_activity(f"Auto follow-up sent to {cust['name']} for {_inr(bal)}"
                        + ("" if res.get("ok") else " (dry-run)" if res.get("dry_run") else " (failed)"),
                        "reminder", {"customer": cust["name"], "followup": sent})


async def run_forever(interval: float = 3.0) -> None:
    while True:
        try:
            await tick()
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(interval)
