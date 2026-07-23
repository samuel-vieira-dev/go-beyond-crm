import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { LeadWithRelations } from '@/types/database'
import type { BoardColumn, LeadStage } from '@/types/domain'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'

export function KanbanBoard({
  leads,
  columns,
  onCardClick,
  onDrop,
  showResponsible,
  lockedStages,
  shakeNoShow,
}: {
  leads: LeadWithRelations[]
  columns: BoardColumn[]
  onCardClick: (lead: LeadWithRelations) => void
  onDrop: (lead: LeadWithRelations, columnId: LeadStage) => void
  showResponsible?: boolean
  lockedStages?: LeadStage[]
  /** true nos boards de pré-venda: cards em No-Show tremem até serem abertos. */
  shakeNoShow?: boolean
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeLead, setActiveLead] = useState<LeadWithRelations | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  function handleDragStart(event: DragStartEvent) {
    setActiveLead((event.active.data.current?.lead as LeadWithRelations) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return
    const columnId = over.id as LeadStage
    const lead = active.data.current?.lead as LeadWithRelations | undefined
    if (!lead) return
    const target = columns.find((c) => c.id === columnId)
    if (!target || target.stages.includes(lead.stage)) return
    onDrop(lead, columnId)
  }

  function handleCardClick(lead: LeadWithRelations) {
    if (shakeNoShow && lead.stage === 'reuniao_nao_realizada') {
      setAcknowledged((s) => new Set(s).add(lead.id))
    }
    onCardClick(lead)
  }

  function isShaking(lead: LeadWithRelations) {
    return !!shakeNoShow && lead.stage === 'reuniao_nao_realizada' && !acknowledged.has(lead.id)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLead(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            leads={leads}
            onCardClick={handleCardClick}
            showResponsible={showResponsible}
            lockedStages={lockedStages}
            isShaking={isShaking}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeLead ? (
          <div className="w-72 rotate-2 cursor-grabbing">
            <LeadCard lead={activeLead} onClick={() => {}} showResponsible={showResponsible} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
