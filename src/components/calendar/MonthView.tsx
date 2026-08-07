import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { MeetingWithLead } from '@/types/database'
import { cn } from '@/lib/cn'
import { STATUS_COLOR } from './calendarShared'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function MonthView({
  anchor,
  meetings,
  onEventClick,
  onDayClick,
}: {
  anchor: Date
  meetings: MeetingWithLead[]
  onEventClick: (meeting: MeetingWithLead) => void
  onDayClick: (day: Date) => void
}) {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  function meetingsFor(day: Date) {
    return meetings
      .filter((m) => isSameDay(new Date(m.scheduled_at), day))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  }

  return (
    <div className="card-surface overflow-hidden rounded-xl">
      <div className="grid grid-cols-7 border-b border-white/10">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-medium text-white/40 uppercase">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayMeetings = meetingsFor(day)
          const inMonth = isSameMonth(day, anchor)
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[104px] border-r border-b border-white/[0.06] p-1.5 text-left transition-colors last:border-r-0 hover:bg-white/[0.03]',
                !inMonth && 'bg-white/[0.01]',
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                    isToday(day)
                      ? 'bg-gold-500 text-navy-950'
                      : inMonth
                        ? 'text-white/80'
                        : 'text-white/25',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>

              <div className="space-y-1">
                {dayMeetings.slice(0, 3).map((m) => {
                  const color = STATUS_COLOR[m.status]
                  const leadName = m.lead?.name ?? 'Lead indisponível'
                  return (
                    <div
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(m)
                      }}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-white/80 hover:bg-white/10"
                      title={`${format(new Date(m.scheduled_at), 'HH:mm')} · ${leadName} — ${color.label}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color.dot }} />
                      <span className="shrink-0 text-white/50">{format(new Date(m.scheduled_at), 'HH:mm')}</span>
                      <span className="truncate">{leadName}</span>
                    </div>
                  )
                })}
                {dayMeetings.length > 3 && (
                  <p className="px-1 text-[10px] text-white/40">+{dayMeetings.length - 3} mais</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
