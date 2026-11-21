import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Check, Info, Keyboard, Radio, Send, Smartphone, Volume2, VolumeX, X } from 'lucide-react'
import Logo from '../components/Logo'
import VoiceOrb from '../components/VoiceOrb'
import AnimatedNumber from '../components/AnimatedNumber'
import GroceryBackdrop from '../components/GroceryBackdrop'
import { kind, toolLabel } from '../components/kinds'
import { api } from '../lib/api'
import { LANGS, timeAgo } from '../lib/format'
import { useLiveState, useNow } from '../lib/useLiveState'
import { browserVoiceSupported, speak, startBrowserSession } from '../lib/browserVoice'

const COPY = {
  hi: {
    idle: 'बोलने के लिए टैप करें', connecting: 'जुड़ रहा है…', listening: 'सुन रहा हूँ…',
    thinking: 'समझ रहा हूँ…', speaking: 'Galla बोल रहा है', hint: 'जैसे: "Ramesh ne do kilo chawal liya"',
    due: 'कुल उधार बाकी', given: 'आज उधार', got: 'आज वसूली', type: 'या यहाँ लिखें…', recent: 'हाल की एंट्री', try: 'ये बोलकर देखें',
    samples: ['Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein likh do', 'Ramesh ka kitna baaki hai?', 'Ramesh ko reminder bhejo', 'Aaj ka hisaab batao', 'Das packet doodh aaya hai'],
  },
  ta: {
    idle: 'பேச டேப் பண்ணுங்க', connecting: 'இணைக்கிறது…', listening: 'கேட்கிறேன்…',
    thinking: 'புரிஞ்சுக்கிறேன்…', speaking: 'Galla பேசுகிறது', hint: 'உதா: "Murugan anna rendu kilo arisi vaanginaar"',
    due: 'மொத்த பாக்கி', given: 'இன்று கடன்', got: 'இன்று வசூல்', type: 'அல்லது இங்கே டைப் பண்ணுங்க…', recent: 'சமீபத்திய பதிவுகள்', try: 'இப்படி சொல்லிப் பாருங்க',
    samples: ['Murugan anna rendu kilo arisi, oru Surf vaanginaar, kanakku la ezhudhu', 'Murugan ku evvalavu baaki?', 'Murugan ku reminder anuppu', 'Innaiku kanakku sollu', 'Surf anju packet order pannu'],
  },
}

export default function ShopApp() {
  const [lang, setLang] = useState(() => localStorage.getItem('galla.lang') || 'hi')
  const [engine, setEngine] = useState(() => localStorage.getItem('galla.engine') || 'agora')
  const [phase, setPhase] = useState('idle')
  const [levels, setLevels] = useState({ me: 0, agent: 0 })
  const [interim, setInterim] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(true)
  const [toast, setToast] = useState(null)
  const session = useRef(null)
  const { state } = useLiveState(1000)
  const now = useNow()
  const c = COPY[lang]

  useEffect(() => localStorage.setItem('galla.lang', lang), [lang])
  useEffect(() => localStorage.setItem('galla.engine', engine), [engine])
  useEffect(() => () => session.current?.stop(), [])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t) } }, [toast])

  // In Agora mode the phase follows live audio levels.
  const livePhase = engine === 'agora' && phase === 'live' ? (levels.agent > 0.04 ? 'speaking' : 'listening') : phase
  const orbLevel = livePhase === 'speaking' ? levels.agent : levels.me
  const busy = !!session.current

  async function toggle() {
    if (session.current) {
      await session.current.stop()
      session.current = null
      setPhase('idle'); setLevels({ me: 0, agent: 0 }); setInterim('')
      return
    }
    setPhase('connecting')
    try {
      if (engine === 'agora') {
        const { startAgoraSession } = await import('../lib/agoraVoice') // lazy: keeps dashboard/pay pages light
        session.current = await startAgoraSession(lang, { onLevels: setLevels })
        setPhase('live')
      } else {
        if (!browserVoiceSupported) throw new Error('This browser has no speech recognition. Use Chrome.')
        session.current = startBrowserSession(lang, {
          onPhase: setPhase, onLevels: setLevels, onTranscript: setInterim,
          onReply: (r) => { setInterim(''); if (r.error) setToast(r.reply) },
        })
      }
    } catch (e) {
      session.current = null
      setPhase('idle')
      setToast(e.message)
    }
  }

  async function sendText(msg) {
    const m = (msg ?? text).trim()
    if (!m || sending) return
    setText(''); setSending(true)
    try {
      const r = await api.post('/api/chat', { message: m, lang, session_id: 'app-text' })
      if (speakReplies && !session.current) await speak(r.reply, lang, (l) => setLevels({ me: 0, agent: l }))
    } catch (e) {
      setToast(e.message)
    } finally {
      setSending(false)
    }
  }

  const convo = (state?.conversation || []).slice(-4)
  const actions = (state?.activity || []).filter((a) => a.kind !== 'system').slice(0, 4)
  const nums = state?.numbers
  const integ = state?.integrations
  const missing = integ ? Object.entries({ Agora: integ.agora, Murf: integ.murf, OpenAI: integ.llm, Telegram: integ.telegram }).filter(([, v]) => !v).map(([k]) => k) : []

  return (
    <div className="relative min-h-full">
      <GroceryBackdrop opacity={0.06} cols={3} rows={5} />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Logo size={34} sub={state?.shop?.name} />
          <LangToggle lang={lang} disabled={busy} onChange={setLang} onBlocked={() => setToast('Stop the mic to switch language')} />
        </header>

        {missing.length > 0 && (
          <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-50 px-3 py-2 text-[13px] text-warn">
            <Info size={16} className="mt-0.5 shrink-0" /> <span>Setup pending in .env: <b>{missing.join(', ')}</b></span>
          </div>
        )}

        {/* Summary */}
        <section className="card mt-4 p-4" aria-label="Today's summary">
          <div className="flex items-start justify-between">
            <div>
              <div className="label-loc">{c.due}</div>
              <AnimatedNumber value={nums?.outstanding} className="mt-1 block text-[34px] font-bold leading-none tracking-tight" />
            </div>
            <a href="/dashboard" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-600 hover:bg-brand-50">
              Dashboard <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="mt-4 grid grid-cols-2 divide-x divide-line border-t border-line pt-3">
            <Stat label={c.given} value={nums?.credit_given} />
            <Stat label={c.got} value={nums?.recovered} className="pl-4" tone="text-ok" />
          </div>
        </section>

        {/* Mic */}
        <section className="flex flex-col items-center pt-3" aria-live="polite">
          <VoiceOrb phase={livePhase} level={orbLevel} onClick={toggle} size={132} />
          <AnimatePresence mode="wait">
            <motion.div key={livePhase + lang} className="-mt-3 text-center"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <div className="text-[17px] font-semibold">{c[livePhase] || c.idle}</div>
              {livePhase === 'idle' && <div className="mt-0.5 text-[13px] text-muted">{c.hint}</div>}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Conversation */}
        {(convo.length > 0 || interim) && (
          <section className="mt-5 space-y-2" aria-label="Conversation">
            <AnimatePresence initial={false}>
              {convo.map((m) => <Bubble key={m.id} m={m} />)}
              {interim && <Bubble key="interim" m={{ role: 'user', text: interim, interim: true }} />}
            </AnimatePresence>
          </section>
        )}

        {/* Recent actions */}
        {actions.length > 0 && (
          <section className="card mt-4 overflow-hidden" aria-label={c.recent}>
            <div className="label-loc px-4 pb-1 pt-3">{c.recent}</div>
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {actions.map((a) => {
                  const k = kind(a.kind)
                  const Icon = k.icon
                  return (
                    <motion.li key={a.id} layout initial={{ opacity: 0, backgroundColor: '#eef3ff' }}
                      animate={{ opacity: 1, backgroundColor: '#ffffff' }} exit={{ opacity: 0 }}
                      transition={{ backgroundColor: { duration: 1.6 }, opacity: { duration: 0.2 } }}
                      className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${k.bg} ${k.color}`}><Icon size={16} /></span>
                      <span className="min-w-0 flex-1 text-[14px] leading-snug">{a.text}</span>
                      <span className="shrink-0 text-[11px] text-subtle">{timeAgo(a.created_at, now)}</span>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>
        )}

        <div className="flex-1" />

        {/* Composer: suggestions (recognition over recall) + typed input as accessible fallback */}
        <section className="sticky bottom-0 z-20 mt-5 -mx-4 border-t border-line bg-canvas px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="label-loc mb-1.5">{c.try}</div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {c.samples.map((s) => (
              <button key={s} onClick={() => sendText(s)} disabled={sending}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-brand-200 hover:bg-brand-50 disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendText() }} className="card flex items-center gap-1 p-1.5 pl-3 focus-within:border-brand-500">
            <Keyboard size={16} className="shrink-0 text-subtle" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={c.type} aria-label="Type a request"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-subtle" />
            <button type="button" onClick={() => setSpeakReplies((v) => !v)} aria-label={speakReplies ? 'Mute spoken replies' : 'Speak replies'}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-canvas">
              {speakReplies ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button disabled={sending || !text.trim()} aria-label="Send"
              className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white transition-opacity disabled:opacity-40">
              {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={17} />}
            </button>
          </form>
          <EngineToggle engine={engine} disabled={busy} onChange={setEngine} />
        </section>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div role="alert" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="fixed inset-x-4 bottom-5 z-50 mx-auto flex max-w-md items-start gap-2 rounded-xl bg-ink px-4 py-3 text-[14px] text-white shadow-xl">
            <span className="flex-1">{toast}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="-m-1 p-1 text-white/70"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Stat({ label, value, tone = 'text-ink', className = '' }) {
  return (
    <div className={className}>
      <div className="text-[12px] text-muted">{label}</div>
      <AnimatedNumber value={value} className={`text-[18px] font-semibold ${tone}`} />
    </div>
  )
}

function LangToggle({ lang, onChange, disabled, onBlocked }) {
  return (
    <div role="radiogroup" aria-label="Language" className="relative flex rounded-xl border border-line bg-surface p-1">
      {Object.entries(LANGS).map(([k, v]) => (
        <button key={k} role="radio" aria-checked={lang === k} onClick={() => (disabled ? onBlocked() : onChange(k))}
          className="relative z-10 min-w-[64px] px-3 py-1.5 text-[14px] font-semibold">
          {lang === k && <motion.span layoutId="lang-pill" className="absolute inset-0 -z-10 rounded-lg bg-brand-500"
            transition={{ type: 'spring', stiffness: 450, damping: 34 }} />}
          <span className={lang === k ? 'text-white' : 'text-muted'}>{v.label}</span>
        </button>
      ))}
    </div>
  )
}

function EngineToggle({ engine, onChange, disabled }) {
  const opts = [['agora', 'Agora ConvoAI', Radio], ['browser', 'Browser voice', Smartphone]]
  return (
    <div className="mt-2.5 flex items-center justify-center gap-1 text-[12px] text-subtle" role="radiogroup" aria-label="Voice engine">
      <span className="mr-1">Voice engine</span>
      {opts.map(([k, label, Icon]) => (
        <button key={k} role="radio" aria-checked={engine === k} disabled={disabled} onClick={() => onChange(k)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 disabled:cursor-not-allowed ${engine === k ? 'bg-brand-50 font-semibold text-brand-600' : 'hover:text-muted'}`}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  )
}

function Bubble({ m }) {
  const me = m.role === 'user'
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: m.interim ? 0.6 : 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${me
        ? 'rounded-br-md bg-brand-500 text-white'
        : 'rounded-bl-md border border-line bg-surface text-ink'}`}>
        {m.text}
        {!me && m.tools?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-1.5">
            {m.tools.map((t, i) => (
              <span key={i} className={`flex items-center gap-1 text-[12px] font-medium ${t.ok === false ? 'text-warn' : 'text-ok'}`}>
                <Check size={12} strokeWidth={3} /> {toolLabel(t.tool)}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
