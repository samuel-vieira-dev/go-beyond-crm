import { cn } from '@/lib/cn'

export function Toggle({
  checked,
  onChange,
  labelOn = 'Ativo',
  labelOff = 'Inativo',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  labelOn?: string
  labelOff?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-success' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
      <span className={cn('text-xs font-medium', checked ? 'text-success' : 'text-white/40')}>
        {checked ? labelOn : labelOff}
      </span>
    </button>
  )
}
