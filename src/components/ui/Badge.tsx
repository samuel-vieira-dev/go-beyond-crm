import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'gold' | 'blue' | 'green' | 'red' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
  blue: 'bg-navy-600/40 text-blue-200 border-navy-600/60',
  green: 'bg-success/15 text-success border-success/30',
  red: 'bg-danger/15 text-danger border-danger/30',
  neutral: 'bg-white/10 text-white/70 border-white/10',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
