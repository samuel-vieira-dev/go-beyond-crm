import { useMemo, useState } from 'react'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { LeadFiltersBar } from '@/components/kanban/LeadFiltersBar'
import { LeadFormModal } from '@/components/kanban/LeadFormModal'
import { LeadDetailModal } from '@/components/kanban/LeadDetailModal'
import { ScheduleMeetingModal } from '@/components/kanban/ScheduleMeetingModal'
import { RescheduleMeetingModal } from '@/components/kanban/RescheduleMeetingModal'
import { Button } from '@/components/ui/Button'
import { useChangeLeadStage, useLeads, type LeadFilters } from '@/hooks/useLeads'
import { HANDED_OFF_STAGES, type BoardColumn, type LeadOrigin, type LeadStage } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

export function PresalesBoard({
  title,
  subtitle,
  columns,
  defaultOrigin,
  originOptions,
  newLeadStage,
  newLeadFormTag,
}: {
  title: string
  subtitle: string
  columns: BoardColumn[]
  defaultOrigin: LeadOrigin
  originOptions: LeadOrigin[]
  /** Etapa em que o lead cadastrado nasce (default: Novo Lead). */
  newLeadStage?: LeadStage
  /** Tag de canal aplicada ao lead cadastrado manualmente. */
  newLeadFormTag?: string
}) {
  const boardStages = useMemo(
    () => Array.from(new Set(columns.flatMap((c) => c.stages))),
    [columns],
  )

  const [filters, setFilters] = useState<LeadFilters>({ stages: boardStages })
  const [formOpen, setFormOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [schedulingLead, setSchedulingLead] = useState<LeadWithRelations | null>(null)
  const [rescheduleLead, setRescheduleLead] = useState<LeadWithRelations | null>(null)

  const { data: leads, isLoading } = useLeads(filters)
  const changeStage = useChangeLeadStage()

  // Remarcar disponível para leads já entregues ao closer mas ainda em aberto.
  function extraActionsFor(lead: LeadWithRelations) {
    if (lead.stage === 'reuniao_agendada' || lead.stage === 'reuniao_nao_realizada') {
      return (
        <Button
          size="sm"
          onClick={() => {
            setRescheduleLead(lead)
            setSelectedLead(null)
          }}
        >
          Remarcar reunião
        </Button>
      )
    }
    return null
  }

  function handleDrop(lead: LeadWithRelations, columnId: LeadStage) {
    if (columnId === 'agendado') {
      setSchedulingLead(lead)
      return
    }
    changeStage.mutate({ leadId: lead.id, fromStage: lead.stage, toStage: columnId })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-white/40">{subtitle}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>+ Cadastrar Lead</Button>
      </div>

      <LeadFiltersBar
        filters={filters}
        onChange={(f) => setFilters({ ...f, stages: boardStages })}
        originOptions={originOptions}
      />

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando leads...</p>
      ) : (
        <KanbanBoard
          leads={leads ?? []}
          columns={columns}
          onCardClick={setSelectedLead}
          onDrop={handleDrop}
          lockedStages={HANDED_OFF_STAGES}
          shakeNoShow
        />
      )}

      <LeadFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaultOrigin={defaultOrigin}
        originOptions={originOptions}
        stage={newLeadStage}
        formTag={newLeadFormTag}
      />

      <LeadDetailModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        extraActions={selectedLead ? extraActionsFor(selectedLead) : null}
      />

      <ScheduleMeetingModal lead={schedulingLead} onClose={() => setSchedulingLead(null)} />

      <RescheduleMeetingModal lead={rescheduleLead} onClose={() => setRescheduleLead(null)} />

    </div>
  )
}
