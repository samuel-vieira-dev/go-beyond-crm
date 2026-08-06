import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function StatCard({
  label,
  value,
  hint,
  accent = false,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: boolean
  icon?: ReactNode
}) {
  return (
    <div className="card-surface min-w-0 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-white/50 uppercase">{label}</p>
        {icon}
      </div>
      <p
        className={cn(
          'mt-2 text-xl font-semibold break-words sm:text-2xl',
          accent ? 'text-gold-400' : 'text-white',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  )
}
