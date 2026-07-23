import { useState, type FormEvent } from 'react'
import { format, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import {
  useCreateActivity,
  useDeleteActivity,
  useLeadActivities,
  useToggleActivity,
} from '@/hooks/useActivities'
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS, type ActivityType } from '@/types/domain'
import { cn } from '@/lib/cn'

export function ActivitiesSection({ leadId }: { leadId: string }) {
  const { data: activities } = useLeadActivities(leadId)
  const createActivity = useCreateActivity()
  const toggleActivity = useToggleActivity()
  const deleteActivity = useDeleteActivity()

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>('followup')
  const [dueAt, setDueAt] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await createActivity.mutateAsync({
      leadId,
      type,
      title,
      notes,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    })
    setType('followup')
    setDueAt('')
    setTitle('')
    setNotes('')
    setOpen(false)
  }

  const pending = (activities ?? []).filter((a) => !a.done)
  const done = (activities ?? []).filter((a) => a.done)

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-white/50 uppercase">Atividades</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancelar' : '+ Nova atividade'}
        </Button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-lg bg-white/[0.03] p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_ICONS[t]} {ACTIVITY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <Input
            placeholder="Título (ex.: Ligar para confirmar interesse)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea rows={2} placeholder="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={createActivity.isPending}>
              {createActivity.isPending ? 'Salvando...' : 'Adicionar'}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {pending.length === 0 && done.length === 0 && (
          <p className="text-xs text-white/30">Nenhuma atividade registrada.</p>
        )}
        {pending.map((a) => {
          const overdue = a.due_at && isPast(parseISO(a.due_at))
          return (
            <div key={a.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2.5 text-sm">
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleActivity.mutate({ id: a.id, done: true })}
                className="mt-0.5 h-4 w-4 accent-gold-500"
                title="Concluir"
              />
              <div className="min-w-0 flex-1">
                <p className="text-white">
                  {ACTIVITY_TYPE_ICONS[a.type]} {a.title || ACTIVITY_TYPE_LABELS[a.type]}
                </p>
                {a.notes && <p className="text-xs text-white/40">{a.notes}</p>}
                {a.due_at && (
                  <p className={cn('text-xs', overdue ? 'font-medium text-danger' : 'text-white/40')}>
                    {overdue ? '⚠ Vencida · ' : '📅 '}
                    {format(parseISO(a.due_at), "d MMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteActivity.mutate(a.id)}
                className="text-white/30 hover:text-danger"
                title="Excluir"
              >
                ✕
              </button>
            </div>
          )
        })}

        {done.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg p-2.5 text-sm opacity-50">
            <input
              type="checkbox"
              checked
              onChange={() => toggleActivity.mutate({ id: a.id, done: false })}
              className="h-4 w-4 accent-success"
            />
            <span className="text-white/60 line-through">
              {ACTIVITY_TYPE_ICONS[a.type]} {a.title || ACTIVITY_TYPE_LABELS[a.type]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
