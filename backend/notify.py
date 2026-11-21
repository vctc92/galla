"""Outbound messaging. Telegram today; add whatsapp_send() here later and switch in send()."""
import logging

import httpx

from . import config

log = logging.getLogger("galla.notify")


def _inr(x: float) -> str:
    x = round(x)
    s = str(int(abs(x)))
    if len(s) > 3:  # Indian grouping: 1,23,456
        head, tail = s[:-3], s[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        s = f"{head},{tail}"
    return ("-" if x < 0 else "") + "₹" + s


TEMPLATES = {
    "reminder": {
        "hi": "नमस्ते {name} जी 🙏\n{shop} से याद दिला रहे हैं: आपका {amount} उधार बाकी है।\n{items}\nनीचे दिए लिंक से UPI से भुगतान करें 👇\n{link}",
        "ta": "வணக்கம் {name} 🙏\n{shop} கடையில் உங்கள் கணக்கில் {amount} பாக்கி உள்ளது.\n{items}\nகீழே உள்ள லிங்க் மூலம் UPI-ல் செலுத்துங்கள் 👇\n{link}",
        "en": "Hello {name} 🙏\nReminder from {shop}: {amount} is due on your account.\n{items}\nPay via UPI here 👇\n{link}",
    },
    "followup": {
        "hi": "⏰ {name} जी, दोबारा याद दिला रहे हैं — {shop} में {amount} बाकी है। आज भुगतान कर दें तो अच्छा रहेगा 🙏\n{link}",
        "ta": "⏰ {name}, மீண்டும் ஒரு நினைவூட்டல் — {shop} கடையில் {amount} பாக்கி. இன்று செலுத்தினால் நல்லது 🙏\n{link}",
        "en": "⏰ {name}, gentle follow-up — {amount} is still due at {shop}.\n{link}",
    },
    "items_label": {"hi": "सामान: {items}", "ta": "பொருட்கள்: {items}", "en": "Items: {items}"},
    "button": {"hi": "💸 {amount} भुगतान करें", "ta": "💸 {amount} செலுத்துங்கள்", "en": "💸 Pay {amount}"},
    "thanks": {
        "hi": "✅ धन्यवाद {name} जी! {amount} का भुगतान मिल गया। — {shop}",
        "ta": "✅ நன்றி {name}! {amount} பணம் கிடைத்தது. — {shop}",
        "en": "✅ Thank you {name}! Payment of {amount} received. — {shop}",
    },
}


def render(kind: str, lang: str, **kw) -> str:
    t = TEMPLATES[kind].get(lang) or TEMPLATES[kind]["en"]
    return t.format(shop=config.SHOP_NAME, **kw)


async def send(chat_id: str | None, text: str, button_text: str | None = None, button_url: str | None = None) -> dict:
    """Send a Telegram message. Without a token/chat id it runs in dry-run mode so the demo never crashes."""
    if not config.TELEGRAM_BOT_TOKEN or not chat_id:
        log.warning("Telegram dry-run (chat=%s): %s", chat_id, text.replace("\n", " | "))
        return {"ok": False, "dry_run": True}
    payload: dict = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    # Telegram rejects inline buttons that point to http:// or localhost; the link stays in the text either way.
    if button_url and button_url.startswith("https://"):
        payload["reply_markup"] = {"inline_keyboard": [[{"text": button_text or "Pay", "url": button_url}]]}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage", json=payload)
            data = r.json()
            if not data.get("ok"):
                log.error("Telegram error: %s", data)
            return {"ok": bool(data.get("ok")), "error": data.get("description")}
    except Exception as e:  # network hiccup on stage should not kill the agent turn
        log.exception("Telegram send failed")
        return {"ok": False, "error": str(e)}


def customer_chat(customer: dict) -> str | None:
    return customer.get("telegram_chat_id") or config.TG_CHAT_CUSTOMER or None
