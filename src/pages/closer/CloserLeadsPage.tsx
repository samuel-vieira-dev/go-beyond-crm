import { useMemo, useState } from 'react'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { LeadFiltersBar } from '@/components/kanban/LeadFiltersBar'
import { LeadDetailModal } from '@/components/kanban/LeadDetailModal'
import { MeetingOutcomeModal } from '@/components/kanban/MeetingOutcomeModal'
import { RescheduleMeetingModal } from '@/components/kanban/RescheduleMeetingModal'
import { LostReasonModal } from '@/components/kanban/LostReasonModal'
import { Button } from '@/components/ui/Button'
import { useChangeLeadStage, useLeads, type LeadFilters } from '@/hooks/useLeads'
import { CLOSER_STAGES, simpleColumns, type LeadStage } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

export function CloserLeadsPage() {
  const [filters, setFilters] = useState<LeadFilters>({ stages: CLOSER_STAGES })
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [outcomeLead, setOutcomeLead] = useState<LeadWithRelations | null>(null)
  const [outcomeStep, setOutcomeStep] = useState<'attendance' | 'sale-question' | 'sale-form' | 'no-sale-form'>('attendance')
  const [rescheduleLead, setRescheduleLead] = useState<LeadWithRelations | null>(null)
  const [lostLead, setLostLead] = useState<LeadWithRelations | null>(null)

  const columns = useMemo(() => simpleColumns(CLOSER_STAGES), [])
  const { data: leads, isLoading } = useLeads(filters)
  const changeStage = useChangeLeadStage()

  function handleDrop(lead: LeadWithRelations, newStage: LeadStage) {
    if (newStage === 'reuniao_realizada' || newStage === 'reuniao_nao_realizada') {
      setOutcomeStep('attendance')
      setOutcomeLead(lead)
      return
    }
    if (newStage === 'venda_fechada') {
      setOutcomeStep('sale-form')
      setOutcomeLead(lead)
      return
    }
    if (newStage === 'perdido') {
      setLostLead(lead)
      return
    }
    changeStage.mutate({ leadId: lead.id, fromStage: lead.stage, toStage: newStage })
  }

  function extraActionsFor(lead: LeadWithRelations) {
    if (lead.stage === 'reuniao_agendada') {
      return (
        <Button
          size="sm"
          onClick={() => {
            setOutcomeStep('attendance')
            setOutcomeLead(lead)
            setSelectedLead(null)
          }}
        >
          Registrar resultado
        </Button>
      )
    }
    if (lead.stage === 'reuniao_nao_realizada') {
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
    if (lead.stage === 'reuniao_realizada' || lead.stage === 'follow_up_fechamento') {
      return (
        <Button
          size="sm"
          onClick={() => {
            setOutcomeStep('sale-question')
            setOutcomeLead(lead)
            setSelectedLead(null)
          }}
        >
          Registrar venda / resultado
        </Button>
      )
    }
    return null
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Meus Leads — Closer</h1>
        <p className="text-sm text-white/40">Reuniões agendadas até o fechamento</p>
      </div>

      <LeadFiltersBar
        filters={filters}
        onChange={(f) => setFilters({ ...f, stages: CLOSER_STAGES })}
        hideQualification
      />

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando leads...</p>
      ) : (
        <KanbanBoard
          leads={leads ?? []}
          columns={columns}
          onCardClick={setSelectedLead}
          onDrop={handleDrop}
        />
      )}

      <LeadDetailModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        extraActions={selectedLead ? extraActionsFor(selectedLead) : null}
      />

      <MeetingOutcomeModal lead={outcomeLead} onClose={() => setOutcomeLead(null)} initialStep={outcomeStep} />
      <RescheduleMeetingModal lead={rescheduleLead} onClose={() => setRescheduleLead(null)} />
      <LostReasonModal lead={lostLead} onClose={() => setLostLead(null)} />
    </div>
  )
}
