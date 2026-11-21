import { motion, useReducedMotion } from 'motion/react'
import { Apple, Bean, Carrot, Coffee, Cookie, Egg, IndianRupee, Milk, Package, Scale, ShoppingBasket, Weight, Wheat } from 'lucide-react'

/*
 * Subtle kirana-themed backdrop: a tile of thin line icons (tarazu scale, weights, grain, milk, eggs…)
 * drifting diagonally very slowly. The tile repeats seamlessly; the centre is masked out so content stays clean.
 * Honours prefers-reduced-motion.
 */
const TILE = 320
const ITEMS = [
  { Icon: Scale, x: 24, y: 28, r: -8, s: 34 },
  { Icon: Wheat, x: 150, y: 16, r: 12, s: 26 },
  { Icon: Milk, x: 250, y: 60, r: -6, s: 26 },
  { Icon: Weight, x: 86, y: 120, r: 6, s: 24 },
  { Icon: Egg, x: 196, y: 140, r: -14, s: 22 },
  { Icon: ShoppingBasket, x: 22, y: 210, r: 4, s: 30 },
  { Icon: IndianRupee, x: 140, y: 230, r: -10, s: 22 },
  { Icon: Carrot, x: 262, y: 220, r: 18, s: 24 },
  { Icon: Package, x: 98, y: 282, r: -4, s: 22 },
  { Icon: Coffee, x: 216, y: 290, r: 8, s: 22 },
  { Icon: Bean, x: 300, y: 150, r: -20, s: 18 },
  { Icon: Apple, x: 280, y: 6, r: 10, s: 18 },
  { Icon: Cookie, x: 10, y: 140, r: 0, s: 18 },
]

function Tile() {
  return (
    <div className="relative shrink-0" style={{ width: TILE, height: TILE }}>
      {ITEMS.map(({ Icon, x, y, r, s }, i) => (
        <Icon key={i} size={s} strokeWidth={1.4} className="absolute text-brand-700"
          style={{ left: x, top: y, transform: `rotate(${r}deg)` }} aria-hidden />
      ))}
    </div>
  )
}

export default function GroceryBackdrop({ opacity = 0.07, cols = 7, rows = 5, duration = 90, clearCenter = true }) {
  const reduce = useReducedMotion()
  const mask = clearCenter ? 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 35%, #000 85%)' : undefined
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity, WebkitMaskImage: mask, maskImage: mask }}>
      <motion.div
        className="flex flex-wrap will-change-transform"
        style={{ width: TILE * cols }}
        animate={reduce ? undefined : { x: [0, -TILE], y: [0, -TILE] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        {Array.from({ length: cols * rows }, (_, i) => <Tile key={i} />)}
      </motion.div>
    </div>
  )
}
