import { useState } from 'react'
import { differenceInCalendarDays, endOfMonth, startOfMonth } from 'date-fns'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { StatCard } from '@/components/ui/StatCard'
import { GoalProgressCard } from '@/components/metrics/GoalProgressCard'
import { useRealizedRealtime } from '@/hooks/useRealized'
import { DailyBarChart } from '@/components/charts/DailyBarChart'
import { useCloserPerformance } from '@/hooks/useTeamPerformance'
import { useGoals } from '@/hooks/useGoals'
import { localDay } from '@/hooks/useManualMetrics'
import type { DateRange } from '@/hooks/useFunnelMetrics'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdminCloserRankingPage() {
  useRealizedRealtime()
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = useCloserPerformance(range)
  // Todas as metas que encostam no período — não só as vigentes no primeiro dia dele.
  const { data: goals } = useGoals({ overlapping: { from: localDay(range.from), to: localDay(range.to) } })

  const totalDays = Math.max(1, differenceInCalendarDays(new Date(range.to), new Date(range.from)) + 1)
  const elapsedDays = Math.max(
    1,
    Math.min(differenceInCalendarDays(new Date(), new Date(range.from)) + 1, totalDays),
  )
  const projection = data ? (data.totalRevenue / elapsedDays) * totalDays : 0

  const ranked = [...(data?.byCloser ?? [])].sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Performance dos Closers</h1>
          <p className="text-sm text-white/40">Vendas, faturamento e projeção da equipe</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} defaultPreset="month" />
          <RefreshButton onClick={() => refetch()} loading={isFetching} />
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-white/40">Carregando ranking...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Vendas da Equipe" value={data.totalSales} />
            <StatCard label="Faturamento da Equipe" value={currency.format(data.totalRevenue)} accent />
            <StatCard label="Projeção do Período" value={currency.format(projection)} hint="Baseada no ritmo atual" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card-surface rounded-xl p-4">
              <h2 className="mb-2 text-sm font-semibold text-white">Vendas por dia</h2>
              <DailyBarChart data={data.daily.map((d) => ({ date: d.date, value: d.sales }))} />
            </div>
            <div className="card-surface rounded-xl p-4">
              <h2 className="mb-2 text-sm font-semibold text-white">Faturamento por dia</h2>
              <DailyBarChart
                data={data.daily.map((d) => ({ date: d.date, value: d.revenue }))}
                formatValue={(n) => currency.format(n)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {ranked.map((c, idx) => {
              // Todas as métricas, não só vendas e faturamento: meta de reunião realizada
              // era cadastrável e nunca aparecia aqui.
              const closerGoals = (goals ?? []).filter((g) => g.profile_id === c.profileId)
              return (
                <div key={c.profileId} className="card-surface rounded-xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-400">
                        {idx + 1}
                      </span>
                      <p className="font-semibold text-white">{c.fullName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white/50">{c.sales} vendas</p>
                      <p className="font-semibold text-gold-400">{currency.format(c.revenue)}</p>
                    </div>
                  </div>

                  {closerGoals.length > 0 ? (
                    <div className="space-y-3">
                      {closerGoals.map((g) => (
                        <GoalProgressCard key={g.id} goal={g} role="closer" compact range={range} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/25">Sem meta definida para o período.</p>
                  )}
                </div>
              )
            })}
            {ranked.length === 0 && <p className="text-sm text-white/30">Nenhum closer ativo.</p>}
          </div>
        </>
      )}
    </div>
  )
}
