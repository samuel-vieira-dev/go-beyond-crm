import { useMemo, useState } from 'react'
import { addDays, eachDayOfInterval, endOfWeek, format, isBefore, isSameDay, startOfHour, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMeetingsForCloser } from '@/hooks/useMeetings'
import { cn } from '@/lib/cn'

// Horário comercial de atendimento (slots de 1h): 08:00 … 21:00.
const BUSINESS_HOURS = Array.from({ length: 14 }, (_, i) => 8 + i)

export function SlotPickerCalendar({
  closerId,
  value,
  onChange,
}: {
  closerId: string
  value: Date | null
  onChange: (slot: Date) => void
}) {
  const [anchor, setAnchor] = useState(new Date())
  // Compara contra o início da hora atual: mantém a hora corrente e todas as
  // futuras do dia disponíveis (ex.: às 14h dá pra marcar 18h de hoje).
  const nowHour = startOfHour(new Date())

  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 0 })
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [anchor])

  const { data: meetings } = useMeetingsForCloser(closerId, {
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  })

  function isOccupied(day: Date, hour: number) {
    return (meetings ?? []).some((m) => {
      if (m.status !== 'agendada') return false
      const d = new Date(m.scheduled_at)
      return isSameDay(d, day) && d.getHours() === hour
    })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-white/50">
          {format(days[0], "d MMM", { locale: ptBR })} — {format(days[6], "d MMM", { locale: ptBR })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setAnchor((a) => addDays(a, -7))}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => addDays(a, 7))}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {/* cabeçalho dos dias */}
          <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
            <div />
            {days.map((day) => (
              <div key={day.toISOString()} className="px-1 pb-1 text-center">
                <p className="text-[10px] text-white/40 uppercase">{format(day, 'EEE', { locale: ptBR })}</p>
                <p className={cn('text-xs font-semibold', isSameDay(day, nowHour) ? 'text-gold-400' : 'text-white/70')}>
                  {format(day, 'd')}
                </p>
              </div>
            ))}
          </div>

          {/* grade de slots */}
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {BUSINESS_HOURS.map((hour) => (
              <div key={hour} className="grid gap-1" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
                <div className="flex items-center justify-end pr-1 text-[10px] text-white/30">
                  {String(hour).padStart(2, '0')}:00
                </div>
                {days.map((day) => {
                  const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0)
                  const past = isBefore(slot, nowHour)
                  const occupied = isOccupied(day, hour)
                  const selected = value ? isSameDay(value, day) && value.getHours() === hour : false
                  const disabled = past || occupied

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(slot)}
                      className={cn(
                        'h-8 rounded text-[10px] font-medium transition-colors',
                        selected
                          ? 'bg-gold-500 text-navy-950'
                          : occupied
                            ? 'cursor-not-allowed bg-danger/15 text-danger/70'
                            : past
                              ? 'cursor-not-allowed bg-white/[0.02] text-white/15'
                              : 'bg-white/5 text-white/50 hover:bg-gold-500/20 hover:text-gold-300',
                      )}
                      title={occupied ? 'Horário ocupado' : past ? 'Horário no passado' : 'Disponível'}
                    >
                      {selected ? '✓' : occupied ? 'ocup.' : ''}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/40">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-white/10" /> Disponível</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-danger/40" /> Ocupado</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-gold-500" /> Selecionado</span>
      </div>
    </div>
  )
}
