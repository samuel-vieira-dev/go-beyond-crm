import { useEffect, useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useDeleteGoal, useGoals, useUpsertGoal, type UpsertGoalInput } from '@/hooks/useGoals'
import { GoalProgressCard, METRIC_LABELS } from '@/components/metrics/GoalProgressCard'
import { useRealizedRealtime } from '@/hooks/useRealized'
import type { Goal, GoalMetric } from '@/types/database'
import type { Role } from '@/types/domain'

export function AdminGoalsPage() {
  useRealizedRealtime()
  const { data: goals, isLoading } = useGoals()
  const { data: profiles } = useAllProfiles()
  const deleteGoal = useDeleteGoal()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const profileById = (id: string) => profiles?.find((p) => p.id === id)
  const profileName = (id: string) => profileById(id)?.full_name ?? '—'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Metas</h1>
          <p className="text-sm text-white/40">Alcançável, alta e super meta por pessoa e período</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>+ Nova meta</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando metas...</p>
      ) : (
        <div className="space-y-2">
          {goals?.map((g) => (
            <div key={g.id} className="card-surface space-y-3 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{profileName(g.profile_id)}</p>
                  <p className="text-xs text-white/40">
                    {format(parseISO(g.period_start), 'dd/MM/yyyy')} — {format(parseISO(g.period_end), 'dd/MM/yyyy')}
                  </p>
                </div>
                <Badge tone="blue">{METRIC_LABELS[g.metric]}</Badge>
                <div className="flex gap-3 text-xs text-white/60">
                  <span>Alcançável: {g.target_reachable}</span>
                  <span>Alta: {g.target_high}</span>
                  <span>Super: {g.target_super}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => deleteGoal.mutate(g.id)}>
                    Remover
                  </Button>
                </div>
              </div>

              {/* Mesma conta que o colaborador vê em "Minhas Metas": cadastrar a meta e
                  acompanhar o progresso dela deixa de exigir duas telas que discordam. */}
              <GoalProgressCard goal={g} role={(profileById(g.profile_id)?.role as Role) ?? null} compact />
            </div>
          ))}
          {goals?.length === 0 && <p className="text-sm text-white/30">Nenhuma meta cadastrada.</p>}
        </div>
      )}

      <GoalFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <GoalFormModal open={!!editing} onClose={() => setEditing(null)} goal={editing} />
    </div>
  )
}

function GoalFormModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal | null }) {
  const { data: profiles } = useAllProfiles()
  const upsertGoal = useUpsertGoal()

  const [form, setForm] = useState<UpsertGoalInput>({
    profile_id: '',
    metric: 'agendamentos',
    target_reachable: 0,
    target_high: 0,
    target_super: 0,
    period_start: format(new Date(), 'yyyy-MM-dd'),
    period_end: format(new Date(), 'yyyy-MM-dd'),
  })

  useEffect(() => {
    if (open) {
      setForm(
        goal
          ? {
              id: goal.id,
              profile_id: goal.profile_id,
              metric: goal.metric,
              target_reachable: goal.target_reachable,
              target_high: goal.target_high,
              target_super: goal.target_super,
              period_start: goal.period_start,
              period_end: goal.period_end,
            }
          : {
              profile_id: profiles?.[0]?.id ?? '',
              metric: 'agendamentos',
              target_reachable: 0,
              target_high: 0,
              target_super: 0,
              period_start: format(new Date(), 'yyyy-MM-dd'),
              period_end: format(new Date(), 'yyyy-MM-dd'),
            },
      )
    }
  }, [open, goal, profiles])

  function update<K extends keyof UpsertGoalInput>(key: K, value: UpsertGoalInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await upsertGoal.mutateAsync(form)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Editar meta' : 'Nova meta'} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Pessoa *">
          <Select required value={form.profile_id} onChange={(e) => update('profile_id', e.target.value)}>
            <option value="">Selecione</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label="Métrica *">
          <Select value={form.metric} onChange={(e) => update('metric', e.target.value as GoalMetric)}>
            {Object.entries(METRIC_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormRow>

        <div className="grid grid-cols-3 gap-2">
          <FormRow label="Alcançável">
            <Input
              type="number"
              min="0"
              value={form.target_reachable}
              onChange={(e) => update('target_reachable', Number(e.target.value))}
            />
          </FormRow>
          <FormRow label="Alta">
            <Input
              type="number"
              min="0"
              value={form.target_high}
              onChange={(e) => update('target_high', Number(e.target.value))}
            />
          </FormRow>
          <FormRow label="Super">
            <Input
              type="number"
              min="0"
              value={form.target_super}
              onChange={(e) => update('target_super', Number(e.target.value))}
            />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Início do período *">
            <Input
              type="date"
              required
              value={form.period_start}
              onChange={(e) => update('period_start', e.target.value)}
            />
          </FormRow>
          <FormRow label="Fim do período *">
            <Input
              type="date"
              required
              value={form.period_end}
              onChange={(e) => update('period_end', e.target.value)}
            />
          </FormRow>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={upsertGoal.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
