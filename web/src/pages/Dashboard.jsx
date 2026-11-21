import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, BellRing, Boxes, Check, Clock, HandCoins, MessageSquareText, Receipt, RotateCcw, Timer, Wallet } from 'lucide-react'
import Logo from '../components/Logo'
import AnimatedNumber from '../components/AnimatedNumber'
import GroceryBackdrop from '../components/GroceryBackdrop'
import { kind, toolLabel } from '../components/kinds'
import { api } from '../lib/api'
import { inr, timeAgo } from '../lib/format'
import { useLiveState, useNow } from '../lib/useLiveState'

const STATUS = {
  paid: { label: 'Paid today', dot: 'bg-ok', text: 'text-ok' },
  clear: { label: 'No dues', dot: 'bg-line', text: 'text-subtle' },
  reminded: { label: 'Reminder sent', dot: 'bg-brand-500', text: 'text-brand-600' },
  overdue: { label: 'Long pending', dot: 'bg-bad', text: 'text-bad' },
  due: { label: 'Due', dot: 'bg-warn', text: 'text-warn' },
}

export default function Dashboard() {
  const { state, error, fresh } = useLiveState(1000)
  const now = useNow()
  const [celebrate, setCelebrate] = useState(null)
  const celebrated = useRef(new Set())

  // Payment confirmation overlay — once per activity id (state refreshes every second while `fresh` keeps its ids).
  useEffect(() => {
    if (!state) return
    const hit = state.activity.find((a) => fresh.has(a.id) && a.kind === 'payment' && !celebrated.current.has(a.id))
    if (hit) {
      celebrated.current.add(hit.id)
      setCelebrate({ id: hit.id, customer: hit.meta.customer, amount: hit.meta.amount, method: hit.meta.method, notified: hit.meta.notified })
    }
  }, [fresh, state])

  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(null), 4000)
    return () => clearTimeout(t)
  }, [celebrate?.id])

  if (!state) {
    return <div className="grid h-full place-items-center text-muted">{error ? `Backend not reachable: ${error}` : 'Loading…'}</div>
  }
  const n = state.numbers
  const lastUser = [...state.conversation].reverse().find((m) => m.role === 'user')
  const lastBot = [...state.conversation].reverse().find((m) => m.role === 'assistant')
  const owing = state.customers.filter((c) => c.balance > 0).length

  return (
    <div className="relative min-h-full">
      <GroceryBackdrop opacity={0.045} cols={7} rows={5} duration={120} />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1560px] flex-col px-4 py-4 sm:px-6 sm:py-5 xl:h-dvh xl:px-8 xl:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Logo size={42} sub={`${state.shop.name} · Voice bahi-khata`} />
          <div className="flex items-center gap-4 text-[14px] sm:gap-5 sm:text-[15px]">
            <span className="flex items-center gap-2 font-semibold text-ok">
              <span className="relative flex h-2.5 w-2.5">
                <motion.span className="absolute inset-0 rounded-full bg-ok" animate={{ scale: [1, 2.2], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
                <span className="relative h-2.5 w-2.5 rounded-full bg-ok" />
              </span>
              Live
            </span>
            <span className="flex items-center gap-1.5 font-medium text-muted">
              <Clock size={16} /> {new Date(now * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </header>

        {/* KPIs */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:mt-6 xl:grid-cols-4 xl:gap-5">
          <Kpi icon={Receipt} label="Udhaar given today" value={n.credit_given} sub={`${n.credit_entries} ${n.credit_entries === 1 ? 'entry' : 'entries'}`} />
          <Kpi icon={HandCoins} label="Recovered today" value={n.recovered} tone="text-ok" sub={`${n.payments} ${n.payments === 1 ? 'payment' : 'payments'}`} />
          <Kpi icon={Wallet} label="Total outstanding" value={n.outstanding} sub={`${owing} ${owing === 1 ? 'customer owes' : 'customers owe'}`} />
          <Kpi icon={BellRing} label="Reminders today" value={n.reminders_sent} prefix="" sub="Auto follow-up on" />
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-12 xl:min-h-0 xl:flex-1">
          {/* Ledger */}
          <Panel className="lg:col-span-7 xl:col-span-5" icon={Wallet} title="Ledger">
            <div className="grid grid-cols-[1fr_auto] border-b border-line px-4 pb-2 text-[12px] font-semibold uppercase tracking-wider text-subtle sm:grid-cols-[1fr_150px_110px] sm:px-5">
              <span>Customer</span><span className="hidden sm:block">Status</span><span className="text-right">Balance</span>
            </div>
            <div className="divide-y divide-line">
              {state.customers.map((c) => <LedgerRow key={c.id} c={c} now={now} />)}
            </div>
          </Panel>

          {/* Conversation + stock */}
          <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-5 xl:col-span-4 xl:min-h-0">
            <Panel icon={MessageSquareText} title="Latest request">
              <div className="px-5 pb-5">
                <AnimatePresence mode="wait">
                  {lastUser ? (
                    <motion.div key={lastUser.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <p className="text-[19px] font-medium leading-snug text-ink">“{lastUser.text}”</p>
                      {lastBot && lastBot.id > lastUser.id && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mt-4 border-l-2 border-brand-500 pl-3">
                          <div className="text-[12px] font-semibold uppercase tracking-wider text-brand-600">Galla replied</div>
                          <p className="mt-0.5 text-[16px] leading-snug text-ink">{lastBot.text}</p>
                          {lastBot.tools?.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                              {lastBot.tools.map((t, i) => (
                                <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.12 }}
                                  className="flex items-center gap-2 text-[14px]">
                                  <span className={`grid h-5 w-5 place-items-center rounded-full ${t.ok === false ? 'bg-warn-50 text-warn' : 'bg-ok-50 text-ok'}`}>
                                    <Check size={12} strokeWidth={3} />
                                  </span>
                                  {toolLabel(t.tool)}
                                </motion.li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  ) : <p className="text-[16px] text-subtle">Waiting for the shopkeeper to speak…</p>}
                </AnimatePresence>
              </div>
            </Panel>

            <Panel className="xl:min-h-0 xl:flex-1" icon={Boxes} title="Stock">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 pb-5 min-[420px]:grid-cols-2 sm:px-5">
                {state.products.map((p) => <StockBar key={p.id} p={p} />)}
              </div>
            </Panel>
          </div>

          {/* Activity */}
          <Panel className="lg:col-span-12 xl:col-span-3 xl:min-h-0" icon={Activity} title="Activity">
            <ol className="relative overflow-hidden px-5 pb-4 lg:columns-2 lg:gap-8 xl:min-h-0 xl:columns-1">
              <span aria-hidden className="absolute bottom-4 left-[29px] top-1 w-px bg-line lg:hidden xl:block" />
              <AnimatePresence initial={false}>
                {state.activity.slice(0, 11).map((a) => {
                  const k = kind(a.kind)
                  return (
                    <motion.li key={a.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }} className="relative flex break-inside-avoid gap-3 py-2">
                      <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface ${k.dot}`} />
                      <div className="min-w-0">
                        <div className={`text-[14px] leading-snug ${fresh.has(a.id) ? 'font-semibold' : ''}`}>{a.text}</div>
                        <div className="mt-0.5 text-[12px] text-subtle">{k.label} · {timeAgo(a.created_at, now)}</div>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ol>
          </Panel>
        </section>

        <footer className="mt-4 flex flex-col-reverse items-start gap-2 text-[12px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>Speech: Agora ConvoAI ({state.integrations.asr_vendor}) · Reasoning: {state.integrations.llm_model} · Voice: Murf Falcon</span>
          <button onClick={async () => { if (confirm('Reset demo data?')) await api.post('/api/reset') }}
            className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface hover:text-muted"><RotateCcw size={12} /> Reset demo</button>
        </footer>
      </div>

      <AnimatePresence>{celebrate && <PaymentToast key={celebrate.id} {...celebrate} onClose={() => setCelebrate(null)} />}</AnimatePresence>
    </div>
  )
}

function Panel({ icon: Icon, title, children, className = '' }) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      <h2 className="label flex items-center gap-2 px-5 pb-3 pt-4"><Icon size={14} /> {title}</h2>
      {children}
    </section>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone = 'text-ink', prefix = '₹' }) {
  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-muted sm:text-[14px]">{label}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={16} /></span>
      </div>
      <AnimatedNumber value={value} prefix={prefix} className={`mt-2 block truncate text-[28px] font-bold leading-none tracking-tight sm:text-[34px] xl:text-[40px] ${tone}`} />
      <div className="mt-2 truncate text-[12px] text-subtle sm:text-[13px]">{sub}</div>
    </div>
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
    <motion.div layout transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="relative grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[1fr_150px_110px] sm:gap-0 sm:px-5">
      {flash && <motion.div key={flash.k} aria-hidden className={`absolute inset-0 ${flash.up ? 'bg-brand-50' : 'bg-ok-50'}`}
        initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2.2 }} />}
      <div className="relative flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-[16px] font-bold text-muted">{c.name[0]}</span>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold">{c.name}</div>
          <div className="truncate text-[13px] text-subtle">
            {c.language === 'ta' ? 'Tamil' : 'Hindi'}{c.balance > 0 && c.days_pending > 0 ? ` · ${c.days_pending} days pending` : ''}
          </div>
          {/* compact status for narrow screens */}
          <span className={`mt-0.5 flex items-center gap-1.5 text-[13px] font-medium sm:hidden ${st.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}{followIn !== null ? ` · ${followIn}s` : ''}
          </span>
        </div>
      </div>
      <div className="relative hidden sm:block">
        <span className={`flex items-center gap-1.5 text-[14px] font-medium ${st.text}`}>
          <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {st.label}
        </span>
        {followIn !== null && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-muted"><Timer size={12} /> Follow-up in {followIn}s</span>
        )}
      </div>
      <AnimatedNumber value={c.balance} className={`relative text-right text-[20px] font-bold ${c.balance > 0 ? 'text-ink' : 'text-ok'}`} />
    </motion.div>
  )
}

function StockBar({ p }) {
  const cap = Math.max(p.low_stock_threshold * 5, 20)
  const pct = Math.min(100, (p.stock / cap) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className={p.low ? 'font-semibold text-bad' : 'text-ink'}>{p.name}{p.low && <span className="ml-1.5 text-[11px] font-semibold uppercase">{p.stock <= 0 ? 'Out' : 'Low'}</span>}</span>
        <span className="text-subtle">{p.stock} {p.unit}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
        <motion.div className={`h-full rounded-full ${p.low ? 'bg-bad' : 'bg-brand-200'}`}
          initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} />
      </div>
    </div>
  )
}

function PaymentToast({ customer, amount, method, notified, onClose }) {
  return (
    <motion.div className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-canvas/60 backdrop-blur-[2px]"
      onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert">
      <motion.div className="card relative w-[min(460px,calc(100vw-2rem))] overflow-hidden p-6 text-center sm:p-8 shadow-[0_30px_80px_-30px_rgba(14,23,38,.35)]"
        initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
        <div className="absolute inset-x-0 top-0 h-1.5 bg-ok" />
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <motion.span className="absolute inset-0 rounded-full bg-ok-50" initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.25, 1] }} transition={{ duration: 0.6 }} />
          <svg width="56" height="56" viewBox="0 0 56 56" className="relative">
            <motion.circle cx="28" cy="28" r="26" fill="var(--color-ok)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }} />
            <motion.path d="M17 29 L25 37 L40 20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }} />
          </svg>
        </div>
        <div className="mt-4 text-[14px] font-semibold uppercase tracking-wider text-ok">Payment received</div>
        <div className="mt-1 text-[44px] font-bold leading-none tracking-tight sm:text-[56px]">{inr(amount)}</div>
        <div className="mt-2 text-[18px] text-muted">from <b className="text-ink">{customer}</b> via {method === 'cash' ? 'cash' : 'UPI'}</div>
        {notified && <div className="mt-4 text-[13px] text-subtle">Shopkeeper notified on Telegram</div>}
      </motion.div>
    </motion.div>
  )
}
