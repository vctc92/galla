"""All configuration lives here. Every other module imports from config, never os.environ."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _get(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


# Agora
AGORA_APP_ID = _get("AGORA_APP_ID")
AGORA_APP_CERT = _get("AGORA_APP_CERT")
AGORA_CUSTOMER_ID = _get("AGORA_CUSTOMER_ID")
AGORA_CUSTOMER_SECRET = _get("AGORA_CUSTOMER_SECRET")
AGORA_API_BASE = _get("AGORA_API_BASE", "https://api.agora.io/api/conversational-ai-agent/v2")

# ASR
ASR_VENDOR = _get("ASR_VENDOR", "ares").lower()
SARVAM_API_KEY = _get("SARVAM_API_KEY")

# Murf
MURF_API_KEY = _get("MURF_API_KEY")
MURF_VOICES = {"hi": _get("MURF_VOICE_HI", "hi-IN-karan"), "ta": _get("MURF_VOICE_TA", "ta-IN-iniya")}
MURF_MODEL = _get("MURF_MODEL", "FALCON")
MURF_WS_URL = _get("MURF_WS_URL", "wss://global.api.murf.ai/v1/speech/stream-input")
MURF_HTTP_URL = _get("MURF_HTTP_URL", "https://global.api.murf.ai/v1/speech/stream")

# LLM
LLM_API_KEY = _get("OPENAI_API_KEY") or _get("LLM_API_KEY")
LLM_BASE_URL = _get("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = _get("LLM_MODEL", "gpt-4.1-mini")

# Telegram
TELEGRAM_BOT_TOKEN = _get("TELEGRAM_BOT_TOKEN")
TG_CHAT_SHOPKEEPER = _get("TG_CHAT_SHOPKEEPER")
TG_CHAT_CUSTOMER = _get("TG_CHAT_CUSTOMER")
TG_CHAT_SUPPLIER_SET = bool(_get("TG_CHAT_SUPPLIER"))
TG_CHAT_SUPPLIER = _get("TG_CHAT_SUPPLIER") or TG_CHAT_SHOPKEEPER  # falls back to the shopkeeper's own chat

# App
PUBLIC_URL = _get("PUBLIC_URL", "http://localhost:8000").rstrip("/")
SHOP_NAME = _get("SHOP_NAME", "Lakshmi Kirana Store")
SHOP_UPI_ID = _get("SHOP_UPI_ID", "lakshmikirana@upi")
REPLY_SCRIPT = _get("REPLY_SCRIPT", "native").lower()
FOLLOWUP_DELAY_SECONDS = int(_get("FOLLOWUP_DELAY_SECONDS", "60"))
MAX_FOLLOWUPS = int(_get("MAX_FOLLOWUPS", "1"))
DB_PATH = Path(_get("DB_PATH", str(ROOT / "galla.db")))
WEB_DIST = ROOT / "web" / "dist"

# Shared secret Agora sends as Bearer token when calling our /llm endpoint.
LLM_PROXY_SECRET = _get("LLM_PROXY_SECRET") or secrets.token_urlsafe(24)

LANGS = {
    "hi": {"label": "Hindi", "bcp47": "hi-IN"},
    "ta": {"label": "Tamil", "bcp47": "ta-IN"},
}


def status() -> dict:
    """Which integrations are configured (shown in the app so setup gaps are obvious)."""
    return {
        "agora": bool(AGORA_APP_ID and AGORA_CUSTOMER_ID and AGORA_CUSTOMER_SECRET),
        "agora_cert": bool(AGORA_APP_CERT),
        "murf": bool(MURF_API_KEY),
        "llm": bool(LLM_API_KEY),
        "telegram": bool(TELEGRAM_BOT_TOKEN),
        "tg_customer": bool(TG_CHAT_CUSTOMER),
        "tg_shopkeeper": bool(TG_CHAT_SHOPKEEPER),
        "public_url_https": PUBLIC_URL.startswith("https://"),
        "asr_vendor": ASR_VENDOR,
        "llm_model": LLM_MODEL,
    }
