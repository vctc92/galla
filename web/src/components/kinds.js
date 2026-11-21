import { BellRing, HandCoins, Package, Receipt, Sparkles, TriangleAlert } from 'lucide-react'

// Activity kind -> icon + semantic colour. Shared by app and dashboard so status colours stay consistent.
export const KINDS = {
  credit: { icon: Receipt, color: 'text-brand-600', bg: 'bg-brand-50', dot: 'bg-brand-500', label: 'Udhaar' },
  payment: { icon: HandCoins, color: 'text-ok', bg: 'bg-ok-50', dot: 'bg-ok', label: 'Payment' },
  reminder: { icon: BellRing, color: 'text-brand-600', bg: 'bg-brand-50', dot: 'bg-brand-200', label: 'Reminder' },
  stock: { icon: Package, color: 'text-muted', bg: 'bg-canvas', dot: 'bg-subtle', label: 'Stock' },
  alert: { icon: TriangleAlert, color: 'text-warn', bg: 'bg-warn-50', dot: 'bg-warn', label: 'Alert' },
  system: { icon: Sparkles, color: 'text-subtle', bg: 'bg-canvas', dot: 'bg-line', label: 'Galla' },
}
export const kind = (k) => KINDS[k] || KINDS.system

// Human-readable names for agent tool calls (UX: show outcomes, not function names).
export const TOOL_LABELS = {
  add_credit: 'Udhaar recorded',
  record_payment: 'Payment recorded',
  check_balance: 'Balance checked',
  check_stock: 'Stock checked',
  update_stock: 'Stock updated',
  place_reorder: 'Supplier order sent',
  send_payment_reminder: 'Reminder sent',
  daily_summary: 'Summary prepared',
}
export const toolLabel = (t) => TOOL_LABELS[t] || t
