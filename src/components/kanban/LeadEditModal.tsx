import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select, Textarea } from '@/components/ui/Field'
import { useUpdateLead } from '@/hooks/useLeads'
import { INCOME_RANGES, ORIGIN_LABELS, type LeadOrigin } from '@/types/domain'
import type { LeadWithRelations } from '@/types/database'

const ALL_ORIGINS = Object.keys(ORIGIN_LABELS) as LeadOrigin[]

export function LeadEditModal({
  lead,
  onClose,
}: {
  lead: LeadWithRelations | null
  onClose: () => void
}) {
  const updateLead = useUpdateLead()
  const [form, setForm] = useState({
    name: '',
    whatsapp: '',
    email: '',
    instagram: '',
    profession: '',
    income_range: '',
    origin: 'manual' as LeadOrigin,
    is_mql: false,
    notes: '',
  })

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name,
        whatsapp: lead.whatsapp ?? '',
        email: lead.email ?? '',
        instagram: lead.instagram ?? '',
        profession: lead.profession ?? '',
        income_range: lead.income_range ?? '',
        origin: lead.origin,
        is_mql: lead.is_mql,
        notes: lead.notes ?? '',
      })
    }
  }, [lead])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!lead) return
    await updateLead.mutateAsync({
      id: lead.id,
      name: form.name,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      instagram: form.instagram || null,
      profession: form.profession || null,
      income_range: form.income_range || null,
      origin: form.origin,
      is_mql: form.is_mql,
      notes: form.notes || null,
    })
    onClose()
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={`Editar lead — ${lead?.name ?? ''}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Nome *">
          <Input required value={form.name} onChange={(e) => update('name', e.target.value)} />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="WhatsApp">
            <Input value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} />
          </FormRow>
          <FormRow label="Email">
            <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Instagram">
            <Input value={form.instagram} onChange={(e) => update('instagram', e.target.value)} />
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
              {ALL_ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABELS[o]}
                </option>
              ))}
            </Select>
          </FormRow>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={form.is_mql}
            onChange={(e) => update('is_mql', e.target.checked)}
            className="h-4 w-4 accent-gold-500"
          />
          Marcar como Qualificado
        </label>

        <FormRow label="Notas">
          <Textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </FormRow>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={updateLead.isPending}>
            {updateLead.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
