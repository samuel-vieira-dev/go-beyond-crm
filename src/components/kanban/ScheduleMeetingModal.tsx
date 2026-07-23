import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Select } from '@/components/ui/Field'
import { SlotPickerCalendar } from '@/components/calendar/SlotPickerCalendar'
import { useProfiles } from '@/hooks/useProfiles'
import { useScheduleMeeting } from '@/hooks/useMeetings'
import type { LeadWithRelations } from '@/types/database'

export function ScheduleMeetingModal({
  lead,
  onClose,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
}) {
  const { data: closers } = useProfiles('closer')
  const scheduleMeeting = useScheduleMeeting()
  const [closerId, setCloserId] = useState('')
  const [slot, setSlot] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reseta o horário escolhido ao trocar de closer ou reabrir.
  useEffect(() => {
    setSlot(null)
    setError(null)
  }, [closerId, lead?.id])

  useEffect(() => {
    if (!lead) {
      setCloserId('')
      setSlot(null)
      setError(null)
    }
  }, [lead])

  async function handleConfirm() {
    if (!lead || !closerId || !slot) return
    setError(null)
    try {
      await scheduleMeeting.mutateAsync({
        leadId: lead.id,
        closerId,
        scheduledAt: slot.toISOString(),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível agendar.')
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`Agendar reunião — ${lead?.name ?? ''}`} width="lg">
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
            <p className="mb-2 text-xs font-medium text-white/60">
              Escolha um horário livre na agenda do closer
            </p>
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
                Selecionado:{' '}
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
            <Button onClick={handleConfirm} disabled={!closerId || !slot || scheduleMeeting.isPending}>
              {scheduleMeeting.isPending ? 'Agendando...' : 'Agendar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
