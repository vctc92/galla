import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, Minus, PackageCheck, Plus, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo'
import GroceryBackdrop from '../components/GroceryBackdrop'
import { api } from '../lib/api'

/**
 * Supplier delivery confirmation (sandbox) — the stock-side twin of the customer pay page.
 * The supplier opens this from the Telegram order message, adjusts the quantity if it's a short
 * delivery, and confirms. The shop's stock updates and the shopkeeper is alerted.
 */
export default function Supply({ id }) {
  const [info, setInfo] = useState(null)
  const [qty, setQty] = useState(0)
  const [err, setErr] = useState(null)
  const [stage, setStage] = useState('ready') // ready | saving | done
  const [result, setResult] = useState(null)

  useEffect(() => {
    api.get(`/api/supply/${id}`).then((d) => {
      setInfo(d); setQty(d.qty)
      if (d.status === 'delivered') { setStage('done'); setResult({ delivered_qty: d.delivered_qty, stock: d.stock }) }
    }).catch((e) => setErr(e.message))
  }, [id])

  const step = info?.whole_units ? 1 : 0.5
  const valid = qty > 0 && (!info?.whole_units || Number.isInteger(qty))

  async function confirm() {
    setStage('saving'); setErr(null)
    try {
      const [r] = await Promise.all([api.post(`/api/supply/${id}/confirm`, { delivered_qty: qty }), new Promise((res) => setTimeout(res, 900))])
      setResult(r); setStage('done')
    } catch (e) {
      setErr(e.message); setStage('ready')
    }
  }

  if (err && !info) return <div className="grid h-full place-items-center p-6 text-center text-muted">{err}</div>
  if (!info) return <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-subtle" /></div>

  return (
    <div className="relative min-h-full">
      <GroceryBackdrop opacity={0.05} cols={3} rows={5} />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-sm flex-col px-5 pb-6 pt-8">
        <Logo size={34} sub="Supplier delivery · सप्लायर डिलीवरी" />

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 overflow-hidden" aria-live="polite">
          <AnimatePresence mode="wait">
            {stage !== 'done' ? (
              <motion.div key="order" exit={{ opacity: 0 }} className="p-6">
                <div className="text-[14px] text-muted">Order from {info.shop}</div>
                <div className="mt-4 label">Ordered</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[44px] font-bold leading-none tracking-tight">{info.qty}</span>
                  <span className="text-[18px] text-muted">{info.unit}</span>
                </div>
                <div className="mt-1 text-[18px] font-semibold">{info.product}</div>
                <div className="mt-1 text-[13px] text-subtle">Shop's current stock: {info.stock} {info.unit}</div>

                <div className="mt-6 border-t border-dashed border-line pt-4">
                  <label htmlFor="qty" className="label">Delivering now</label>
                  <div className="mt-2 flex items-center gap-3">
                    <button onClick={() => setQty((q) => Math.max(step, +(q - step).toFixed(2)))} aria-label="Less"
                      className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface text-ink hover:border-brand-200"><Minus size={18} /></button>
                    <input id="qty" type="number" inputMode="decimal" min={step} step={step} value={qty}
                      onChange={(e) => setQty(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface text-center text-[22px] font-bold outline-none focus:border-brand-500" />
                    <button onClick={() => setQty((q) => +(q + step).toFixed(2))} aria-label="More"
                      className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface text-ink hover:border-brand-200"><Plus size={18} /></button>
                  </div>
                  <p className="mt-2 text-[13px] text-muted">
                    {qty < info.qty && qty > 0 ? `Short delivery: ${+(info.qty - qty).toFixed(2)} ${info.unit} less than ordered.` : 'Change this if you are delivering a different amount.'}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
                <svg width="72" height="72" viewBox="0 0 72 72" className="mx-auto" aria-hidden>
                  <motion.circle cx="36" cy="36" r="34" fill="var(--color-ok)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 16 }} />
                  <motion.path d="M22 37 L32 47 L51 26" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }} />
                </svg>
                <div className="mt-4 text-[18px] font-semibold text-ok">Delivery confirmed</div>
                <div className="mt-1 text-[32px] font-bold leading-tight tracking-tight">{result?.delivered_qty} {info.unit} {info.product}</div>
                <p className="mt-3 text-[14px] text-muted">The shop's stock is now <b className="text-ink">{result?.stock} {info.unit}</b>. The shopkeeper has been notified.</p>
                <p className="mt-1 text-[13px] text-subtle">धन्यवाद! दुकान का स्टॉक अपडेट हो गया।</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <div className="flex-1" />

        {stage !== 'done' && (
          <div className="mt-8 space-y-3">
            {err && <p role="alert" className="text-center text-[14px] text-bad">{err}</p>}
            <button onClick={confirm} disabled={stage === 'saving' || !valid}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-[17px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(31,94,255,.7)] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
              {stage === 'saving' ? <><LoaderCircle className="animate-spin" size={18} /> Updating stock…</> : <><PackageCheck size={20} /> Confirm delivery · {qty} {info.unit}</>}
            </button>
            <p className="flex items-center justify-center gap-1 text-[12px] text-subtle"><ShieldCheck size={13} /> Sandbox delivery confirmation · Powered by Galla</p>
          </div>
        )}
      </main>
    </div>
  )
}
