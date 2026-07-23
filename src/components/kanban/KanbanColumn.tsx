import { useDroppable } from '@dnd-kit/core'
import type { LeadWithRelations } from '@/types/database'
import type { BoardColumn, LeadStage } from '@/types/domain'
import { LeadCard } from './LeadCard'
import { cn } from '@/lib/cn'

export function KanbanColumn({
  column,
  leads,
  onCardClick,
  showResponsible,
  lockedStages,
  isShaking,
}: {
  column: BoardColumn
  leads: LeadWithRelations[]
  onCardClick: (lead: LeadWithRelations) => void
  showResponsible?: boolean
  lockedStages?: LeadStage[]
  isShaking?: (lead: LeadWithRelations) => boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const columnLeads = leads.filter((l) => column.stages.includes(l.stage))

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">{column.title}</h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
          {columnLeads.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-transparent p-2 transition-colors',
          isOver ? 'border-gold-500/40 bg-gold-500/5' : 'bg-white/[0.02]',
        )}
      >
        {columnLeads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onClick={() => onCardClick(lead)}
            showResponsible={showResponsible}
            draggable={!lockedStages?.includes(lead.stage)}
            shake={isShaking?.(lead)}
          />
        ))}
        {columnLeads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-white/25">Nenhum lead aqui</p>
        )}
      </div>
    </div>
  )
}
