import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Select } from '@/components/ui/Field'
import { useChangeLeadStage } from '@/hooks/useLeads'
import { LOST_REASONS } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

export function LostReasonModal({
  lead,
  onClose,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
}) {
  const changeStage = useChangeLeadStage()
  const [reason, setReason] = useState<string>(LOST_REASONS[0])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!lead) return
    await changeStage.mutateAsync({
      leadId: lead.id,
      fromStage: lead.stage,
      toStage: 'perdido',
      extra: { lost_reason: reason },
    })
    onClose()
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
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={changeStage.isPending}>
            {changeStage.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
