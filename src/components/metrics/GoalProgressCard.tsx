import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { GoalProgress } from '@/components/ui/GoalProgress'
import { goalPeriodRange, useRealized } from '@/hooks/useRealized'
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
 * O realizado é SEMPRE medido no período da própria meta, nunca no filtro de data da
 * tela. Antes cada página somava o realizado no seu range (o padrão era "este mês") e
 * comparava com um alvo de outro período — meta de uma semana aparecia medida contra
 * o mês inteiro, e a mesma meta mostrava números diferentes para o colaborador e para
 * a Gestão. Como todas as telas passam por aqui, esse tipo de divergência não volta.
 */
export function GoalProgressCard({
  goal,
  role,
  personName,
  compact,
}: {
  goal: Goal
  /** Papel de QUEM tem a meta: muda a regra do realizado (pré-venda credita quem agendou, closer quem atendeu). */
  role: Role | null
  /** Só nas telas da Gestão, onde as metas de várias pessoas aparecem juntas. */
  personName?: string
  /** Versão enxuta para listas de ranking: sem cabeçalho de pessoa e sem "faltam X". */
  compact?: boolean
}) {
  const range = useMemo(
    () => goalPeriodRange(goal.period_start, goal.period_end),
    [goal.period_start, goal.period_end],
  )
  const { data, isLoading } = useRealized(goal.profile_id, role, range)

  const atual = data?.[goal.metric] ?? 0
  const fmt = (n: number) => formatMetric(goal.metric, n)
  const restante = Math.max(0, goal.target_reachable - atual)

  if (compact) {
    return (
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-white/40">
            Meta de {METRIC_LABELS[goal.metric].toLowerCase()} · {goalPeriodLabel(goal)}
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
          <p className="text-xs text-white/40">{goalPeriodLabel(goal)}</p>
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
        Realizado somando kanban + o que você lançou no relatório diário, no período da meta.
      </p>
    </div>
  )
}
