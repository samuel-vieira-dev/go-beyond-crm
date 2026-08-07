import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { GoalProgress } from '@/components/ui/GoalProgress'
import { goalPeriodRange, useRealized } from '@/hooks/useRealized'
import { rangeLabel } from '@/components/ui/DateRangePicker'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import type { Goal, GoalMetric } from '@/types/database'
import type { Role } from '@/types/domain'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const METRIC_LABELS: Record<GoalMetric, string> = {
  agendamentos: 'Agendamentos',
  reunioes_realizadas: 'Reuniões Realizadas',
  vendas: 'Vendas',
  faturamento: 'Faturamento',
}

export function formatMetric(metric: GoalMetric, value: number) {
  return metric === 'faturamento' ? currency.format(value) : String(value)
}

export function goalPeriodLabel(goal: Pick<Goal, 'period_start' | 'period_end'>) {
  const fmt = (d: string) => format(parseISO(d), "d 'de' MMM", { locale: ptBR })
  return `${fmt(goal.period_start)} — ${fmt(goal.period_end)}`
}

/**
 * Uma meta com o realizado dela.
 *
 * Por padrão o realizado é medido no período da própria meta. Mas quando a tela que
 * mostra a meta já tem um período escolhido (o filtro do Relatório ou do Ranking),
 * passe `range` para SUBSTITUIR o período da meta por ele.
 *
 * Isso existe porque medir sempre pelo período da meta criava outra divergência: a
 * SDR olhava "Este mês" no relatório e via 62 agendamentos, e a barra da meta (cujo
 * período cadastrado é mais curto que o mês) mostrava 40 — número correto para o
 * período dela, mas incompreensível ao lado do relatório. Combinado com o time: por
 * ora a meta mostra exatamente o que o relatório mostra para o período escolhido ali,
 * não o período que está gravado na meta.
 */
export function GoalProgressCard({
  goal,
  role,
  personName,
  compact,
  range,
}: {
  goal: Goal
  /** Papel de QUEM tem a meta: muda a regra do realizado (pré-venda credita quem agendou, closer quem atendeu). */
  role: Role | null
  /** Só nas telas da Gestão, onde as metas de várias pessoas aparecem juntas. */
  personName?: string
  /** Versão enxuta para listas de ranking: sem cabeçalho de pessoa e sem "faltam X". */
  compact?: boolean
  /** Período da tela (Relatório/Ranking) que substitui o período da própria meta. */
  range?: DateRange
}) {
  const effectiveRange = useMemo(
    () => range ?? goalPeriodRange(goal.period_start, goal.period_end),
    [range, goal.period_start, goal.period_end],
  )
  const { data, isLoading } = useRealized(goal.profile_id, role, effectiveRange)

  const atual = data?.[goal.metric] ?? 0
  const fmt = (n: number) => formatMetric(goal.metric, n)
  const restante = Math.max(0, goal.target_reachable - atual)
  // Com range, o rótulo é o período que a tela está mostrando (bate com o relatório
  // ao lado); sem range, mostra o período cadastrado na própria meta.
  const periodLabel = range ? rangeLabel(range) : goalPeriodLabel(goal)

  if (compact) {
    return (
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-white/40">
            Meta de {METRIC_LABELS[goal.metric].toLowerCase()} · {periodLabel}
          </span>
          <span className="font-semibold text-gold-400">{isLoading ? '—' : fmt(atual)}</span>
        </div>
        <GoalProgress
          current={atual}
          reachable={goal.target_reachable}
          high={goal.target_high}
          superGoal={goal.target_super}
          format={fmt}
        />
      </div>
    )
  }

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          {personName && <p className="text-xs text-white/40">{personName}</p>}
          <p className="font-semibold text-white">{METRIC_LABELS[goal.metric]}</p>
          <p className="text-xs text-white/40 capitalize">{periodLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gold-400">{isLoading ? '—' : fmt(atual)}</p>
          <p className="text-xs text-white/40">
            {isLoading
              ? 'calculando realizado...'
              : restante > 0
                ? `faltam ${fmt(restante)} para a meta alcançável`
                : '🎉 meta alcançável batida'}
          </p>
        </div>
      </div>

      <GoalProgress
        current={atual}
        reachable={goal.target_reachable}
        high={goal.target_high}
        superGoal={goal.target_super}
        format={fmt}
      />

      <p className="mt-2 text-[11px] text-white/25">
        Realizado somando kanban + o que você lançou no relatório diário, em {periodLabel}.
      </p>
    </div>
  )
}
