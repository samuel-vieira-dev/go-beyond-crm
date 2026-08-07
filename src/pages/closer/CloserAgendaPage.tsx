import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { useMeetingsForCloser } from '@/hooks/useMeetings'
import { Button } from '@/components/ui/Button'
import { LeadDetailModal } from '@/components/kanban/LeadDetailModal'
import { MeetingOutcomeModal } from '@/components/kanban/MeetingOutcomeModal'
import { RescheduleMeetingModal } from '@/components/kanban/RescheduleMeetingModal'
import { MonthView } from '@/components/calendar/MonthView'
import { TimeGridView } from '@/components/calendar/TimeGridView'
import { STATUS_COLOR, type CalendarView } from '@/components/calendar/calendarShared'
import { cn } from '@/lib/cn'
import type { LeadWithRelations, MeetingWithLead } from '@/types/database'

const VIEW_LABELS: Record<CalendarView, string> = { month: 'Mês', week: 'Semana', day: 'Dia' }

export function CloserAgendaPage() {
  const { profile } = useAuth()
  const [view, setView] = useState<CalendarView>('week')
  const [anchor, setAnchor] = useState(new Date())
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [outcomeLead, setOutcomeLead] = useState<LeadWithRelations | null>(null)
  const [rescheduleLead, setRescheduleLead] = useState<LeadWithRelations | null>(null)

  // Intervalo visível conforme a view (para buscar as reuniões).
  const range = useMemo(() => {
    if (view === 'month') {
      return {
        from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }).toISOString(),
        to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }).toISOString(),
      }
    }
    if (view === 'week') {
      return {
        from: startOfWeek(anchor, { weekStartsOn: 0 }).toISOString(),
        to: endOfWeek(anchor, { weekStartsOn: 0 }).toISOString(),
      }
    }
    return { from: startOfDay(anchor).toISOString(), to: endOfDay(anchor).toISOString() }
  }, [view, anchor])

  const { data: meetings, isLoading } = useMeetingsForCloser(profile?.id ?? null, range)

  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(anchor, { weekStartsOn: 0 }),
        end: endOfWeek(anchor, { weekStartsOn: 0 }),
      }),
    [anchor],
  )

  function navigate(dir: -1 | 1) {
    if (view === 'month') setAnchor((a) => addMonths(a, dir))
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7))
    else setAnchor((a) => addDays(a, dir))
  }

  function handleEventClick(m: MeetingWithLead) {
    // Sem o lead (transferido para outro closer) não há o que abrir no modal.
    if (!m.lead) return
    setSelectedLead(m.lead as unknown as LeadWithRelations)
  }

  function periodLabel() {
    if (view === 'month') return format(anchor, "MMMM 'de' yyyy", { locale: ptBR })
    if (view === 'day') return format(anchor, "EEEE, d 'de' MMMM", { locale: ptBR })
    return `${format(weekDays[0], "d MMM", { locale: ptBR })} — ${format(weekDays[6], "d MMM", { locale: ptBR })}`
  }

  function extraActions(lead: LeadWithRelations) {
    const meeting = (meetings ?? []).find((m) => m.lead_id === lead.id)
    if (meeting?.status === 'agendada') {
      return (
        <Button
          size="sm"
          onClick={() => {
            setOutcomeLead(lead)
            setSelectedLead(null)
          }}
        >
          Registrar resultado
        </Button>
      )
    }
    if (meeting?.status === 'nao_compareceu') {
      return (
        <Button
          size="sm"
          onClick={() => {
            setRescheduleLead(lead)
            setSelectedLead(null)
          }}
        >
          Reagendar
        </Button>
      )
    }
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Agenda</h1>
          <p className="text-sm text-white/40 capitalize">{periodLabel()}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              ‹
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
              Hoje
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(1)}>
              ›
            </Button>
          </div>

          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  view === v ? 'bg-gold-500 text-navy-950' : 'text-white/60 hover:bg-white/5',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* legenda de status */}
      <div className="flex flex-wrap gap-3">
        {Object.values(STATUS_COLOR).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-white/50">
            <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando agenda...</p>
      ) : view === 'month' ? (
        <MonthView
          anchor={anchor}
          meetings={meetings ?? []}
          onEventClick={handleEventClick}
          onDayClick={(day) => {
            setAnchor(day)
            setView('day')
          }}
        />
      ) : view === 'week' ? (
        <TimeGridView days={weekDays} meetings={meetings ?? []} onEventClick={handleEventClick} />
      ) : (
        <TimeGridView days={[anchor]} meetings={meetings ?? []} onEventClick={handleEventClick} />
      )}

      <LeadDetailModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        extraActions={selectedLead ? extraActions(selectedLead) : null}
      />
      <MeetingOutcomeModal lead={outcomeLead} onClose={() => setOutcomeLead(null)} />
      <RescheduleMeetingModal lead={rescheduleLead} onClose={() => setRescheduleLead(null)} />
    </div>
  )
}
