import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { useProducts } from '@/hooks/useProducts'
import { useCreateCloserQuickLead, type CloserQuickLeadInput } from '@/hooks/useCloserQuickLead'
import { LOST_REASONS } from '@/types/domain'

type Step = 'lead' | 'attendance' | 'sale-question' | 'sale-form' | 'no-sale-form'

/**
 * Lançamento de lead que não passou pelo kanban, pelo próprio closer.
 *
 * O menu é curto de propósito: nome + data, e depois uma pergunta por tela
 * (realizou? vendeu? quanto?). Não é cadastro de lead — é fechar o buraco de um
 * lead retroativo em dez segundos, então nada além do que muda um número do
 * relatório é perguntado.
 *
 * Data futura encerra o fluxo no agendamento: o resultado dela vai ser registrado
 * quando acontecer, pelo caminho normal do card.
 */
export function QuickCloserLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: products } = useProducts()
  const createLead = useCreateCloserQuickLead()

  const [step, setStep] = useState<Step>('lead')
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('')
  const [outcome, setOutcome] = useState<'follow_up' | 'lost'>('follow_up')
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0])
  const [error, setError] = useState<string | null>(null)

  const isFuture = !!scheduledAt && new Date(scheduledAt).getTime() > Date.now()
  const canStart = name.trim().length > 0 && !!scheduledAt

  function close() {
    setStep('lead')
    setName('')
    setWhatsapp('')
    setScheduledAt('')
    setProductId('')
    setAmount('')
    setOutcome('follow_up')
    setLostReason(LOST_REASONS[0])
    setError(null)
    onClose()
  }

  async function save(result: Omit<CloserQuickLeadInput, 'name' | 'whatsapp' | 'scheduledAt'>) {
    setError(null)
    try {
      await createLead.mutateAsync({
        name,
        whatsapp: whatsapp || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        ...result,
      })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o lançamento.')
    }
  }

  function selectProduct(id: string) {
    setProductId(id)
    const p = products?.find((pr) => pr.id === id)
    if (p) setAmount(String(p.default_price))
  }

  const saving = createLead.isPending

  return (
    <Modal open={open} onClose={close} title="Adicionar lead fora do kanban" width="sm">
      <div className="space-y-4">
        {step === 'lead' && (
          <>
            <FormRow label="Nome *">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do lead"
              />
            </FormRow>

            <FormRow label="WhatsApp">
              <Input
                placeholder="opcional"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </FormRow>

            <FormRow label="Data e hora da reunião *">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </FormRow>

            <p className="text-xs text-white/40">
              {isFuture
                ? 'Data futura: entra como reunião agendada na sua agenda. O resultado você registra no card, depois que ela acontecer.'
                : 'Reunião, venda e faturamento contam no dia informado — o relatório daquele dia se corrige sozinho.'}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={close}>
                Cancelar
              </Button>
              {isFuture ? (
                <Button disabled={!canStart || saving} onClick={() => save({ attended: null })}>
                  {saving ? 'Salvando...' : 'Agendar'}
                </Button>
              ) : (
                <Button disabled={!canStart} onClick={() => setStep('attendance')}>
                  Continuar
                </Button>
              )}
            </div>
          </>
        )}

        {step === 'attendance' && (
          <>
            <p className="text-sm text-white/60">A reunião foi realizada?</p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={saving} onClick={() => setStep('sale-question')}>
                Realizada
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={saving}
                onClick={() => save({ attended: false })}
              >
                Não realizada
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setStep('lead')}>
                Voltar
              </Button>
            </div>
          </>
        )}

        {step === 'sale-question' && (
          <>
            <p className="text-sm text-white/60">Fechou a venda?</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setStep('sale-form')}>
                Vendeu
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => setStep('no-sale-form')}>
                Não vendeu
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setStep('attendance')}>
                Voltar
              </Button>
            </div>
          </>
        )}

        {step === 'sale-form' && (
          <>
            <FormRow label="Produto *">
              <Select value={productId} onChange={(e) => selectProduct(e.target.value)}>
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep('sale-question')}>
                Voltar
              </Button>
              <Button
                disabled={!productId || !amount || saving}
                onClick={() => save({ attended: true, sold: true, productId, amount: Number(amount) })}
              >
                {saving ? 'Salvando...' : 'Confirmar venda'}
              </Button>
            </div>
          </>
        )}

        {step === 'no-sale-form' && (
          <>
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
              <Button
                disabled={saving}
                onClick={() =>
                  save({
                    attended: true,
                    sold: false,
                    outcome,
                    lostReason: outcome === 'lost' ? lostReason : undefined,
                  })
                }
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
