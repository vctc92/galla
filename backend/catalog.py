"""Retrieval over the product catalog and customer list.

Maps regional / code-mixed names ("arisi", "chawal", "Murugan anna", "रमेश") to catalog rows.
Used both by tools (to resolve arguments) and by the LLM proxy (RAG context for each turn).
"""
import difflib
import re

from . import db

HONORIFICS = {
    "anna", "akka", "bhai", "bhaiya", "bhaiyya", "ji", "didi", "aunty", "auntie", "uncle", "sir", "madam",
    "amma", "ayya", "garu", "sahab", "saab", "thambi", "mama", "chacha", "kaka", "ku", "ka", "ki", "ke", "ne",
    "जी", "भाई", "दीदी", "அண்ணா", "அக்கா",
}


def norm(text: str) -> str:
    text = (text or "").lower().replace("-", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _aliases(row: dict) -> list[str]:
    al = [norm(row["name"])] + [norm(a) for a in row["aliases"].split(",")]
    return [a for a in dict.fromkeys(al) if a]


def _contains(text: str, alias: str) -> bool:
    if alias.isascii():
        return re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text) is not None
    return alias in text


def _resolve(name: str, rows: list[dict], strip_honorifics: bool = False) -> tuple[dict | None, list[str]]:
    n = norm(name)
    if strip_honorifics:
        n = " ".join(w for w in n.split() if w not in HONORIFICS) or n
    if not n:
        return None, []
    index = [(a, r) for r in rows for a in _aliases(r)]
    for a, r in index:
        if a == n:
            return r, []
    # alias appears inside the spoken phrase ("ponni arisi" -> rice), longest alias wins
    hits = sorted(((a, r) for a, r in index if _contains(n, a)), key=lambda x: -len(x[0]))
    if hits:
        return hits[0][1], []
    close = difflib.get_close_matches(n, [a for a, _ in index], n=3, cutoff=0.72)
    if close:
        return next(r for a, r in index if a == close[0]), []
    # word-level fuzzy ("muruganukku" -> murugan)
    for word in n.split():
        for a, r in index:
            if len(a) >= 4 and (word.startswith(a) or difflib.SequenceMatcher(None, word, a).ratio() > 0.82):
                return r, []
    return None, [r["name"] for r in rows][:8]


def resolve_customer(name: str) -> tuple[dict | None, list[str]]:
    return _resolve(name, db.customers(), strip_honorifics=True)


def resolve_product(name: str) -> tuple[dict | None, list[str]]:
    return _resolve(name, db.products())


def retrieve_context(utterance: str) -> str:
    """RAG step: find catalog items + customers mentioned in this utterance and return a compact fact sheet."""
    text = norm(utterance)
    if not text:
        return ""
    lines = []
    for p in db.products():
        if any(_contains(text, a) for a in _aliases(p)):
            low = " LOW STOCK" if p["stock"] <= p["low_stock_threshold"] else ""
            lines.append(f"- product {p['name']}: Rs {p['price']:g}/{p['unit']}, stock {p['stock']:g} {p['unit']}{low}")
    words = [w for w in text.split() if w not in HONORIFICS]
    for c in db.customers():
        als = _aliases(c)
        if any(_contains(text, a) for a in als) or any(
            difflib.SequenceMatcher(None, w, a).ratio() > 0.85 for w in words for a in als if len(a) >= 4
        ):
            lines.append(f"- customer {c['name']} (speaks {c['language']}): balance due Rs {db.balance(c['id']):g}")
    return "\n".join(lines)


def catalog_summary() -> str:
    ps = ", ".join(f"{p['name']} (Rs {p['price']:g}/{p['unit']})" for p in db.products())
    cs = ", ".join(c["name"] for c in db.customers())
    return f"Products: {ps}.\nCustomers: {cs}."
