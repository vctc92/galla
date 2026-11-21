"""SQLite storage + seed data. All SQL lives in this file (swap for Postgres here if needed)."""
import json
import sqlite3
import threading
import time

from . import config

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'hi', telegram_chat_id TEXT, phone TEXT
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL, price REAL NOT NULL, stock REAL NOT NULL, low_stock_threshold REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, items_json TEXT NOT NULL DEFAULT '[]',
  amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN ('credit','payment')),
  method TEXT, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders(
  id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, amount REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','paid','cancelled')),
  followups_sent INTEGER NOT NULL DEFAULT 0, next_followup_at REAL,
  created_at REAL NOT NULL, paid_at REAL
);
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY, text TEXT NOT NULL, kind TEXT NOT NULL, meta_json TEXT, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation(
  id INTEGER PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, lang TEXT,
  tools_json TEXT, source TEXT, created_at REAL NOT NULL
);
"""

DAY = 86400

# name, aliases, language, opening balance, days ago
SEED_CUSTOMERS = [
    ("Ramesh", "ramesh,ramesh bhai,ramesh ji,rameshji,रमेश", "hi", 450, 9),
    ("Murugan", "murugan,murugan anna,muruga,murugesan,முருகன்", "ta", 950, 16),
    ("Priya", "priya,priya akka,priyaa,பிரியா,प्रिया", "ta", 300, 4),
    ("Sunita", "sunita,sunita didi,sunita aunty,sunitha,सुनीता", "hi", 0, 0),
]

# name, aliases, unit, price, stock, low threshold
SEED_PRODUCTS = [
    ("Rice", "rice,chawal,chaawal,arisi,ponni,basmati,चावल,அரிசி", "kg", 60, 50, 10),
    ("Surf Excel", "surf,surf excel,detergent,washing powder,सर्फ,சர்ஃப்", "packet", 110, 3, 5),
    ("Sunflower Oil", "oil,tel,tael,ennai,yennai,sunflower oil,refined,तेल,எண்ணெய்", "litre", 150, 20, 5),
    ("Milk", "milk,doodh,dudh,paal,pal,दूध,பால்", "packet", 30, 40, 10),
    ("Sugar", "sugar,cheeni,chini,shakkar,sakkarai,சர்க்கரை,चीनी", "kg", 45, 25, 5),
    ("Toor Dal", "dal,daal,toor dal,arhar,paruppu,thuvaram paruppu,दाल,பருப்பு", "kg", 140, 15, 4),
    ("Atta", "atta,aata,wheat flour,gehun,godhumai maavu,maavu,आटा,கோதுமை மாவு", "kg", 50, 30, 8),
    ("Salt", "salt,namak,uppu,नमक,உப்பு", "packet", 25, 20, 5),
    ("Tea Powder", "tea,chai,chai patti,chai patti,tea powder,theyilai,tea thool,चाय,டீ", "packet", 120, 12, 4),
    ("Bread", "bread,pav,double roti,bun,ब्रेड,ரொட்டி", "packet", 40, 10, 3),
    ("Eggs", "egg,eggs,anda,ande,muttai,अंडा,முட்டை", "piece", 7, 60, 12),
    ("Parle-G Biscuit", "biscuit,biscuits,parle,parle g,parle-g,बिस्कुट,பிஸ்கட்", "packet", 10, 50, 10),
    ("Soap", "soap,sabun,sopu,lux,साबुन,சோப்பு", "piece", 35, 20, 5),
    ("Onion", "onion,pyaz,pyaaz,kanda,vengayam,प्याज,வெங்காயம்", "kg", 40, 30, 8),
]


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def q(sql: str, args: tuple = ()) -> list[dict]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    rows = q(sql, args)
    return rows[0] if rows else None


def ex(sql: str, args: tuple = ()) -> int:
    with _lock:
        cur = conn().execute(sql, args)
        return cur.lastrowid


def init(reset: bool = False) -> None:
    with _lock:
        c = conn()
        if reset:
            for t in ("customers", "products", "ledger", "reminders", "activity", "conversation"):
                c.execute(f"DROP TABLE IF EXISTS {t}")
        c.executescript(SCHEMA)
        if not one("SELECT id FROM customers LIMIT 1"):
            _seed()


def _seed() -> None:
    now = time.time()
    for name, aliases, lang, opening, days_ago in SEED_CUSTOMERS:
        cid = ex("INSERT INTO customers(name, aliases, language) VALUES (?,?,?)", (name, aliases, lang))
        if opening:
            ex(
                "INSERT INTO ledger(customer_id, items_json, amount, type, method, created_at) VALUES (?,?,?,?,?,?)",
                (cid, json.dumps([{"name": "Opening balance", "qty": 1, "unit": "", "price": opening, "subtotal": opening}]),
                 opening, "credit", "opening", now - days_ago * DAY),
            )
    for name, aliases, unit, price, stock, low in SEED_PRODUCTS:
        ex(
            "INSERT INTO products(name, aliases, unit, price, stock, low_stock_threshold) VALUES (?,?,?,?,?,?)",
            (name, aliases, unit, price, stock, low),
        )
    log_activity("Galla ready. Bahi-khata loaded with 4 customers and 14 products.", "system")


# ---------- helpers used by tools + API ----------

def log_activity(text: str, kind: str, meta: dict | None = None) -> int:
    return ex(
        "INSERT INTO activity(text, kind, meta_json, created_at) VALUES (?,?,?,?)",
        (text, kind, json.dumps(meta or {}, ensure_ascii=False), time.time()),
    )


def log_turn(role: str, text: str, lang: str | None, source: str, tools: list | None = None) -> int:
    return ex(
        "INSERT INTO conversation(role, text, lang, tools_json, source, created_at) VALUES (?,?,?,?,?,?)",
        (role, text, lang, json.dumps(tools or [], ensure_ascii=False), source, time.time()),
    )


def balance(customer_id: int) -> float:
    r = one(
        "SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0) AS b FROM ledger WHERE customer_id=?",
        (customer_id,),
    )
    return round(r["b"], 2) if r else 0.0


def customers() -> list[dict]:
    return q("SELECT * FROM customers ORDER BY name")


def products() -> list[dict]:
    return q("SELECT * FROM products ORDER BY name")


def start_of_today() -> float:
    t = time.localtime()
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))
