import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, ShieldCheck, Smartphone } from 'lucide-react'
import Logo from '../components/Logo'
import GroceryBackdrop from '../components/GroceryBackdrop'
import { api } from '../lib/api'
import { inr } from '../lib/format'

const T = {
  hi: { req: 'भुगतान अनुरोध', due: 'बकाया राशि', items: 'सामान', pay: 'UPI से भुगतान करें', app: 'UPI ऐप में खोलें', done: 'भुगतान हो गया', thanks: 'धन्यवाद! दुकानदार को सूचना भेज दी गई है।', processing: 'भुगतान हो रहा है…', secure: 'सैंडबॉक्स भुगतान · Galla द्वारा' },
  ta: { req: 'பணம் செலுத்த கோரிக்கை', due: 'செலுத்த வேண்டியது', items: 'பொருட்கள்', pay: 'UPI மூலம் செலுத்துங்கள்', app: 'UPI app-ல் திற', done: 'பணம் செலுத்தப்பட்டது', thanks: 'நன்றி! கடைக்காரருக்கு தகவல் அனுப்பப்பட்டது.', processing: 'செலுத்துகிறது…', secure: 'Sandbox பணம் · Galla' },
  en: { req: 'Payment request', due: 'Amount due', items: 'Items', pay: 'Pay with UPI', app: 'Open in UPI app', done: 'Payment complete', thanks: 'Thank you! The shopkeeper has been notified.', processing: 'Processing…', secure: 'Sandbox payment · Powered by Galla' },
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
    try {
      const [r] = await Promise.all([api.post(`/api/pay/${id}/confirm`), new Promise((res) => setTimeout(res, 1200))])
      setStage(r.ok ? 'done' : 'ready')
    } catch (e) {
      setErr(e.message); setStage('ready')
    }
  }

  if (err && !info) return <div className="grid h-full place-items-center p-6 text-center text-muted">{err}</div>
  if (!info) return <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-subtle" /></div>
  const t = T[info.language] || T.en

  return (
    <div className="relative min-h-full">
      <GroceryBackdrop opacity={0.05} cols={3} rows={5} />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-sm flex-col px-5 pb-6 pt-8">
        <Logo size={34} sub={t.req} />

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="card mt-6 overflow-hidden" aria-live="polite">
          <AnimatePresence mode="wait">
            {stage !== 'done' ? (
              <motion.div key="due" exit={{ opacity: 0 }} className="p-6">
                <div className="text-[14px] text-muted">{info.shop}</div>
                <div className="mt-4 label-loc">{t.due}</div>
                <div className="mt-1 text-[48px] font-bold leading-none tracking-tight">{inr(info.amount)}</div>
                <div className="mt-2 text-[15px] text-muted">{info.customer}</div>
                {info.items.length > 0 && (
                  <div className="mt-5 border-t border-dashed border-line pt-4">
                    <div className="label-loc">{t.items}</div>
                    <ul className="mt-2 space-y-1 text-[15px]">
                      {info.items.map((it, i) => <li key={i} className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-subtle" />{it}</li>)}
                    </ul>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
                <svg width="72" height="72" viewBox="0 0 72 72" className="mx-auto" aria-hidden>
                  <motion.circle cx="36" cy="36" r="34" fill="var(--color-ok)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 16 }} />
                  <motion.path d="M22 37 L32 47 L51 26" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }} />
                </svg>
                <div className="mt-4 text-[18px] font-semibold text-ok">{t.done}</div>
                <div className="mt-1 text-[40px] font-bold leading-none tracking-tight">{inr(info.amount)}</div>
                <p className="mt-3 text-[14px] text-muted">{t.thanks}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <div className="flex-1" />

        {stage !== 'done' && (
          <div className="mt-8 space-y-3">
            {err && <p role="alert" className="text-center text-[14px] text-bad">{err}</p>}
            <button onClick={pay} disabled={stage === 'paying'}
              className="relative h-14 w-full overflow-hidden rounded-xl bg-brand-500 text-[17px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(31,94,255,.7)] transition-colors hover:bg-brand-600 disabled:cursor-wait">
              {stage === 'paying' && <motion.span aria-hidden className="absolute inset-y-0 left-0 bg-brand-700" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.2 }} />}
              <span className="relative flex items-center justify-center gap-2">
                {stage === 'paying' ? <><LoaderCircle className="animate-spin" size={18} /> {t.processing}</> : <>{t.pay} · {inr(info.amount)}</>}
              </span>
            </button>
            <a href={info.upi_link} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[15px] font-medium text-ink hover:border-brand-200">
              <Smartphone size={16} /> {t.app}
            </a>
            <p className="flex items-center justify-center gap-1 text-[12px] text-subtle"><ShieldCheck size={13} /> {t.secure}</p>
          </div>
        )}
      </main>
    </div>
  )
}
