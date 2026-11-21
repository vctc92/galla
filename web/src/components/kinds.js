import { BellRing, HandCoins, Package, Receipt, Sparkles, TriangleAlert } from 'lucide-react'

// Activity kind -> icon + colour. Shared by app and dashboard.
export const KINDS = {
  credit: { icon: Receipt, color: 'text-marigold-400', bg: 'bg-marigold-500/15', ring: 'ring-marigold-500/30', label: 'Udhaar' },
  payment: { icon: HandCoins, color: 'text-leaf-400', bg: 'bg-leaf-500/15', ring: 'ring-leaf-500/30', label: 'Payment' },
  reminder: { icon: BellRing, color: 'text-peacock-400', bg: 'bg-peacock-500/15', ring: 'ring-peacock-500/30', label: 'Reminder' },
  stock: { icon: Package, color: 'text-sky-300', bg: 'bg-sky-400/15', ring: 'ring-sky-400/30', label: 'Stock' },
  alert: { icon: TriangleAlert, color: 'text-chilli-400', bg: 'bg-chilli-500/15', ring: 'ring-chilli-500/30', label: 'Alert' },
  system: { icon: Sparkles, color: 'text-slate-300', bg: 'bg-white/10', ring: 'ring-white/15', label: 'Galla' },
}
export const kind = (k) => KINDS[k] || KINDS.system
