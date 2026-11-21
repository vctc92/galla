import { motion } from 'motion/react'

export default function Logo({ size = 36, sub }) {
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        className="grid place-items-center rounded-xl bg-gradient-to-br from-marigold-300 to-marigold-600 text-ink-900 font-display font-extrabold shadow-[0_0_24px_rgba(245,165,36,.35)]"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      >₹</motion.div>
      <div className="leading-tight">
        <div className="font-display font-bold tracking-tight" style={{ fontSize: size * 0.55 }}>
          Galla <span className="text-marigold-400 font-semibold">गल्ला</span>
        </div>
        {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      </div>
    </div>
  )
}
