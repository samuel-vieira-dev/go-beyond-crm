import { useState } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { GoalProgress } from '@/components/ui/GoalProgress'
import { Badge } from '@/components/ui/Badge'
import { usePresalesPerformance } from '@/hooks/useTeamPerformance'
import { useGoals } from '@/hooks/useGoals'
import type { DateRange } from '@/hooks/useFunnelMetrics'

export function AdminPresalesRankingPage() {
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })
  const { data: performance, isLoading, isFetching, refetch } = usePresalesPerformance(range)
  const { data: goals } = useGoals({ activeOn: range.from.slice(0, 10) })

  const ranked = [...(performance ?? [])].sort((a, b) => b.meetingsBooked - a.meetingsBooked)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Performance Pré-vendas</h1>
          <p className="text-sm text-white/40">SDRs e Social Sellers — agendamentos e comparecimento</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={() => refetch()} loading={isFetching} />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando ranking...</p>
      ) : (
        <div className="space-y-3">
          {ranked.map((p, idx) => {
            const goal = goals?.find((g) => g.profile_id === p.profileId && g.metric === 'agendamentos')
            return (
              <div key={p.profileId} className="card-surface rounded-xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-400">
                      {idx + 1}
                    </span>
                    <p className="font-semibold text-white">{p.fullName}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone="gold">{p.meetingsBooked} agendadas</Badge>
                    <Badge tone="green">{p.meetingsHeld} realizadas</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs text-white/50">
                  <div>
                    Taxa de comparecimento
                    <p className="text-lg font-semibold text-white">{p.attendanceRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    Taxa de no-show
                    <p className="text-lg font-semibold text-white">{p.noShowRate.toFixed(1)}%</p>
                  </div>
                </div>

                {goal ? (
                  <div className="mt-4">
                    <p className="mb-1 text-xs text-white/40">Meta de agendamento do mês</p>
                    <GoalProgress
                      current={p.meetingsBooked}
                      reachable={goal.target_reachable}
                      high={goal.target_high}
                      superGoal={goal.target_super}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-white/25">Sem meta definida para o período.</p>
                )}
              </div>
            )
          })}
          {ranked.length === 0 && <p className="text-sm text-white/30">Nenhum SDR/Social Seller ativo.</p>}
        </div>
      )}
    </div>
  )
}
