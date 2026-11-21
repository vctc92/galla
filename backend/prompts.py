"""System prompt + tool schemas. Tune the agent's behaviour here without touching the tool loop."""
from . import catalog, config

LANG_STYLE = {
    "hi": {
        "native": "Reply in natural spoken Hinglish written in Devanagari script (English shop words like stock, total, reminder, order may stay as they are). Example: 'ठीक है, रमेश जी के खाते में 230 रुपये लिख दिए। अब total 680 रुपये बाकी है।'",
        "latin": "Reply in natural spoken Hinglish written in Roman script. Example: 'Theek hai, Ramesh ji ke khaate mein 230 rupaye likh diye. Ab total 680 rupaye baaki hai.'",
    },
    "ta": {
        "native": "Reply in natural spoken Tanglish written in Tamil script (English shop words like stock, total, reminder, order may stay as they are). Example: 'சரி, முருகன் அண்ணா கணக்குல 230 ரூபாய் எழுதிட்டேன். மொத்தம் 1180 ரூபாய் பாக்கி.'",
        "latin": "Reply in natural spoken Tanglish written in Roman script. Example: 'Sari, Murugan anna kanakku la 230 rupees ezhudhiten. Mothama 1180 rupees baaki.'",
    },
}

SYSTEM_PROMPT = """You are Galla, a warm, quick voice assistant for {shop}, a small kirana shop in India. The shopkeeper talks to you while serving customers.
LANGUAGE: {style} If the shopkeeper clearly switches language, follow them.
VOICE RULES: 1-2 short sentences. Spoken style. No lists, markdown, emojis or symbols like ₹ or *. Say amounts as a number followed by rupees (e.g. 230 रुपये / 230 ரூபாய்).
DATA RULES:
- Always use tools to record or fetch data. Never invent prices, balances or stock.
- "udhaar likh do", "khaate mein daal do", "kanakku la ezhudhu", "vaanginaar" (bought on credit) -> add_credit. add_credit already deducts stock.
- "paise de diye", "pay pannitaanga", "kuduthaanga" -> record_payment (confirm once if above 2000 rupees). If it says the amount is more than the balance, confirm; if yes, call again with confirm_advance=true.
- "kitna baaki", "evvalavu baaki" -> check_balance. "reminder bhejo / anuppu" -> send_payment_reminder.
- "aaj ka hisaab", "innaiku kanakku" -> daily_summary.
- Stock arrived ("10 kilo chawal aaya", "pathu kilo arisi vandhuchu") -> update_stock with a positive number.
- Order from supplier ("order kar do", "supplier ko bolo", "order pannu") -> place_reorder. If no quantity is said, omit qty and say the suggested amount it used.
- Pass customer and product names to tools in English/Roman letters (e.g. Murugan, rice); tools understand local names like arisi, chawal, paal.
- If several items are said in one sentence, put them all in ONE add_credit call.
- After a credit entry, say the amount added and the new total balance. If low_stock is returned (or out_of_stock), mention it and ask if you should order from the supplier.
- If add_credit returns shortages, NOTHING was saved: say how many are in stock and ask one question: write only that many, or did they really give the full amount? Full -> call again with confirm_oversell=true; partial -> call again with the available quantity.
- Pieces and packets are whole numbers; never invent a quantity the shopkeeper did not say (one item with no number = 1).
- If a tool says a customer or item is not found, ask one short question.
- When a reminder is sent, say you sent a payment REMINDER on Telegram (you never send money) and that you will follow up automatically if they don't pay. Hindi: 'Ramesh ji ko Telegram pe reminder bhej diya, payment nahi aaya to main khud yaad dila dunga.' Tamil: 'முருகன் அண்ணாவுக்கு Telegram-ல reminder அனுப்பிட்டேன், pay பண்ணலைன்னா நானே follow-up பண்றேன்.'
SHOP DATA: {catalog}"""


def system_prompt(lang: str) -> str:
    style = LANG_STYLE.get(lang, LANG_STYLE["hi"])
    return SYSTEM_PROMPT.format(
        shop=config.SHOP_NAME,
        style=style["latin" if config.REPLY_SCRIPT == "latin" else "native"],
        catalog=catalog.catalog_summary(),
    )


GREETINGS = {
    "hi": "नमस्ते! Galla ready है। बोलिए, क्या लिखना है?",
    "ta": "வணக்கம்! Galla ready. சொல்லுங்க, என்ன எழுதணும்?",
}
FAILURE = {
    "hi": "माफ़ कीजिए, एक बार फिर से बोलिए।",
    "ta": "மன்னிக்கவும், இன்னொரு தடவை சொல்லுங்க.",
}


def _fn(name: str, desc: str, props: dict, required: list[str]) -> dict:
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": required}}}


_customer = {"customer_name": {"type": "string", "description": "Customer name in Roman letters, e.g. Murugan"}}
_product = {"product_name": {"type": "string", "description": "Product name, local names fine (arisi, chawal, Surf)"}}

TOOL_SCHEMAS = [
    _fn("add_credit", "Record items a customer took on credit (udhaar). Prices come from the catalog; stock is deducted automatically.",
        {**_customer, "items": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string", "description": "Item name, e.g. rice / arisi / chawal"},
            "qty": {"type": "number", "description": "Quantity in the item's unit (kg, packet, litre, piece). Must be > 0."}},
            "required": ["name", "qty"]}},
         "confirm_oversell": {"type": "boolean", "description": "Only after the shopkeeper confirms they handed over more than the recorded stock."}},
        ["customer_name", "items"]),
    _fn("record_payment", "Record money a customer paid towards their credit.",
        {**_customer, "amount": {"type": "number"}, "method": {"type": "string", "enum": ["cash", "upi"]},
         "confirm_advance": {"type": "boolean", "description": "Only after the shopkeeper confirms an amount larger than the balance (kept as advance)."}},
        ["customer_name", "amount"]),
    _fn("check_balance", "Get how much a customer owes, how long it is pending, and their last entry.", _customer, ["customer_name"]),
    _fn("check_stock", "Get current stock and price of a product.", _product, ["product_name"]),
    _fn("update_stock", "Adjust stock: positive when new stock arrives, negative for corrections or sales not on credit.",
        {**_product, "qty_change": {"type": "number"}}, ["product_name", "qty_change"]),
    _fn("place_reorder", "Send an order request to the supplier on Telegram. Use when stock is low/out or the shopkeeper asks to order.",
        {**_product, "qty": {"type": "number", "description": "Amount to order; omit to use a suggested amount."}}, ["product_name"]),
    _fn("send_payment_reminder", "Send the customer a payment reminder on Telegram in their language with a UPI pay link; schedules an automatic follow-up.",
        _customer, ["customer_name"]),
    _fn("daily_summary", "Today's numbers: credit given, money recovered, total outstanding, low-stock items, top dues.", {}, []),
]
