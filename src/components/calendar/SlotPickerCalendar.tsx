import { useMemo, useState } from 'react'
import { addDays, eachDayOfInterval, endOfWeek, format, isBefore, isSameDay, startOfHour, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMeetingsForCloser } from '@/hooks/useMeetings'
import { cn } from '@/lib/cn'

// Horário comercial de atendimento (slots de 1h): 08:00 … 21:00.
const BUSINESS_HOURS = Array.from({ length: 14 }, (_, i) => 8 + i)

// Duração padrão da reunião, usada só para avisar sobre sobreposição no horário exato.
const MEETING_DURATION_MINUTES = 60

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

  const MS_HOUR = 3_600_000

  // Interseção de um intervalo com a célula de 1h, em % da altura da célula.
  // É isso que permite desenhar 11:30–12:30 como duas meias-barras.
  function overlapBar(cellStart: Date, start: Date, end: Date) {
    const cellEnd = cellStart.getTime() + MS_HOUR
    const s = Math.max(cellStart.getTime(), start.getTime())
    const e = Math.min(cellEnd, end.getTime())
    if (e <= s) return null
    return {
      top: ((s - cellStart.getTime()) / MS_HOUR) * 100,
      height: ((e - s) / MS_HOUR) * 100,
    }
  }

  const busyIntervals = useMemo(
    () =>
      (meetings ?? [])
        .filter((m) => m.status === 'agendada')
        .map((m) => {
          const start = new Date(m.scheduled_at)
          return { start, end: new Date(start.getTime() + MEETING_DURATION_MINUTES * 60000) }
        }),
    [meetings],
  )

  // Sobreposição para o horário exato digitado manualmente (considera minutos).
  function overlapsExisting(slot: Date) {
    const slotEnd = new Date(slot.getTime() + MEETING_DURATION_MINUTES * 60000)
    return (meetings ?? []).some((m) => {
      if (m.status !== 'agendada') return false
      const start = new Date(m.scheduled_at)
      const end = new Date(start.getTime() + MEETING_DURATION_MINUTES * 60000)
      return slot < end && start < slotEnd
    })
  }

  // O `value` é a única fonte de verdade: os campos manuais são derivados dele,
  // então clicar na grade e digitar o horário exato nunca divergem.
  const manualDate = format(value ?? anchor, 'yyyy-MM-dd')
  const manualTime = value ? format(value, 'HH:mm') : ''

  function applyManual(dateStr: string, timeStr: string) {
    if (!dateStr || !timeStr) return
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hour, minute] = timeStr.split(':').map(Number)
    if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return
    const next = new Date(year, month - 1, day, hour, minute, 0, 0)
    setAnchor(next)
    onChange(next)
  }

  const slotPast = value ? isBefore(value, new Date()) : false
  const slotOverlap = value ? overlapsExisting(value) : false

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
                  const cellStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0)
                  const past = isBefore(cellStart, nowHour)

                  const busyBars = busyIntervals
                    .map((b) => overlapBar(cellStart, b.start, b.end))
                    .filter((b): b is { top: number; height: number } => b !== null)
                  const selBar = value
                    ? overlapBar(cellStart, value, new Date(value.getTime() + MEETING_DURATION_MINUTES * 60000))
                    : null

                  // Só bloqueia o clique quando a hora inteira está tomada.
                  const fullyBusy = busyBars.some((b) => b.top === 0 && b.height === 100)
                  const disabled = past || fullyBusy

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(cellStart)}
                      className={cn(
                        'relative h-9 overflow-hidden rounded text-[10px] font-medium transition-colors',
                        past ? 'cursor-not-allowed bg-white/[0.02]' : 'bg-white/5 hover:bg-gold-500/10',
                        fullyBusy && 'cursor-not-allowed',
                      )}
                      title={
                        fullyBusy
                          ? 'Horário ocupado'
                          : past
                            ? 'Horário no passado'
                            : `Disponível — clica para ${String(hour).padStart(2, '0')}:00`
                      }
                    >
                      {/* guia da meia hora, para leitura dos minutos */}
                      <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
                      {busyBars.map((b, i) => (
                        <span
                          key={i}
                          className="absolute inset-x-0 bg-danger/25"
                          style={{ top: `${b.top}%`, height: `${b.height}%` }}
                        />
                      ))}
                      {selBar && (
                        <span
                          className="absolute inset-x-0 bg-gold-500"
                          style={{ top: `${selBar.top}%`, height: `${selBar.height}%` }}
                        />
                      )}
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
        <span className="text-white/30">A barra ocupa a duração real de 1h — horários quebrados aparecem entre duas linhas.</span>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-xs font-medium text-white/60">Ou digite o horário exato (aceita minutos quebrados)</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={manualDate}
            onChange={(e) => applyManual(e.target.value, manualTime || '09:00')}
            className="rounded border border-white/10 bg-navy-950 px-2 py-1 text-xs text-white/80"
          />
          <input
            type="time"
            step={300}
            value={manualTime}
            onChange={(e) => applyManual(manualDate, e.target.value)}
            className="rounded border border-white/10 bg-navy-950 px-2 py-1 text-xs text-white/80"
          />
        </div>
        {slotPast && <p className="mt-1 text-[10px] text-danger">Esse horário já passou.</p>}
        {!slotPast && slotOverlap && (
          <p className="mt-1 text-[10px] text-danger">Atenção: esse horário se sobrepõe a outra reunião do closer.</p>
        )}
      </div>
    </div>
  )
}
