import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, ShieldCheck, Smartphone, Store } from 'lucide-react'
import { api } from '../lib/api'
import { inr } from '../lib/format'

const T = {
  hi: { req: 'भुगतान अनुरोध', from: 'से', items: 'सामान', pay: 'UPI से भुगतान करें', app: 'UPI ऐप में खोलें', done: 'भुगतान हो गया!', thanks: 'धन्यवाद! दुकानदार को सूचना भेज दी गई है।', processing: 'भुगतान हो रहा है…' },
  ta: { req: 'பணம் செலுத்த கோரிக்கை', from: '', items: 'பொருட்கள்', pay: 'UPI மூலம் செலுத்துங்கள்', app: 'UPI app-ல் திற', done: 'பணம் செலுத்தப்பட்டது!', thanks: 'நன்றி! கடைக்காரருக்கு தகவல் அனுப்பப்பட்டது.', processing: 'செலுத்துகிறது…' },
  en: { req: 'Payment request', from: 'from', items: 'Items', pay: 'Pay with UPI', app: 'Open in UPI app', done: 'Payment done!', thanks: 'Thank you! The shopkeeper has been notified.', processing: 'Processing…' },
}

export default function Pay({ id }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const [stage, setStage] = useState('ready') // ready | paying | done

  useEffect(() => {
    api.get(`/api/pay/${id}`).then((d) => { setInfo(d); if (d.status === 'paid') setStage('done') }).catch((e) => setErr(e.message))
  }, [id])

  async function pay() {
    setStage('paying')
    const [r] = await Promise.all([api.post(`/api/pay/${id}/confirm`), new Promise((res) => setTimeout(res, 1400))])
    if (r.ok) setStage('done')
  }

  if (err) return <div className="grid h-full place-items-center bg-stone-50 p-6 text-center text-stone-600">{err}</div>
  if (!info) return <div className="grid h-full place-items-center bg-stone-50"><LoaderCircle className="animate-spin text-stone-400" /></div>
  const t = T[info.language] || T.en

  return (
    <div className="min-h-full bg-gradient-to-b from-amber-50 to-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-5 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-marigold-400 to-marigold-600 text-white shadow-lg"><Store /></div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500">{t.req}</div>
            <div className="font-display text-xl font-bold">{info.shop}</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.1 }}
          className="relative mt-6 overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_-20px_rgba(120,80,0,.35)]">
          <AnimatePresence mode="wait">
            {stage !== 'done' ? (
              <motion.div key="due" exit={{ opacity: 0, scale: 0.9 }}>
                <div className="text-sm text-stone-500">{info.customer} {t.from}</div>
                <div className="font-display text-6xl font-extrabold tracking-tight">{inr(info.amount)}</div>
                {info.items.length > 0 && (
                  <div className="mt-4 border-t border-dashed border-stone-200 pt-3">
                    <div className="text-xs uppercase tracking-widest text-stone-400">{t.items}</div>
                    <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                      {info.items.map((it, i) => (
                        <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.06 }}>• {it}</motion.li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
                <SuccessTick />
                <div className="mt-3 font-display text-2xl font-bold text-leaf-500">{t.done}</div>
                <div className="font-display text-4xl font-extrabold">{inr(info.amount)}</div>
                <div className="mt-2 text-sm text-stone-500">{t.thanks}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex-1" />

        {stage !== 'done' && (
          <div className="space-y-3">
            <motion.button onClick={pay} disabled={stage === 'paying'} whileTap={{ scale: 0.96 }}
              className="relative w-full overflow-hidden rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white shadow-xl disabled:opacity-90">
              {stage === 'paying' && (
                <motion.div className="absolute inset-y-0 left-0 bg-leaf-500" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
              )}
              <span className="relative flex items-center justify-center gap-2">
                {stage === 'paying' ? <><LoaderCircle className="animate-spin" size={20} /> {t.processing}</> : <>{t.pay} · {inr(info.amount)}</>}
              </span>
            </motion.button>
            <a href={info.upi_link} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-300 py-3 text-sm font-medium text-stone-700">
              <Smartphone size={16} /> {t.app}
            </a>
            <div className="flex items-center justify-center gap-1 text-[11px] text-stone-400"><ShieldCheck size={12} /> Sandbox payment · Powered by Galla</div>
          </div>
        )}
      </div>
    </div>
  )
}

function SuccessTick() {
  return (
    <motion.svg width="96" height="96" viewBox="0 0 96 96" className="mx-auto">
      <motion.circle cx="48" cy="48" r="44" fill="#22c57a" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }} />
      <motion.path d="M28 50 L42 63 L69 34" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45, ease: 'easeOut' }} />
    </motion.svg>
  )
}
