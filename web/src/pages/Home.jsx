import { motion } from 'motion/react'
import { ArrowRight, LayoutDashboard, Mic } from 'lucide-react'
import Logo from '../components/Logo'

const CARDS = [
  { href: '/app', icon: Mic, title: 'Shopkeeper app', desc: 'Open on the phone. Tap the mic and talk in Hinglish or Tanglish.', tone: 'from-marigold-400 to-marigold-600' },
  { href: '/dashboard', icon: LayoutDashboard, title: 'Live dashboard', desc: 'Put it on the projector. Ledger, stock and activity update live.', tone: 'from-peacock-400 to-peacock-500' },
]

export default function Home() {
  return (
    <div className="grain relative grid min-h-full place-items-center px-6">
      <div className="relative z-10 w-full max-w-2xl py-16">
        <Logo size={52} />
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mt-8 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
          The kirana notebook,<br /><span className="text-marigold-400">now it listens.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-4 max-w-lg text-slate-400">
          Udhaar, stock and payment reminders, run by voice in the language the shop already speaks.
        </motion.p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CARDS.map((c, i) => (
            <motion.a key={c.href} href={c.href} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
              whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} className="glass group rounded-3xl p-5">
              <div className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${c.tone} text-ink-900`}><c.icon size={22} /></div>
              <div className="mt-4 flex items-center gap-2 font-display text-xl font-bold">
                {c.title} <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </div>
              <div className="mt-1 text-sm text-slate-400">{c.desc}</div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  )
}
