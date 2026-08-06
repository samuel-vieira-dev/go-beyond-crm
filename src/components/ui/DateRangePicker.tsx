import { useState } from 'react'
import { endOfDay, endOfMonth, format, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns'
import { Button } from './Button'
import { Input } from './Field'
import type { DateRange } from '@/hooks/useFunnelMetrics'

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'custom', label: 'Personalizado' },
]

function rangeForPreset(preset: Preset): DateRange {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    case 'yesterday': {
      const yesterday = subDays(now, 1)
      return { from: startOfDay(yesterday).toISOString(), to: endOfDay(yesterday).toISOString() }
    }
    case '7d':
      return { from: startOfDay(subDays(now, 6)).toISOString(), to: endOfDay(now).toISOString() }
    case '30d':
      return { from: startOfDay(subDays(now, 29)).toISOString(), to: endOfDay(now).toISOString() }
    case 'month':
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
    default:
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
  }
}

export function DateRangePicker({
  value,
  onChange,
  defaultPreset = '30d',
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  /** Preset aceso ao abrir a tela — precisa bater com o range inicial de quem usa. */
  defaultPreset?: Preset
}) {
  const [preset, setPreset] = useState<Preset>(defaultPreset)

  function selectPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') onChange(rangeForPreset(p))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={preset === p.key ? 'primary' : 'secondary'}
          onClick={() => selectPreset(p.key)}
        >
          {p.label}
        </Button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-auto"
            value={format(parseISO(value.from), 'yyyy-MM-dd')}
            onChange={(e) =>
              e.target.value && onChange({ ...value, from: startOfDay(parseISO(e.target.value)).toISOString() })
            }
          />
          <span className="text-white/30">até</span>
          <Input
            type="date"
            className="w-auto"
            value={format(parseISO(value.to), 'yyyy-MM-dd')}
            onChange={(e) =>
              e.target.value && onChange({ ...value, to: endOfDay(parseISO(e.target.value)).toISOString() })
            }
          />
        </div>
      )}
    </div>
  )
}

export { rangeForPreset }
export type { Preset }
