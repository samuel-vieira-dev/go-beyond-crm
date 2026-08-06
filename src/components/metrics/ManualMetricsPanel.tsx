import { useEffect, useRef, useState } from 'react'
import { differenceInCalendarDays, format, isToday, isValid, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import {
  FIELDS_BY_ROLE,
  MANUAL_FIELD_HINTS,
  MANUAL_FIELD_LABELS,
  MONEY_FIELDS,
  useMyManualMetrics,
  useSaveManualField,
  type ManualField,
} from '@/hooks/useManualMetrics'
import { cn } from '@/lib/cn'
import { rangeLabel } from '@/components/ui/DateRangePicker'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import type { ManualMetrics } from '@/types/database'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Teto de linhas — períodos longos mostram só os dias mais recentes. */
const MAX_ROWS = 31

/** Dias do período, do mais recente para o mais antigo. Nunca lista dia futuro. */
function daysInRange(range: DateRange): string[] {
  const from = parseISO(range.from)
  const rawTo = parseISO(range.to)
  if (!isValid(from) || !isValid(rawTo)) return []
  // "Este mês" vai até o fim do mês; sem isto a tabela abriria em 31/08 zerado.
  const hoje = new Date()
  const to = rawTo > hoje ? hoje : rawTo
  const total = differenceInCalendarDays(to, from)
  if (total < 0) return []
  const days: string[] = []
  for (let i = total; i >= 0; i--) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    days.push(format(d, 'yyyy-MM-dd'))
  }
  return days
}

const ROLE_HINT: Record<string, string> = {
  social_seller: 'Ativações e conversas acontecem no Business Suite e não viram card.',
  sdr: 'Números que não passaram pelo kanban — qualificação por DM, agendamento fechado no WhatsApp.',
  closer:
    'Reuniões e vendas sem card no kanban. O que você lançar por "+ Lead fora do kanban" já vira card e não entra aqui.',
  admin: 'Lançamento manual de qualquer etapa, para qualquer papel.',
}

/**
 * Relatório do dia, editável direto na grade.
 *
 * Cada número é um campo: clica, digita, sai — salva sozinho. Não existe botão de
 * salvar nem linha "selecionada", porque a operação real é corrigir três números
 * de dias diferentes em dez segundos, e um formulário por dia transformava isso em
 * dez cliques.
 *
 * Tudo aqui SOMA ao que veio do kanban. A pessoa lança só o que não virou card.
 */
export function ManualMetricsPanel({ range }: { range: DateRange }) {
  const { profile } = useAuth()
  const { data, isLoading } = useMyManualMetrics(range)

  const fields = FIELDS_BY_ROLE[profile?.role ?? 'sdr'] ?? FIELDS_BY_ROLE.sdr
  const allDays = daysInRange(range)
  const days = allDays.slice(0, MAX_ROWS)

  const rowByDay = new Map((data?.rows ?? []).map((r) => [r.date, r]))

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Seu relatório do dia</h2>
        <span className="text-[11px] text-white/30">
          clique em qualquer número para editar · salva sozinho
        </span>
      </div>
      <p className="mb-3 text-xs text-white/40">
        {ROLE_HINT[profile?.role ?? 'sdr']} Estes números somam ao que você já registrou no kanban.
      </p>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] text-white/40">
                <th className="whitespace-nowrap py-2 pr-3 font-medium">Dia</th>
                {fields.map((f) => (
                  <th key={f} className="py-2 pr-1 text-right font-medium" title={MANUAL_FIELD_HINTS[f]}>
                    {MANUAL_FIELD_LABELS[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <DayRow
                  key={day}
                  day={day}
                  fields={fields}
                  row={rowByDay.get(day)}
                  profileId={profile?.id ?? ''}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="text-[11px] text-white/50">
                <td className="whitespace-nowrap border-t border-white/10 py-2 pr-3 font-medium">
                  Total · {rangeLabel(range)}
                </td>
                {fields.map((f) => (
                  <td key={f} className="border-t border-white/10 py-2 pr-3 text-right font-semibold text-white">
                    {data ? formatValue(f, data.totals[f]) : '—'}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {allDays.length > days.length && (
        <p className="mt-2 text-[11px] text-white/30">
          mostrando os {days.length} dias mais recentes de {allDays.length}
        </p>
      )}
    </div>
  )
}

function formatValue(field: ManualField, value: number) {
  if (MONEY_FIELDS.includes(field)) return value > 0 ? money.format(value) : '—'
  return value > 0 ? String(value) : '—'
}

function DayRow({
  day,
  fields,
  row,
  profileId,
}: {
  day: string
  fields: ManualField[]
  row?: ManualMetrics
  profileId: string
}) {
  const date = parseISO(day)
  const hoje = isToday(date)
  // Fim de semana quase nunca tem lançamento: apagar um pouco evita que a linha
  // vazia pareça um dia esquecido.
  const weekend = [0, 6].includes(date.getDay())

  return (
    <tr className={cn('group transition-colors hover:bg-white/[0.03]', hoje && 'bg-gold-500/[0.07]')}>
      <td className="whitespace-nowrap border-t border-white/5 py-1 pr-3">
        <span className={cn('capitalize', hoje ? 'text-white' : weekend ? 'text-white/35' : 'text-white/70')}>
          {format(date, "EEE, d 'de' MMM", { locale: ptBR })}
        </span>
        {hoje && <span className="ml-1 text-[11px] text-gold-400">hoje</span>}
      </td>
      {fields.map((f) => (
        <td key={f} className="border-t border-white/5 py-1 pr-1 text-right">
          <MetricCell day={day} field={f} value={row?.[f] ?? 0} profileId={profileId} />
        </td>
      ))}
    </tr>
  )
}

/**
 * Uma célula editável. Fora de foco é texto; em foco é input.
 *
 * Salva no blur e no Enter, reverte no Esc. O valor da tela é o local enquanto se
 * digita e o do servidor depois — sem isso, um refetch no meio da digitação
 * apagaria o que a pessoa estava escrevendo.
 */
function MetricCell({
  day,
  field,
  value,
  profileId,
}: {
  day: string
  field: ManualField
  value: number
  profileId: string
}) {
  const save = useSaveManualField()
  const isMoney = MONEY_FIELDS.includes(field)
  const [draft, setDraft] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Some o "✓" sozinho; sem cleanup o timer dispara em célula já desmontada.
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 1400)
    return () => clearTimeout(t)
  }, [justSaved])

  const editing = draft !== null

  async function commit() {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const next = Number(raw.replace(',', '.') || 0)
    if (!Number.isFinite(next) || next < 0 || next === value) return
    await save.mutateAsync({ date: day, field, value: next, profileId })
    setJustSaved(true)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="number"
        min="0"
        step={isMoney ? '0.01' : '1'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
          }
          if (e.key === 'Escape') {
            setDraft(null)
          }
        }}
        className={cn(
          'w-full rounded-md border border-gold-500/60 bg-navy-950 px-2 py-1 text-right text-sm text-white',
          'outline-none ring-1 ring-gold-500/40 [appearance:textfield]',
          '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          isMoney ? 'min-w-[7rem]' : 'min-w-[4rem]',
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(value ? String(value) : '')}
      title="Clique para editar"
      className={cn(
        'w-full rounded-md px-2 py-1 text-right text-sm transition-colors',
        'border border-transparent hover:border-white/15 hover:bg-white/5',
        'focus:border-gold-500/60 focus:outline-none',
        value > 0 ? 'text-white' : 'text-white/20',
        save.isPending && 'opacity-50',
        isMoney ? 'min-w-[7rem]' : 'min-w-[4rem]',
      )}
    >
      {justSaved && <span className="mr-1 text-success">✓</span>}
      {formatValue(field, value)}
    </button>
  )
}
