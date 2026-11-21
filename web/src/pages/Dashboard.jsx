import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, BellRing, Boxes, Clock, HandCoins, MessageCircle, Receipt, RotateCcw, Timer, User, Wallet, Bot } from 'lucide-react'
import Logo from '../components/Logo'
import AnimatedNumber from '../components/AnimatedNumber'
import { kind } from '../components/kinds'
import { api } from '../lib/api'
import { inr, timeAgo } from '../lib/format'
import { useLiveState, useNow } from '../lib/useLiveState'

const STATUS = {
  paid: { label: 'Paid today', cls: 'bg-leaf-500/20 text-leaf-400 ring-leaf-500/40' },
  clear: { label: 'Clear', cls: 'bg-white/5 text-slate-400 ring-white/10' },
  reminded: { label: 'Reminder sent', cls: 'bg-peacock-500/15 text-peacock-400 ring-peacock-500/40' },
  overdue: { label: 'Long pending', cls: 'bg-chilli-500/15 text-chilli-400 ring-chilli-500/40' },
  due: { label: 'Due', cls: 'bg-marigold-500/15 text-marigold-400 ring-marigold-500/40' },
}

export default function Dashboard() {
  const { state, error, fresh } = useLiveState(1000)
  const now = useNow()
  const [celebrate, setCelebrate] = useState(null)

  // Big celebration when a UPI payment lands.
  useEffect(() => {
    if (!state) return
    const hit = state.activity.find((a) => fresh.has(a.id) && a.kind === 'payment')
    if (hit) {
      setCelebrate({ id: hit.id, customer: hit.meta.customer, amount: hit.meta.amount })
      const t = setTimeout(() => setCelebrate(null), 4200)
      return () => clearTimeout(t)
    }
  }, [fresh, state])

  if (!state) {
    return <div className="grid h-full place-items-center text-slate-400">{error ? `Backend not reachable: ${error}` : 'Loading Galla…'}</div>
  }
  const n = state.numbers
  const lastUser = [...state.conversation].reverse().find((m) => m.role === 'user')
  const lastBot = [...state.conversation].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="grain relative min-h-full">
      <div className="relative z-10 mx-auto max-w-[1500px] px-6 py-5">
        <header className="flex items-center justify-between">
          <Logo size={44} sub={`${state.shop.name} · Voice Bahi-Khata`} />
          <div className="flex items-center gap-4">
            <LivePill />
            <div className="flex items-center gap-1.5 font-display text-xl tabular-nums text-slate-300">
              <Clock size={18} /> {new Date(now * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        </header>

        {/* KPIs */}
        <section className="mt-5 grid grid-cols-4 gap-4">
          <Kpi icon={Receipt} label="Udhaar given today" value={n.credit_given} tone="text-marigold-300" sub={`${n.credit_entries} entries`} />
          <Kpi icon={HandCoins} label="Recovered today" value={n.recovered} tone="text-leaf-400" sub={`${n.payments} payments`} />
          <Kpi icon={Wallet} label="Total outstanding" value={n.outstanding} tone="text-slate-50" sub={`${state.customers.filter((c) => c.balance > 0).length} customers owe`} />
          <Kpi icon={BellRing} label="Reminders today" value={n.reminders_sent} prefix="" tone="text-peacock-400" sub="auto follow-up on" />
        </section>

        <section className="mt-5 grid grid-cols-12 gap-5">
          {/* Ledger */}
          <Panel className="col-span-5" icon={Wallet} title="Ledger · Bahi-Khata">
            <div className="space-y-2">
              {state.customers.map((c) => <LedgerRow key={c.id} c={c} now={now} />)}
            </div>
          </Panel>

          {/* Conversation + stock */}
          <div className="col-span-4 space-y-5">
            <Panel icon={MessageCircle} title="Live conversation">
              <AnimatePresence mode="popLayout">
                {lastUser ? (
                  <motion.div key={lastUser.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5">
                    <div className="flex gap-2">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marigold-500 text-ink-900"><User size={14} /></div>
                      <div className="text-[17px] leading-snug text-slate-100">“{lastUser.text}”</div>
                    </div>
                    {lastBot && lastBot.id > lastUser.id && (
                      <motion.div key={lastBot.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-peacock-500 text-ink-900"><Bot size={14} /></div>
                        <div>
                          <div className="text-[17px] leading-snug text-peacock-400">{lastBot.text}</div>
                          {lastBot.tools?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {lastBot.tools.map((t, i) => (
                                <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }}
                                  className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 ring-1 ring-white/10">
                                  ⚙ {t.tool}
                                </motion.span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                ) : <div className="text-slate-500">Waiting for the shopkeeper to speak…</div>}
              </AnimatePresence>
            </Panel>

            <Panel icon={Boxes} title="Stock">
              <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
                {state.products.map((p) => <StockBar key={p.id} p={p} />)}
              </div>
            </Panel>
          </div>

          {/* Activity feed */}
          <Panel className="col-span-3" icon={Activity} title="Activity">
            <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {state.activity.slice(0, 14).map((a) => {
                  const k = kind(a.kind)
                  const Icon = k.icon
                  return (
                    <motion.div key={a.id} layout
                      initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      className={`relative flex gap-2.5 overflow-hidden rounded-xl bg-white/[0.03] p-2.5 ring-1 ${k.ring}`}>
                      {fresh.has(a.id) && <motion.div className={`absolute inset-0 ${k.bg}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2.2 }} />}
                      <div className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg ${k.bg} ${k.color}`}><Icon size={16} /></div>
                      <div className="relative min-w-0">
                        <div className="text-[13px] leading-snug">{a.text}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">{timeAgo(a.created_at, now)}</div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </Panel>
        </section>

        <footer className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <div>Speak on the shopkeeper app → updates land here live · ASR {state.integrations.asr_vendor} · LLM {state.integrations.llm_model} · TTS Murf Falcon</div>
          <button onClick={async () => { if (confirm('Reset demo data?')) await api.post('/api/reset') }}
            className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5"><RotateCcw size={12} /> reset demo</button>
        </footer>
      </div>

      <AnimatePresence>{celebrate && <Celebration key={celebrate.id} {...celebrate} />}</AnimatePresence>
    </div>
  )
}

function LivePill() {
  return (
    <div className="flex items-center gap-2 rounded-full bg-leaf-500/15 px-3 py-1.5 text-sm font-semibold text-leaf-400 ring-1 ring-leaf-500/30">
      <span className="relative flex h-2.5 w-2.5">
        <motion.span className="absolute inset-0 rounded-full bg-leaf-400" animate={{ scale: [1, 2.4], opacity: [0.7, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />
        <span className="relative h-2.5 w-2.5 rounded-full bg-leaf-400" />
      </span>
      LIVE
    </div>
  )
}

function Panel({ icon: Icon, title, children, className = '' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`glass rounded-3xl p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400"><Icon size={14} /> {title}</div>
      {children}
    </motion.div>
  )
}

function Kpi({ icon: Icon, label, value, tone, sub, prefix = '₹' }) {
  return (
    <motion.div whileHover={{ y: -3 }} className="glass rounded-3xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400"><Icon size={14} /> {label}</div>
      <AnimatedNumber value={value} prefix={prefix} className={`mt-1 block font-display text-4xl font-bold tabular-nums ${tone}`} />
      <div className="text-xs text-slate-500">{sub}</div>
    </motion.div>
  )
}

function LedgerRow({ c, now }) {
  const prev = useRef(c.balance)
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    if (prev.current !== c.balance) {
      setFlash({ up: c.balance > prev.current, k: Date.now() })
      prev.current = c.balance
    }
  }, [c.balance])
  const st = STATUS[c.status] || STATUS.due
  const followIn = c.next_followup_at ? Math.max(0, Math.round(c.next_followup_at - now)) : null

  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
      {flash && <motion.div key={flash.k} className={`absolute inset-0 ${flash.up ? 'bg-marigold-500/30' : 'bg-leaf-500/35'}`}
        initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2 }} />}
      <div className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-700 font-display text-lg font-bold">{c.name[0]}</div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{c.name}</span>
          <span className="rounded bg-white/5 px-1 text-[10px] uppercase text-slate-400">{c.language === 'ta' ? 'தமிழ்' : 'हिंदी'}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {c.balance > 0 && c.days_pending > 0 && <span>{c.days_pending}d pending</span>}
          {followIn !== null && (
            <span className="flex items-center gap-1 text-peacock-400"><Timer size={11} /> follow-up in {followIn}s</span>
          )}
        </div>
      </div>
      <motion.span layout className={`relative rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.cls}`}>{st.label}</motion.span>
      <AnimatedNumber value={c.balance} className={`relative w-24 text-right font-display text-xl font-bold tabular-nums ${c.balance > 0 ? 'text-slate-50' : 'text-leaf-400'}`} />
    </motion.div>
  )
}

function StockBar({ p }) {
  const cap = Math.max(p.low_stock_threshold * 5, 20)
  const pct = Math.min(100, (p.stock / cap) * 100)
  return (
    <div>
      <div className="flex justify-between text-[12px]">
        <span className={p.low ? 'font-semibold text-chilli-400' : 'text-slate-300'}>{p.name}</span>
        <span className="tabular-nums text-slate-500">{p.stock} {p.unit}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div className={`h-full rounded-full ${p.low ? 'bg-chilli-500' : 'bg-gradient-to-r from-peacock-500 to-leaf-400'}`}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
      </div>
    </div>
  )
}

function Celebration({ customer, amount }) {
  const coins = Array.from({ length: 22 }, (_, i) => ({
    x: (Math.random() - 0.5) * 900, y: -200 - Math.random() * 400, r: Math.random() * 720 - 360, d: Math.random() * 0.3, i,
  }))
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {coins.map((c) => (
        <motion.div key={c.i} className="absolute grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-marigold-300 to-marigold-600 font-bold text-ink-900 shadow-lg"
          initial={{ x: 0, y: 0, scale: 0 }} animate={{ x: c.x, y: [0, c.y, c.y + 700], rotate: c.r, scale: 1 }}
          transition={{ duration: 2.6, delay: c.d, ease: 'easeOut' }}>₹</motion.div>
      ))}
      <motion.div className="relative rounded-[2rem] bg-gradient-to-br from-leaf-400 to-leaf-500 px-14 py-10 text-center text-ink-900 shadow-[0_0_120px_rgba(34,197,122,.5)]"
        initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
        <div className="text-lg font-semibold uppercase tracking-widest">Payment received</div>
        <div className="font-display text-7xl font-extrabold">{inr(amount)}</div>
        <div className="mt-1 text-2xl font-semibold">from {customer} via UPI</div>
        <div className="mt-2 text-sm opacity-80">Shopkeeper notified on Telegram ✓</div>
      </motion.div>
    </motion.div>
  )
}
