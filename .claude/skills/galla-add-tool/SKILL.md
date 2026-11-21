---
name: galla-add-tool
description: Add or change an agent tool (a business action the voice assistant can perform, e.g. returns, discounts, supplier orders, customer creation) in Galla. Use whenever a new voice command or capability needs backend logic the LLM can call.
---

# Add a tool to Galla

Tool calling is hand-written on the plain OpenAI SDK (`backend/llm_proxy.py`). **Do not introduce LangChain/LangGraph or any agent framework.** A tool has three parts plus a test.

## 1. Implement it in `backend/tools.py`
```python
async def my_tool(customer_name: str, amount: float) -> dict:
    cust, sugg = catalog.resolve_customer(customer_name)      # always resolve names via catalog
    if not cust:
        return _not_found("customer", customer_name, sugg)    # lets the LLM ask a short question
    ...                                                       # DB work via db.q / db.one / db.ex
    db.log_activity(f"… {_inr(amount)} …", "payment", {"customer": cust["name"]})  # REQUIRED: drives dashboard/app
    return {"ok": True, "customer": cust["name"], ...}        # compact facts the LLM will speak from
```
Rules:
- `async def`, keyword args matching the schema, returns a dict with `ok`. Never raise; `tools.execute` catches errors, but return clear errors yourself.
- Resolve products with `catalog.resolve_product` (handles arisi/chawal/चावल). Add new regional aliases in `db.SEED_PRODUCTS`, not in the tool.
- Every user-visible effect gets `db.log_activity(text, kind)` with kind in `credit|payment|reminder|stock|alert|system`. A new kind also needs an entry in `web/src/components/kinds.js`.
- Outbound messages go through `notify.send(...)` with a template in `notify.TEMPLATES` for `hi`, `ta` and `en`. Never send LLM-written text to customers.
- Register it in `REGISTRY` at the bottom of `tools.py`.

## 2. Schema in `backend/prompts.py`
Append to `TOOL_SCHEMAS` using `_fn(name, description, props, required)`. Reuse `_customer` / `_product`. The description should say *when* to use the tool.

## 3. Teach the trigger phrases in `SYSTEM_PROMPT` (`prompts.py`)
Add one DATA RULES line mapping Hinglish **and** Tanglish phrasings to the tool, e.g. `- "wapas kar diya", "thirumbi koduthaanga" -> return_item.` Keep the prompt short; it is resent on every turn.

## 4. Verify
- Add a keyword branch for the new tool in `scripts/fake_openai.py` `_pick_tool` and a check in `scripts/smoke_offline.sh`, then run `./scripts/smoke_offline.sh`.
- If an OpenAI key is configured and the user agrees, run a live check in both languages:
  `curl -s -X POST localhost:8000/api/chat -H 'content-type: application/json' -d '{"message":"<hinglish phrase>","lang":"hi"}'`
  and confirm `actions[].tool` is the new tool and the reply is 1–2 sentences.
- If the tool changes data the dashboard shows, make sure `/api/state` in `backend/main.py` exposes it.
