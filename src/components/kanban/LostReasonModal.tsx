import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Select } from '@/components/ui/Field'
import { useMarkLeadLost } from '@/hooks/useLeads'
import { LOST_REASONS, STAGE_LABELS } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

/**
 * Marcar perda não move o card de etapa — só o esconde do board.
 *
 * A etapa fica onde estava porque é ela que responde "onde perdemos": perder na
 * qualificação e perder no follow-up de fechamento são problemas diferentes. Para
 * rever os perdidos, o filtro "Ver Leads Perdidos" traz cada um de volta na coluna
 * em que parou.
 */
export function LostReasonModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
  /** Só depois de marcar de fato — cancelar não dispara. */
  onSaved?: () => void
}) {
  const markLost = useMarkLeadLost()
  const [reason, setReason] = useState<string>(LOST_REASONS[0])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!lead) return
    try {
      await markLost.mutateAsync({ leadId: lead.id, reason })
      onClose()
      onSaved?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível marcar o lead como perdido.')
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`Marcar como perdido — ${lead?.name ?? ''}`} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Motivo">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormRow>
        <p className="text-xs text-white/40">
          O card sai do kanban{lead && ` (etapa "${STAGE_LABELS[lead.stage]}" fica registrada)`}. Para
          revê-lo, ligue <span className="text-white/70">Ver Leads Perdidos</span> nos filtros.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={markLost.isPending}>
            {markLost.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
