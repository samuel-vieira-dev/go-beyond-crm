import { format, isPast, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useToggleActivity } from '@/hooks/useActivities'
import { useActivityReminders } from '@/context/ActivityRemindersContext'
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from '@/types/domain'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

export function AlertsPage() {
  const { pending } = useActivityReminders()
  const toggle = useToggleActivity()

  const all = pending
  const overdue = all.filter((a) => a.due_at && isPast(parseISO(a.due_at)) && !isToday(parseISO(a.due_at)))
  const today = all.filter((a) => a.due_at && isToday(parseISO(a.due_at)))
  const upcoming = all.filter((a) => !a.due_at || (!isPast(parseISO(a.due_at)) && !isToday(parseISO(a.due_at))))

  const sections = [
    { title: 'Vencidas', items: overdue, tone: 'red' as const },
    { title: 'Para hoje', items: today, tone: 'gold' as const },
    { title: 'Próximas', items: upcoming, tone: 'neutral' as const },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Alertas e Atividades</h1>
        <p className="text-sm text-white/40">Suas atividades pendentes com clientes</p>
      </div>

      {all.length === 0 ? (
        <div className="card-surface rounded-xl p-8 text-center text-sm text-white/40">
          🎉 Nenhuma atividade pendente. Tudo em dia!
        </div>
      ) : (
        sections.map(
          (section) =>
            section.items.length > 0 && (
              <div key={section.title}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white/70">{section.title}</h2>
                  <Badge tone={section.tone}>{section.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {section.items.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        'card-surface flex items-start gap-3 rounded-xl p-3',
                        section.tone === 'red' && 'border-danger/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggle.mutate({ id: a.id, done: true })}
                        className="mt-1 h-4 w-4 accent-gold-500"
                        title="Concluir"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">
                          {ACTIVITY_TYPE_ICONS[a.type]} {a.title || ACTIVITY_TYPE_LABELS[a.type]}
                        </p>
                        <p className="text-xs text-white/50">
                          {a.lead?.name ?? 'Lead'}
                          {a.lead?.whatsapp && ` · ${a.lead.whatsapp}`}
                        </p>
                        {a.notes && <p className="mt-1 text-xs text-white/40">{a.notes}</p>}
                      </div>
                      {a.due_at && (
                        <span
                          className={cn(
                            'shrink-0 text-xs',
                            section.tone === 'red' ? 'font-medium text-danger' : 'text-white/40',
                          )}
                        >
                          {format(parseISO(a.due_at), "d MMM 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ),
        )
      )}
    </div>
  )
}
