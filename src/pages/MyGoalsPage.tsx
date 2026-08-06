import { useState } from 'react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { useGoals } from '@/hooks/useGoals'
import { usePresalesPerformanceSplit } from '@/hooks/usePresalesPerformance'
import { useCloserPerformance } from '@/hooks/useTeamPerformance'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { GoalProgress } from '@/components/ui/GoalProgress'
import type { GoalMetric } from '@/types/database'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const METRIC_LABELS: Record<GoalMetric, string> = {
  agendamentos: 'Agendamentos',
  reunioes_realizadas: 'Reuniões Realizadas',
  vendas: 'Vendas',
  faturamento: 'Faturamento',
}

/** Metas do próprio atendente (SDR, Social Seller e Closer) com o realizado. */
export function MyGoalsPage() {
  const { profile } = useAuth()
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })

  const { data: goals, isLoading } = useGoals({ profileId: profile?.id })
  const { data: presales } = usePresalesPerformanceSplit(range)
  const { data: closers } = useCloserPerformance(range)

  // Quanto essa pessoa já realizou de cada métrica no período.
  function realizado(metric: GoalMetric): number {
    if (!profile) return 0
    const pre =
      presales?.sdr.find((r) => r.profileId === profile.id) ??
      presales?.social.find((r) => r.profileId === profile.id)
    const clo = closers?.byCloser.find((c) => c.profileId === profile.id)

    switch (metric) {
      case 'agendamentos':
        return pre?.agendamentos ?? 0
      case 'reunioes_realizadas':
        return pre?.realizadas ?? 0
      case 'vendas':
        return clo?.sales ?? pre?.vendas ?? 0
      case 'faturamento':
        return clo?.revenue ?? pre?.receita ?? 0
    }
  }

  // Só as metas que valem para o período selecionado.
  const ativas = (goals ?? []).filter(
    (g) => g.period_end >= range.from.slice(0, 10) && g.period_start <= range.to.slice(0, 10),
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Minhas Metas</h1>
          <p className="text-sm text-white/40">Metas definidas pela gestão e o seu realizado</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} defaultPreset="month" />
          <RefreshButton />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando metas...</p>
      ) : ativas.length === 0 ? (
        <div className="card-surface rounded-xl p-8 text-center text-sm text-white/40">
          Nenhuma meta definida para este período. Fale com a Gestão.
        </div>
      ) : (
        <div className="space-y-3">
          {ativas.map((g) => {
            const atual = realizado(g.metric)
            const isMoney = g.metric === 'faturamento'
            const fmt = (n: number) => (isMoney ? currency.format(n) : String(n))
            const restante = Math.max(0, g.target_reachable - atual)
            return (
              <div key={g.id} className="card-surface rounded-xl p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{METRIC_LABELS[g.metric]}</p>
                    <p className="text-xs text-white/40">
                      {format(new Date(g.period_start + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })} —{' '}
                      {format(new Date(g.period_end + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gold-400">{fmt(atual)}</p>
                    <p className="text-xs text-white/40">
                      {restante > 0
                        ? `faltam ${fmt(restante)} para a meta alcançável`
                        : '🎉 meta alcançável batida'}
                    </p>
                  </div>
                </div>

                <GoalProgress
                  current={atual}
                  reachable={g.target_reachable}
                  high={g.target_high}
                  superGoal={g.target_super}
                  format={fmt}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
