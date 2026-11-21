import { motion } from 'motion/react'
import { ArrowRight, LayoutDashboard, Mic } from 'lucide-react'
import Logo from '../components/Logo'
import GroceryBackdrop from '../components/GroceryBackdrop'

const CARDS = [
  { href: '/app', icon: Mic, title: 'Shopkeeper app', desc: 'Open on the phone. Tap the mic and speak in Hinglish or Tanglish.' },
  { href: '/dashboard', icon: LayoutDashboard, title: 'Live dashboard', desc: 'Show on the projector. Ledger, stock and activity update as you speak.' },
]

export default function Home() {
  return (
    <div className="relative grid min-h-full place-items-center px-6">
      <GroceryBackdrop opacity={0.06} />
      <main className="relative z-10 w-full max-w-2xl py-16">
        <Logo size={44} />
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="mt-10 text-[44px] font-bold leading-[1.08] tracking-tight">
          The kirana notebook, <span className="text-brand-500">now it listens.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-4 max-w-lg text-[17px] text-muted">
          Record udhaar, update stock and send payment reminders by voice, in the language the shop already speaks.
        </motion.p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CARDS.map((c, i) => (
            <motion.a key={c.href} href={c.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
              className="card group p-5 transition-colors hover:border-brand-200">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><c.icon size={20} /></span>
              <div className="mt-4 flex items-center gap-1.5 text-[18px] font-semibold">
                {c.title} <ArrowRight size={16} className="text-brand-500 transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-1 text-[14px] text-muted">{c.desc}</p>
            </motion.a>
          ))}
        </div>
      </main>
    </div>
  )
}
