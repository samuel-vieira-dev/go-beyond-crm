import { useMemo, useState } from 'react'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { LeadFiltersBar } from '@/components/kanban/LeadFiltersBar'
import { LeadDetailModal } from '@/components/kanban/LeadDetailModal'
import { ScheduleMeetingModal } from '@/components/kanban/ScheduleMeetingModal'
import { MeetingOutcomeModal } from '@/components/kanban/MeetingOutcomeModal'
import { LostReasonModal } from '@/components/kanban/LostReasonModal'
import { Label, Select } from '@/components/ui/Field'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useChangeLeadStage, useLeads, type LeadFilters } from '@/hooks/useLeads'
import { useOperationBreakdown } from '@/hooks/useTeamPerformance'
import { simpleColumns, UNIFIED_STAGES, type LeadStage } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

export function AdminKanbanPage() {
  const columns = useMemo(() => simpleColumns(UNIFIED_STAGES), [])
  const [filters, setFilters] = useState<LeadFilters>({})
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [schedulingLead, setSchedulingLead] = useState<LeadWithRelations | null>(null)
  const [outcomeLead, setOutcomeLead] = useState<LeadWithRelations | null>(null)
  const [outcomeStep, setOutcomeStep] = useState<'attendance' | 'sale-question' | 'sale-form' | 'no-sale-form'>('attendance')
  const [lostLead, setLostLead] = useState<LeadWithRelations | null>(null)

  const { data: profiles } = useAllProfiles()
  const { data: leads, isLoading } = useLeads(filters)
  const changeStage = useChangeLeadStage()

  function handleDrop(lead: LeadWithRelations, newStage: LeadStage) {
    if (newStage === 'agendado') {
      setSchedulingLead(lead)
      return
    }
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

  const preSalers = (profiles ?? []).filter((p) => p.role === 'sdr' || p.role === 'social_seller')
  const closers = (profiles ?? []).filter((p) => p.role === 'closer')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Operação — Visão Completa</h1>
        <p className="text-sm text-white/40">Funil unificado de pré-venda e fechamento</p>
      </div>

      <LeadFiltersBar
        filters={filters}
        onChange={setFilters}
        extraFilters={
          <>
            <div>
              <Label>Responsável (pré-venda)</Label>
              <Select
                value={filters.ownerId ?? ''}
                onChange={(e) => setFilters({ ...filters, ownerId: e.target.value || undefined })}
              >
                <option value="">Todos os responsáveis</option>
                {preSalers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Closer</Label>
              <Select
                value={filters.closerId ?? ''}
                onChange={(e) => setFilters({ ...filters, closerId: e.target.value || undefined })}
              >
                <option value="">Todos os closers</option>
                {closers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        }
      />

      <OperationBreakdownPanel />

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando operação...</p>
      ) : (
        <KanbanBoard
          leads={leads ?? []}
          columns={columns}
          onCardClick={setSelectedLead}
          onDrop={handleDrop}
          showResponsible
        />
      )}

      <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      <ScheduleMeetingModal lead={schedulingLead} onClose={() => setSchedulingLead(null)} />
      <MeetingOutcomeModal lead={outcomeLead} onClose={() => setOutcomeLead(null)} initialStep={outcomeStep} />
      <LostReasonModal lead={lostLead} onClose={() => setLostLead(null)} />
    </div>
  )
}

function OperationBreakdownPanel() {
  const { data } = useOperationBreakdown()
  if (!data) return null

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <BreakdownCard title="Agendamentos por pré-vendedor" rows={data.scheduledByPresaler} />
      <BreakdownCard title="Reuniões realizadas por closer" rows={data.realizedByCloser} />
    </div>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return (
    <div className="card-surface rounded-xl p-4">
      <h2 className="mb-3 text-sm font-semibold text-white/70">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-white/30">Sem dados ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between text-sm">
              <span className="text-white">{r.name}</span>
              <span className="font-semibold text-gold-400">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
