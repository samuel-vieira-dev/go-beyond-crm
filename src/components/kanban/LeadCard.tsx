import { useDraggable } from '@dnd-kit/core'
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { LeadWithRelations } from '@/types/database'
import { ACTIVITY_TYPE_ICONS, entryChannel, STAGE_LABELS, stageAccent } from '@/types/domain'
import { Badge } from '@/components/ui/Badge'
import { useActivityReminders } from '@/context/ActivityRemindersContext'
import { cn } from '@/lib/cn'

const ACCENT_CLASSES = {
  green: 'border-l-2 border-l-success/70 bg-success/[0.07]',
  red: 'border-l-2 border-l-danger/70 bg-danger/[0.06]',
  none: '',
}

export function LeadCard({
  lead,
  onClick,
  showResponsible,
  overlay,
  draggable = true,
  shake,
}: {
  lead: LeadWithRelations
  onClick: () => void
  showResponsible?: boolean
  /** true quando renderizado dentro do DragOverlay (o clone que segue o cursor). */
  overlay?: boolean
  /** false para cards somente-leitura (ex.: já entregues ao Closer no board de pré-venda). */
  draggable?: boolean
  /** true para o card "tremer" (No-Show não visto). */
  shake?: boolean
}) {
  const accent = stageAccent(lead.stage)
  const { byLead } = useActivityReminders()
  const reminder = byLead.get(lead.id)
  const reminderOverdue = reminder?.due_at ? isPast(parseISO(reminder.due_at)) : false

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{lead.name}</p>
        {lead.is_mql && <Badge tone="gold">Qualificado</Badge>}
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge tone="neutral">{entryChannel(lead.origin)}</Badge>
        {/* mostra a etapa real quando o card está fora da sua coluna nominal (handed-off) */}
        {!draggable && (
          <Badge tone={accent === 'green' ? 'green' : accent === 'red' ? 'red' : 'neutral'}>
            {STAGE_LABELS[lead.stage]}
          </Badge>
        )}
        {showResponsible && lead.owner?.full_name && (
          <Badge tone="neutral">{lead.owner.full_name.split(' ')[0]}</Badge>
        )}
        {showResponsible && lead.closer?.full_name && (
          <Badge tone="green">Closer: {lead.closer.full_name.split(' ')[0]}</Badge>
        )}
      </div>

      {reminder && (
        <div
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
            reminderOverdue ? 'bg-danger/15 text-danger' : 'bg-gold-500/10 text-gold-300',
          )}
        >
          <span>{ACTIVITY_TYPE_ICONS[reminder.type]}</span>
          <span className="truncate">
            {reminder.title || 'Atividade'}
            {reminder.due_at && ` · ${format(parseISO(reminder.due_at), "d/MM HH:mm", { locale: ptBR })}`}
          </span>
        </div>
      )}

      {!showResponsible && (
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{lead.profession || '—'}</span>
          <span>{formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</span>
        </div>
      )}
    </>
  )

  if (overlay) {
    return (
      <div className={cn('card-surface space-y-2 rounded-lg p-3 text-left shadow-2xl shadow-navy-950/50', ACCENT_CLASSES[accent])}>
        {content}
      </div>
    )
  }

  return (
    <DraggableCard lead={lead} onClick={onClick} draggable={draggable} accentClass={ACCENT_CLASSES[accent]} shake={shake}>
      {content}
    </DraggableCard>
  )
}

function DraggableCard({
  lead,
  onClick,
  draggable,
  accentClass,
  shake,
  children,
}: {
  lead: LeadWithRelations
  onClick: () => void
  draggable: boolean
  accentClass: string
  shake?: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      onClick={onClick}
      className={cn(
        'card-surface space-y-2 rounded-lg p-3 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-gold-500/40 hover:shadow-lg hover:shadow-navy-950/30',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        accentClass,
        shake && 'animate-shake border-danger/50',
        isDragging && 'opacity-0',
      )}
    >
      {children}
    </div>
  )
}
