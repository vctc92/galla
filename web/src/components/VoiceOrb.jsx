import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { LoaderCircle, Mic, Square } from 'lucide-react'

/**
 * Primary action of the shopkeeper app.
 * idle: solid blue mic · listening: rings follow the mic level · thinking: rotating arc
 * speaking: inverted (white with blue bars) so "Galla is talking" reads differently from "I'm talking".
 */
export default function VoiceOrb({ phase = 'idle', level = 0, onClick, size = 144 }) {
  const reduce = useReducedMotion()
  const live = phase !== 'idle'
  const speaking = phase === 'speaking'
  const l = Math.min(1, level * 2.4)

  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.75, height: size * 1.75 }}>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-brand-200 bg-brand-50/60"
          style={{ width: size, height: size }}
          animate={
            reduce ? { scale: 1 + 0.18 * (i + 1), opacity: 0.6 }
              : phase === 'listening' ? { scale: 1 + l * (0.35 + i * 0.25) + 0.06, opacity: 0.9 - i * 0.3 }
                : phase === 'idle' ? { scale: [1, 1.22 + i * 0.16], opacity: [0.7, 0] }
                  : { scale: 1.12 + i * 0.14, opacity: 0.5 - i * 0.2 }
          }
          transition={phase === 'idle' && !reduce
            ? { duration: 2.8, repeat: Infinity, delay: i * 1.1, ease: 'easeOut' }
            : { type: 'spring', stiffness: 260, damping: 22 }}
        />
      ))}

      <AnimatePresence>
        {(phase === 'thinking' || phase === 'connecting') && (
          <motion.svg key="arc" aria-hidden className="absolute" width={size + 18} height={size + 18} viewBox="0 0 100 100"
            initial={{ opacity: 0 }} animate={{ opacity: 1, rotate: 360 }} exit={{ opacity: 0 }}
            transition={{ rotate: { duration: 1.1, repeat: Infinity, ease: 'linear' } }}>
            <circle cx="50" cy="50" r="47" fill="none" stroke="var(--color-brand-500)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="70 300" />
          </motion.svg>
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        aria-label={live ? 'Stop listening' : 'Start talking to Galla'}
        aria-pressed={live}
        className="relative z-10 grid place-items-center rounded-full border-2 shadow-[0_10px_30px_-12px_rgba(31,94,255,.55)]"
        style={{ width: size, height: size }}
        animate={{
          backgroundColor: speaking ? '#ffffff' : '#1f5eff',
          borderColor: speaking ? '#1f5eff' : '#1f5eff',
          color: speaking ? '#1f5eff' : '#ffffff',
        }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.25 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={speaking ? 'bars' : phase === 'connecting' ? 'load' : live ? 'stop' : 'mic'}
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.16 }} className="grid place-items-center">
            {speaking ? <Bars level={l} /> :
              phase === 'connecting' ? <LoaderCircle size={size * 0.28} className="animate-spin" /> :
                live ? <Square size={size * 0.2} fill="currentColor" strokeWidth={0} /> :
                  <Mic size={size * 0.32} strokeWidth={2} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

function Bars({ level }) {
  const shape = [0.45, 0.8, 1, 0.8, 0.45]
  return (
    <span className="flex h-10 items-center gap-1.5" aria-hidden>
      {shape.map((k, i) => (
        <motion.span key={i} className="w-1.5 rounded-full bg-brand-500"
          animate={{ height: 6 + 30 * k * Math.max(0.2, level) }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} />
      ))}
    </span>
  )
}
