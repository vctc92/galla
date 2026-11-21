import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Bot, Keyboard, LayoutDashboard, Radio, Send, Smartphone, Volume2, VolumeX } from 'lucide-react'
import Logo from '../components/Logo'
import VoiceOrb from '../components/VoiceOrb'
import AnimatedNumber from '../components/AnimatedNumber'
import { kind } from '../components/kinds'
import { api } from '../lib/api'
import { LANGS, timeAgo } from '../lib/format'
import { useLiveState, useNow } from '../lib/useLiveState'
import { browserVoiceSupported, speak, startBrowserSession } from '../lib/browserVoice'

const COPY = {
  hi: {
    idle: 'बोलने के लिए दबाएँ', connecting: 'Galla को बुला रहे हैं…', listening: 'सुन रहा हूँ… बोलिए',
    thinking: 'सोच रहा हूँ…', speaking: 'Galla बोल रहा है', due: 'कुल उधार बाकी', today: 'आज',
    given: 'उधार दिया', got: 'वापस मिला', type: 'या यहाँ लिखिए…',
    samples: ['Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein likh do', 'Ramesh ka kitna baaki hai?', 'Ramesh ko reminder bhejo', 'Aaj ka hisaab batao', 'Das packet doodh aaya hai'],
  },
  ta: {
    idle: 'பேச அழுத்துங்க', connecting: 'Galla இணைகிறது…', listening: 'கேட்கிறேன்… சொல்லுங்க',
    thinking: 'யோசிக்கிறேன்…', speaking: 'Galla பேசுகிறது', due: 'மொத்த பாக்கி', today: 'இன்று',
    given: 'கடன் கொடுத்தது', got: 'வசூல்', type: 'அல்லது இங்கே டைப் பண்ணுங்க…',
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
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) } }, [toast])

  // In Agora mode the phase follows the live audio levels.
  const livePhase = engine === 'agora' && phase === 'live'
    ? (levels.agent > 0.04 ? 'speaking' : 'listening')
    : phase
  const orbLevel = livePhase === 'speaking' ? levels.agent : levels.me

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
    <div className="grain relative min-h-full">
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* top bar */}
        <header className="flex items-center justify-between">
          <Logo size={34} sub={state?.shop?.name} />
          <LangToggle lang={lang} setLang={(l) => { if (!session.current) setLang(l); else setToast('Stop the mic to switch language') }} />
        </header>

        {missing.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl border border-chilli-500/30 bg-chilli-500/10 px-3 py-2 text-xs text-chilli-400">
            Setup pending in .env: {missing.join(', ')}
          </motion.div>
        )}

        {/* balance hero */}
        <motion.section layout className="glass mt-4 rounded-3xl p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">{c.due}</div>
              <AnimatedNumber value={nums?.outstanding} className="font-display text-4xl font-bold tracking-tight text-marigold-300" />
            </div>
            <a href="/dashboard" className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
              <LayoutDashboard size={14} /> Dashboard
            </a>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-white/[0.04] px-3 py-2">
              <div className="text-[11px] text-slate-400">{c.today} · {c.given}</div>
              <AnimatedNumber value={nums?.credit_given} className="font-semibold text-marigold-400" />
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-3 py-2">
              <div className="text-[11px] text-slate-400">{c.today} · {c.got}</div>
              <AnimatedNumber value={nums?.recovered} className="font-semibold text-leaf-400" />
            </div>
          </div>
        </motion.section>

        {/* orb */}
        <section className="flex flex-col items-center pt-2">
          <VoiceOrb phase={livePhase} level={orbLevel} onClick={toggle} size={150} />
          <AnimatePresence mode="wait">
            <motion.div key={livePhase + lang} className="-mt-4 font-display text-lg font-semibold"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {c[livePhase] || c.idle}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* live conversation */}
        <section className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {convo.map((m) => <Bubble key={m.id} m={m} />)}
            {interim && <Bubble key="interim" m={{ role: 'user', text: interim, interim: true }} />}
          </AnimatePresence>
        </section>

        {/* action cards */}
        <section className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">Galla ne kya kiya</div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {actions.map((a) => {
                const k = kind(a.kind)
                const Icon = k.icon
                return (
                  <motion.div key={a.id} layout
                    initial={{ opacity: 0, x: -24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, height: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                    className={`flex items-center gap-3 rounded-2xl bg-white/[0.035] p-3 ring-1 ${k.ring}`}>
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${k.bg} ${k.color}`}><Icon size={18} /></div>
                    <div className="min-w-0 flex-1 text-sm leading-snug">{a.text}</div>
                    <div className="shrink-0 text-[10px] text-slate-500">{timeAgo(a.created_at, now)}</div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </section>

        <div className="flex-1" />

        {/* sample phrases + text input (testing + accessibility fallback) */}
        <section className="mt-5">
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
            {c.samples.map((s) => (
              <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => sendText(s)}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
                {s}
              </motion.button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendText() }} className="glass mt-1 flex items-center gap-2 rounded-2xl p-1.5 pl-3">
            <Keyboard size={16} className="text-slate-500" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={c.type}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" />
            <button type="button" onClick={() => setSpeakReplies((v) => !v)} className="p-2 text-slate-400" title="Speak replies">
              {speakReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <motion.button whileTap={{ scale: 0.9 }} disabled={sending}
              className="grid h-9 w-9 place-items-center rounded-xl bg-marigold-500 text-ink-900 disabled:opacity-50">
              {sending ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Bot size={16} /></motion.span> : <Send size={16} />}
            </motion.button>
          </form>
          <EngineToggle engine={engine} setEngine={(e) => { if (!session.current) setEngine(e) }} />
        </section>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl bg-chilli-500 px-4 py-3 text-sm font-medium text-white shadow-2xl"
            onClick={() => setToast(null)}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LangToggle({ lang, setLang }) {
  return (
    <div className="glass relative flex rounded-full p-1">
      {Object.entries(LANGS).map(([k, v]) => (
        <button key={k} onClick={() => setLang(k)} className="relative z-10 px-3 py-1.5 text-sm font-semibold">
          {lang === k && <motion.span layoutId="lang-pill" className="absolute inset-0 -z-10 rounded-full bg-marigold-500"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
          <span className={lang === k ? 'text-ink-900' : 'text-slate-300'}>{v.label}</span>
        </button>
      ))}
    </div>
  )
}

function EngineToggle({ engine, setEngine }) {
  const opts = [['agora', 'Agora ConvoAI', Radio], ['browser', 'Browser voice', Smartphone]]
  return (
    <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-slate-500">
      <span>Engine</span>
      {opts.map(([k, label, Icon]) => (
        <button key={k} onClick={() => setEngine(k)}
          className={`flex items-center gap-1 rounded-full px-2 py-1 ${engine === k ? 'bg-white/10 text-slate-200' : ''}`}>
          <Icon size={11} /> {label}
        </button>
      ))}
    </div>
  )
}

function Bubble({ m }) {
  const me = m.role === 'user'
  return (
    <motion.div layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: m.interim ? 0.6 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${me
        ? 'rounded-br-md bg-marigold-500/90 text-ink-900'
        : 'rounded-bl-md bg-peacock-500/15 text-slate-100 ring-1 ring-peacock-500/25'}`}>
        {!me && <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-peacock-400"><Bot size={11} /> Galla {m.tools?.length ? <><ArrowRight size={10} /> {m.tools.map((t) => t.tool).join(', ')}</> : null}</div>}
        {m.text}
      </div>
    </motion.div>
  )
}
