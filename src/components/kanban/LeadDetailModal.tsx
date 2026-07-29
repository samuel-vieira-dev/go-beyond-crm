import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FormRow, Select, Textarea } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { useAddLeadNote, useDeleteLead, useLead, useLeadEvents } from '@/hooks/useLeads'
import { useProfiles } from '@/hooks/useProfiles'
import { useReassignCloser } from '@/hooks/useMeetings'
import { LeadEditModal } from './LeadEditModal'
import { ActivitiesSection } from './ActivitiesSection'
import { ORIGIN_LABELS, STAGE_LABELS } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

const EVENT_LABELS: Record<string, string> = {
  created: 'Lead criado',
  stage_change: 'Mudou de etapa',
  note: 'Nota adicionada',
  meeting_booked: 'Reunião agendada',
  meeting_outcome: 'Resultado da reunião registrado',
  sale: 'Venda registrada',
  claimed: 'Lead assumido',
}

export function LeadDetailModal({
  lead,
  onClose,
  extraActions,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
  extraActions?: React.ReactNode
}) {
  const { profile } = useAuth()
  const deleteLead = useDeleteLead()
  const addNote = useAddLeadNote()
  const reassignCloser = useReassignCloser()
  const isAdmin = profile?.role === 'admin'
  // SDR e Social Seller também trocam o closer (ex.: closer indisponível).
  const canAssignCloser =
    profile?.role === 'admin' || profile?.role === 'sdr' || profile?.role === 'social_seller'
  const { data: preSalers } = useProfiles(undefined)
  const { data: liveLead } = useLead(lead?.id ?? null)
  const { data: events } = useLeadEvents(lead?.id ?? null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)

  const current = liveLead ?? lead

  useEffect(() => {
    setNote(current?.notes ?? '')
  }, [current?.id, current?.notes])

  if (!lead || !current) return null

  const canEdit = profile?.role !== undefined
  const whatsappDigits = current.whatsapp.replace(/\D/g, '')

  return (
    <Modal open={!!lead} onClose={onClose} title={current.name} width="lg">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">{STAGE_LABELS[current.stage]}</Badge>
            <Badge tone="blue">{ORIGIN_LABELS[current.origin]}</Badge>
            {current.is_mql && <Badge tone="green">Qualificado</Badge>}
            {canEdit && (
              <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setEditing(true)}>
                ✎ Editar
              </Button>
            )}
          </div>

          <dl className="space-y-2 text-sm">
            <Row label="WhatsApp">
              <a
                href={`https://wa.me/55${whatsappDigits}`}
                target="_blank"
                rel="noreferrer"
                className="text-gold-400 hover:underline"
              >
                {current.whatsapp}
              </a>
            </Row>
            <Row label="Email">{current.email || '—'}</Row>
            <Row label="Instagram">{current.instagram || '—'}</Row>
            <Row label="Profissão">{current.profession || '—'}</Row>
            <Row label="Renda">{current.income_range || '—'}</Row>
            <Row label="Responsável">{current.owner?.full_name || 'Sem responsável'}</Row>
            <Row label="Closer">{current.closer?.full_name || '—'}</Row>
            <Row label="Cadastrado em">
              {format(new Date(current.created_at), "d 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR })}
            </Row>
          </dl>

          {canAssignCloser && (
            <div className="card-surface space-y-2 rounded-lg p-3">
              <p className="text-xs font-medium text-gold-400 uppercase">Closer responsável</p>
              <Select
                value={current.closer_id ?? ''}
                disabled={reassignCloser.isPending}
                onChange={async (e) => {
                  const value = e.target.value || null
                  try {
                    await reassignCloser.mutateAsync({ leadId: current.id, closerId: value })
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Não foi possível trocar o closer.')
                  }
                }}
              >
                <option value="">—</option>
                {(preSalers ?? [])
                  .filter((p) => p.role === 'closer')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </Select>
              <p className="text-[11px] text-white/30">
                Se já houver reunião agendada, ela é transferida para o novo closer.
                {isAdmin && ' A distribuição de leads para SDR é automática (round-robin).'}
              </p>
            </div>
          )}

          {current.quiz_answers && Object.keys(current.quiz_answers).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-white/50 uppercase">Respostas do quiz</p>
              <div className="card-surface space-y-1 rounded-lg p-3 text-xs text-white/70">
                {Object.entries(current.quiz_answers).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-white/40">{k}</span>
                    <span className="text-right">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {current.utm && Object.keys(current.utm).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-white/50 uppercase">UTMs / Rastreio</p>
              <div className="card-surface space-y-1 rounded-lg p-3 text-xs text-white/70">
                {Object.entries(current.utm).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-white/40">{k}</span>
                    <span className="text-right break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <FormRow label="Notas">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </FormRow>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={addNote.isPending || note === (current.notes ?? '')}
                onClick={() => addNote.mutate({ leadId: current.id, note })}
              >
                Salvar nota
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {extraActions}
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              disabled={deleteLead.isPending}
              onClick={async () => {
                if (!confirm(`Excluir o lead "${current.name}"? Esta ação não pode ser desfeita.`)) return
                try {
                  await deleteLead.mutateAsync(current.id)
                  onClose()
                } catch {
                  alert('Não foi possível excluir o lead.')
                }
              }}
            >
              🗑 Excluir lead
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-white/50 uppercase">Histórico</p>
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {events?.length === 0 && <p className="text-xs text-white/30">Sem eventos ainda.</p>}
            {events?.map((ev) => (
              <div key={ev.id} className="border-l-2 border-white/10 pl-3 text-xs">
                <p className="text-white/80">
                  {EVENT_LABELS[ev.type] ?? ev.type}
                  {ev.to_stage && <span className="text-white/40"> → {STAGE_LABELS[ev.to_stage]}</span>}
                </p>
                <p className="text-white/30">
                  {ev.actor?.full_name ?? 'Sistema'} ·{' '}
                  {format(new Date(ev.created_at), "d MMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ActivitiesSection leadId={current.id} />

      <LeadEditModal lead={editing ? current : null} onClose={() => setEditing(false)} />
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-right text-white">{children}</dd>
    </div>
  )
}
