import { cn } from '@/lib/cn'

/** Marca abstrata inspirada no símbolo da Go Beyond (silhueta ampulheta em dourado). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={cn('h-8 w-8', className)} aria-hidden="true">
      <path
        d="M22,8 C18,8 16,32 20,42 C24,50 34,52 40,55 C34,58 24,60 20,68 C16,78 18,112 22,112 L78,112 C82,112 84,78 80,68 C76,60 66,58 60,55 C66,52 76,50 80,42 C84,32 82,8 78,8 Z"
        fill="var(--color-gold-500)"
      />
    </svg>
  )
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-wide text-white">GO BEYOND</p>
        <p className="text-[10px] font-medium tracking-[0.2em] text-gold-500 uppercase">Ops</p>
      </div>
    </div>
  )
}
