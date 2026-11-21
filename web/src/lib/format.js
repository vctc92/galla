export function inr(n) {
  const v = Math.round(Number(n) || 0)
  return '₹' + v.toLocaleString('en-IN')
}

export function timeAgo(ts, now = Date.now() / 1000) {
  const s = Math.max(0, Math.round(now - ts))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const LANGS = {
  hi: { label: 'हिंदी', name: 'Hindi', bcp47: 'hi-IN' },
  ta: { label: 'தமிழ்', name: 'Tamil', bcp47: 'ta-IN' },
}
