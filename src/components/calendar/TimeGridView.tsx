import { format, isSameDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { MeetingWithLead } from '@/types/database'
import { cn } from '@/lib/cn'
import { END_HOUR, eventTopPx, HOUR_HEIGHT, HOURS, START_HOUR, STATUS_COLOR } from './calendarShared'

export function TimeGridView({
  days,
  meetings,
  onEventClick,
}: {
  days: Date[]
  meetings: MeetingWithLead[]
  onEventClick: (meeting: MeetingWithLead) => void
}) {
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT

  function meetingsFor(day: Date) {
    return meetings
      .filter((m) => isSameDay(new Date(m.scheduled_at), day))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  }

  return (
    <div className="card-surface overflow-hidden rounded-xl">
      {/* cabeçalho dos dias */}
      <div
        className="grid border-b border-white/10"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-white/10" />
        {days.map((day) => (
          <div key={day.toISOString()} className="border-r border-white/10 px-2 py-2 text-center last:border-r-0">
            <p className="text-[11px] text-white/40 uppercase">{format(day, 'EEE', { locale: ptBR })}</p>
            <p
              className={cn(
                'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                isToday(day) ? 'bg-gold-500 text-navy-950' : 'text-white',
              )}
            >
              {format(day, 'd')}
            </p>
          </div>
        ))}
      </div>

      {/* grade de horas */}
      <div className="max-h-[600px] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: totalHeight }}
        >
          {/* coluna de horas */}
          <div className="relative border-r border-white/10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-white/30"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* colunas dos dias */}
          {days.map((day) => {
            const dayMeetings = meetingsFor(day)
            return (
              <div key={day.toISOString()} className="relative border-r border-white/10 last:border-r-0">
                {/* linhas de hora */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-white/[0.06]"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}

                {/* eventos */}
                {dayMeetings.map((m) => {
                  const color = STATUS_COLOR[m.status]
                  const start = new Date(m.scheduled_at)
                  return (
                    <button
                      key={m.id}
                      onClick={() => onEventClick(m)}
                      className="absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm transition-transform hover:scale-[1.02]"
                      style={{ top: eventTopPx(start) + 1, height: HOUR_HEIGHT - 3, background: color.bg }}
                      title={`${format(start, 'HH:mm')} · ${m.lead.name} — ${color.label}`}
                    >
                      <p className="truncate text-[11px] font-semibold" style={{ color: color.text }}>
                        {format(start, 'HH:mm')} {m.lead.name}
                      </p>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
