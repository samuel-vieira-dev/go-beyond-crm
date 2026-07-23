import { cn } from '@/lib/cn'

export function GoalProgress({
  current,
  reachable,
  high,
  superGoal,
  format,
}: {
  current: number
  reachable: number
  high: number
  superGoal: number
  format?: (n: number) => string
}) {
  const fmt = format ?? ((n: number) => String(n))
  const max = Math.max(superGoal, 1)
  const fillPct = Math.min(100, (current / max) * 100)

  const tiers = [
    { label: 'Alcançável', target: reachable },
    { label: 'Alta', target: high },
    { label: 'Super', target: superGoal },
  ]

  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${fillPct}%` }} />
        {tiers.map((t) => (
          <div
            key={t.label}
            className="absolute top-0 h-full w-px bg-navy-950/60"
            style={{ left: `${Math.min(100, (t.target / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        {tiers.map((t) => (
          <div key={t.label} className={cn('flex items-center gap-1', current >= t.target ? 'text-gold-400' : 'text-white/35')}>
            {current >= t.target ? '✓' : '·'} {t.label}: {fmt(t.target)}
          </div>
        ))}
      </div>
    </div>
  )
}
