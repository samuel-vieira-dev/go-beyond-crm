import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select, Textarea } from '@/components/ui/Field'
import { useCreateLead } from '@/hooks/useLeads'
import { INCOME_RANGES, ORIGIN_LABELS, type LeadOrigin, type LeadStage } from '@/types/domain'

export function LeadFormModal({
  open,
  onClose,
  defaultOrigin,
  originOptions,
  stage,
  formTag,
}: {
  open: boolean
  onClose: () => void
  defaultOrigin: LeadOrigin
  originOptions: LeadOrigin[]
  /** Etapa em que o lead nasce (default: Novo Lead). */
  stage?: LeadStage
  /** Tag de canal (ex.: Social Selling) aplicada no cadastro manual. */
  formTag?: string
}) {
  const createLead = useCreateLead()
  const [form, setForm] = useState({
    name: '',
    whatsapp: '',
    email: '',
    instagram: '',
    profession: '',
    income_range: '',
    origin: defaultOrigin,
    notes: '',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await createLead.mutateAsync({
      name: form.name,
      whatsapp: form.whatsapp,
      email: form.email || null,
      instagram: form.instagram || null,
      profession: form.profession || null,
      income_range: form.income_range || null,
      origin: form.origin,
      is_mql: form.income_range === '8a10' || form.income_range === 'acima10',
      notes: form.notes || null,
      stage,
      form_tag: formTag,
    } as never)
    setForm({
      name: '',
      whatsapp: '',
      email: '',
      instagram: '',
      profession: '',
      income_range: '',
      origin: defaultOrigin,
      notes: '',
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Cadastrar lead">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Nome *">
          <Input required value={form.name} onChange={(e) => update('name', e.target.value)} />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="WhatsApp *">
            <Input
              required
              placeholder="11999998888"
              value={form.whatsapp}
              onChange={(e) => update('whatsapp', e.target.value)}
            />
          </FormRow>
          <FormRow label="Email">
            <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Instagram">
            <Input
              placeholder="@usuario"
              value={form.instagram}
              onChange={(e) => update('instagram', e.target.value)}
            />
          </FormRow>
          <FormRow label="Profissão">
            <Input value={form.profession} onChange={(e) => update('profession', e.target.value)} />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Faixa de renda">
            <Select value={form.income_range} onChange={(e) => update('income_range', e.target.value)}>
              <option value="">Não informado</option>
              {INCOME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Origem">
            <Select value={form.origin} onChange={(e) => update('origin', e.target.value as LeadOrigin)}>
              {originOptions.map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABELS[o]}
                </option>
              ))}
            </Select>
          </FormRow>
        </div>

        <FormRow label="Notas">
          <Textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </FormRow>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createLead.isPending}>
            {createLead.isPending ? 'Salvando...' : 'Cadastrar lead'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
