import { Scale } from 'lucide-react'

/** Brand mark: a tarazu (kirana balance scale) — what "galla" means to a shopkeeper. */
export default function Logo({ size = 36, sub }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid place-items-center rounded-[10px] bg-brand-500 text-white" style={{ width: size, height: size }}>
        <Scale size={size * 0.56} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.5 }}>Galla</div>
        {sub && <div className="text-[12px] text-muted">{sub}</div>}
      </div>
    </div>
  )
}
