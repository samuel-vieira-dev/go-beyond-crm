import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Select } from '@/components/ui/Field'
import { SlotPickerCalendar } from '@/components/calendar/SlotPickerCalendar'
import { useProfiles } from '@/hooks/useProfiles'
import { useLatestMeetingForLead, useRescheduleMeeting } from '@/hooks/useMeetings'
import type { LeadWithRelations } from '@/types/database'

export function RescheduleMeetingModal({
  lead,
  onClose,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
}) {
  const { data: closers } = useProfiles('closer')
  const { data: latestMeeting } = useLatestMeetingForLead(lead?.id ?? null)
  const rescheduleMeeting = useRescheduleMeeting()
  const [closerId, setCloserId] = useState('')
  const [slot, setSlot] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pré-seleciona o closer da reunião anterior.
  useEffect(() => {
    if (latestMeeting?.closer_id) setCloserId(latestMeeting.closer_id)
  }, [latestMeeting?.closer_id])

  useEffect(() => {
    setSlot(null)
    setError(null)
  }, [closerId, lead?.id])

  async function handleConfirm() {
    if (!lead || !latestMeeting || !closerId || !slot) return
    setError(null)
    try {
      await rescheduleMeeting.mutateAsync({
        oldMeetingId: latestMeeting.id,
        leadId: lead.id,
        closerId,
        scheduledAt: slot.toISOString(),
      })
      setSlot(null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reagendar.')
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`Reagendar reunião — ${lead?.name ?? ''}`} width="lg">
      <div className="space-y-4">
        <FormRow label="Closer *">
          <Select value={closerId} onChange={(e) => setCloserId(e.target.value)}>
            <option value="">Selecione um closer</option>
            {closers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </FormRow>

        {closerId ? (
          <div>
            <p className="mb-2 text-xs font-medium text-white/60">Escolha um novo horário livre</p>
            <SlotPickerCalendar closerId={closerId} value={slot} onChange={setSlot} />
          </div>
        ) : (
          <p className="rounded-lg bg-white/5 p-4 text-center text-sm text-white/40">
            Selecione um closer para ver os horários disponíveis.
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <p className="text-sm text-white/60">
            {slot ? (
              <>
                Novo horário:{' '}
                <span className="font-semibold text-gold-400">
                  {format(slot, "EEE, d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </span>
              </>
            ) : (
              'Nenhum horário selecionado'
            )}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={!latestMeeting || !closerId || !slot || rescheduleMeeting.isPending}>
              {rescheduleMeeting.isPending ? 'Reagendando...' : 'Reagendar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
