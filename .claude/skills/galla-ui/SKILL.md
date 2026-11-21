---
name: galla-ui
description: Build or change Galla's React screens (shopkeeper voice app /app, projector dashboard /dashboard, customer pay page /pay/:id, supplier delivery page /supply/:id, home /). Use for any frontend, styling, animation, or layout work in web/.
---

# Galla UI conventions

Stack is fixed: **React 19 + Vite + Tailwind v4 + Motion + lucide-react, plain JSX**. No TypeScript, router lib, state lib, component kit or CSS-in-JS. Ask before adding any npm package.

## Structure
- Routing: path switch in `web/src/App.jsx`. A new route also needs nothing on the backend, because FastAPI's SPA fallback serves `index.html` for unknown paths.
- Data: `useLiveState()` (`web/src/lib/useLiveState.js`) polls `/api/state` every second and returns `{ state, fresh }`, where `fresh` is the set of new activity ids (use it for flash/celebration effects). Mutations go through `api.post` in `web/src/lib/api.js`. New data shown on screen belongs in `/api/state` (`backend/main.py`), not in new polling endpoints.
- Shared pieces: `AnimatedNumber` (spring-counting ₹), `VoiceOrb` (mic: idle/listening/thinking/speaking), `Logo` (tarazu mark), `GroceryBackdrop`, `kinds.js` (activity kind → icon/colour, `toolLabel`).
- `agora-rtc-sdk-ng` is ~1.5 MB. Keep it **lazy-imported** inside ShopApp only.

## Look and feel (light, minimal, professional)
The user explicitly rejected the earlier dark/glowing "AI-generated" look. Keep it calm, bright and trustworthy:
- **Colour:** pale `canvas` background, white `surface` cards with a 1px `line` border (`.card`), `ink`/`muted`/`subtle` text. **One accent: `brand` blue** for primary actions, Galla's voice and links. Semantic colours only for status: `ok` (paid), `warn` (due / low-ish), `bad` (long pending / low stock). Highlight exceptions, keep healthy states quiet (e.g. healthy stock bars are pale `brand-200`, low stock is `bad`).
- **Never:** dark theme, glows, glassmorphism, gradient text, neon, emoji-heavy UI, confetti. Shadows only on the primary action and modal.
- **Background:** `GroceryBackdrop` (thin lucide kirana icons — tarazu scale, weights, wheat, milk, eggs — drifting very slowly, centre masked out, respects reduced motion). Opacity 0.04–0.07. Don't add other decorative layers.
- **Type:** Figtree for everything (+ Noto Devanagari/Tamil fallback), tabular numbers. `.label` (uppercase, tracked) is for **English** labels only; use `.label-loc` for Hindi/Tamil text (tracking breaks conjuncts).
- **Motion:** purposeful and quick — state changes only (balance changed, payment landed, listening vs speaking, list items entering). Springs, `AnimatePresence`, `layout`, `layoutId` for segmented controls.
- **UX rules:** one primary action per screen (mic on `/app`, Pay on `/pay`); always show system status (listening/thinking/speaking, Live, follow-up countdown); show outcomes in plain words (`toolLabel()` in `kinds.js`, never raw function names); suggestions over recall (sample phrase chips); 40px+ tap targets, aria-labels, visible focus, AA contrast.
- **Layout:** `/app` and `/pay` mobile-first (max-w-md / max-w-sm, safe-area padding, sticky composer). `/dashboard` is responsive: **xl (≥1280px)** = projector layout, 4 KPIs + 3 columns, fits 1600×900 with no page scroll; **lg (1024–1279)** = ledger + conversation/stock side by side, activity full width in 2 columns; **<lg** = single column, KPIs 2-up; **<sm (640)** = ledger status moves under the customer name. Check 1600, 1100, 800 and 500px widths after any dashboard change. Shopkeeper/customer-facing copy in their language (`COPY` in ShopApp, `T` in Pay).

## Verify every UI change
```bash
cd web && npm run build
# backend must be running on :8000 (or the smoke-test backend); then screenshot:
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 --window-size=1600,900 --screenshot=<scratchpad>/dash.png http://localhost:8000/dashboard
"$C" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 --window-size=500,1000 --screenshot=<scratchpad>/app.png http://localhost:8000/app
```
Read the PNGs and check them. Headless Chrome can't go narrower than about 500px, so judge mobile layouts at 500 wide. Save screenshots in the scratchpad, not the repo.
