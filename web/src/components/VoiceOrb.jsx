import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, Mic, Square } from 'lucide-react'

const PALETTE = {
  idle: ['#ffd27a', '#d9860b'],
  connecting: ['#ffd27a', '#d9860b'],
  listening: ['#ffd27a', '#f5a524'],
  thinking: ['#a78bfa', '#6d28d9'],
  speaking: ['#7ff0f8', '#13b5c4'],
}

/**
 * The big mic button. Rings react to live audio levels:
 * marigold = shopkeeper talking, peacock = Galla talking.
 */
export default function VoiceOrb({ phase = 'idle', level = 0, onClick, size = 176 }) {
  const [a, b] = PALETTE[phase] || PALETTE.idle
  const live = phase !== 'idle'
  const l = Math.min(1, level * 2.2)

  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.7, height: size * 1.7 }}>
      {/* reactive halo rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: size, height: size, border: `1.5px solid ${a}`, boxShadow: `0 0 40px ${b}55` }}
          animate={
            live
              ? { scale: 1 + l * (0.25 + i * 0.18) + (phase === 'connecting' ? 0.1 : 0), opacity: 0.55 - i * 0.15 + l * 0.3 }
              : { scale: [1, 1.18 + i * 0.12, 1], opacity: [0.35 - i * 0.1, 0, 0.35 - i * 0.1] }
          }
          transition={live ? { type: 'spring', stiffness: 300, damping: 20 } : { duration: 3.2, repeat: Infinity, delay: i * 0.6, ease: 'easeInOut' }}
        />
      ))}

      {/* rotating aura while connecting / thinking */}
      <AnimatePresence>
        {(phase === 'connecting' || phase === 'thinking') && (
          <motion.div
            className="absolute rounded-full"
            style={{ width: size * 1.18, height: size * 1.18, background: `conic-gradient(from 0deg, transparent, ${a}, transparent 40%)` }}
            initial={{ opacity: 0 }} animate={{ opacity: 0.8, rotate: 360 }} exit={{ opacity: 0 }}
            transition={{ rotate: { duration: 1.4, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.3 } }}
          />
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        aria-label={live ? 'Stop' : 'Start talking'}
        className="relative z-10 grid place-items-center rounded-full text-ink-900 outline-none"
        style={{ width: size, height: size }}
        animate={{ background: `radial-gradient(circle at 30% 25%, ${a}, ${b})`, scale: 1 + l * 0.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.55),transparent_45%)]" />
        <AnimatePresence mode="wait">
          <motion.div key={phase === 'connecting' ? 'c' : live ? 'l' : 'i'}
            initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
            {phase === 'connecting'
              ? <LoaderCircle size={size * 0.3} className="animate-spin" />
              : live ? <Square size={size * 0.24} fill="currentColor" /> : <Mic size={size * 0.34} strokeWidth={2.2} />}
          </motion.div>
        </AnimatePresence>
        {/* equaliser bars while audio flows */}
        {live && phase !== 'connecting' && (
          <div className="absolute bottom-[18%] flex items-end gap-1">
            {[0.6, 1, 0.75, 1, 0.6].map((k, i) => (
              <motion.span key={i} className="w-1 rounded-full bg-ink-900/70"
                animate={{ height: 4 + l * 22 * k * (0.6 + Math.random() * 0.4) }} transition={{ duration: 0.12 }} />
            ))}
          </div>
        )}
      </motion.button>
    </div>
  )
}
