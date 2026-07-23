import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { useActiveMeetingForLead, useSetMeetingAttendance } from '@/hooks/useMeetings'
import { useProducts } from '@/hooks/useProducts'
import { useRegisterNoSale, useRegisterSale } from '@/hooks/useSales'
import { LOST_REASONS } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

type Step = 'attendance' | 'sale-question' | 'sale-form' | 'no-sale-form'

export function MeetingOutcomeModal({
  lead,
  onClose,
  initialStep = 'attendance',
}: {
  lead: LeadWithRelations | null
  onClose: () => void
  initialStep?: Step
}) {
  const { data: meeting } = useActiveMeetingForLead(lead?.id ?? null)
  const setAttendance = useSetMeetingAttendance()
  const { data: products } = useProducts()
  const registerSale = useRegisterSale()
  const registerNoSale = useRegisterNoSale()

  const [step, setStep] = useState<Step>(initialStep)
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('')
  const [outcome, setOutcome] = useState<'follow_up' | 'lost'>('follow_up')
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0])

  useEffect(() => {
    if (lead) setStep(initialStep)
  }, [lead?.id, initialStep])

  if (!lead) return null

  function reset() {
    setStep(initialStep)
    setProductId('')
    setAmount('')
    setOutcome('follow_up')
    setLostReason(LOST_REASONS[0])
  }

  function close() {
    reset()
    onClose()
  }

  async function handleAttendance(attended: boolean) {
    if (!meeting) return
    await setAttendance.mutateAsync({ meetingId: meeting.id, leadId: lead!.id, attended })
    if (attended) setStep('sale-question')
    else close()
  }

  function selectProduct(id: string) {
    setProductId(id)
    const p = products?.find((pr) => pr.id === id)
    if (p) setAmount(String(p.default_price))
  }

  async function handleSale() {
    if (!productId || !amount) return
    await registerSale.mutateAsync({
      leadId: lead!.id,
      meetingId: meeting?.id ?? null,
      productId,
      amount: Number(amount),
    })
    close()
  }

  async function handleNoSale() {
    await registerNoSale.mutateAsync({
      leadId: lead!.id,
      lost: outcome === 'lost',
      lostReason: outcome === 'lost' ? lostReason : undefined,
    })
    close()
  }

  return (
    <Modal open={!!lead} onClose={close} title={`Resultado da reunião — ${lead.name}`} width="sm">
      {step === 'attendance' && (
        <div className="space-y-4">
          <p className="text-sm text-white/60">O lead compareceu à reunião?</p>
          {!meeting ? (
            <p className="text-xs text-white/40">
              Nenhuma reunião em aberto encontrada para este lead.
            </p>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => handleAttendance(true)} disabled={setAttendance.isPending}>
                Compareceu
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => handleAttendance(false)}
                disabled={setAttendance.isPending}
              >
                Não compareceu
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'sale-question' && (
        <div className="space-y-4">
          <p className="text-sm text-white/60">Fechou a venda?</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setStep('sale-form')}>
              Vendeu
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setStep('no-sale-form')}>
              Não vendeu
            </Button>
          </div>
        </div>
      )}

      {step === 'sale-form' && (
        <div className="space-y-4">
          <FormRow label="Produto *">
            <Select required value={productId} onChange={(e) => selectProduct(e.target.value)}>
              <option value="">Selecione</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Valor da venda (R$) *">
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormRow>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep('sale-question')}>
              Voltar
            </Button>
            <Button onClick={handleSale} disabled={registerSale.isPending || !productId || !amount}>
              {registerSale.isPending ? 'Salvando...' : 'Confirmar venda'}
            </Button>
          </div>
        </div>
      )}

      {step === 'no-sale-form' && (
        <div className="space-y-4">
          <FormRow label="O que fazer com o lead?">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value as 'follow_up' | 'lost')}>
              <option value="follow_up">Enviar para Follow-up de Fechamento</option>
              <option value="lost">Marcar como Perdido</option>
            </Select>
          </FormRow>
          {outcome === 'lost' && (
            <FormRow label="Motivo">
              <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </FormRow>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep('sale-question')}>
              Voltar
            </Button>
            <Button onClick={handleNoSale} disabled={registerNoSale.isPending}>
              {registerNoSale.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
