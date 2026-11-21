import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

/** Springs smoothly to the new value — totals "count" up/down live on the projector. */
export default function AnimatedNumber({ value, prefix = '₹', className }) {
  const spring = useSpring(value ?? 0, { stiffness: 90, damping: 18, mass: 0.8 })
  useEffect(() => { spring.set(value ?? 0) }, [value, spring])
  const text = useTransform(spring, (v) => prefix + Math.round(v).toLocaleString('en-IN'))
  return <motion.span className={className}>{text}</motion.span>
}
