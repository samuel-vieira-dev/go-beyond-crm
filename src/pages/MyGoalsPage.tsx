import { useState } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { useGoals } from '@/hooks/useGoals'
import { localDay } from '@/hooks/useManualMetrics'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { GoalProgressCard } from '@/components/metrics/GoalProgressCard'
import { useRealizedRealtime } from '@/hooks/useRealized'

/**
 * Metas do próprio atendente (SDR, Social Seller e Closer) com o realizado.
 *
 * O seletor de data escolhe QUAIS metas aparecem, não sobre qual período elas são
 * medidas: cada meta é sempre medida no período dela (ver GoalProgressCard). Antes
 * era o contrário e a barra de uma meta semanal mostrava o realizado do mês.
 */
export function MyGoalsPage() {
  const { profile } = useAuth()
  useRealizedRealtime()
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })

  const { data: goals, isLoading } = useGoals({
    profileId: profile?.id,
    overlapping: { from: localDay(range.from), to: localDay(range.to) },
  })

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
      ) : (goals ?? []).length === 0 ? (
        <div className="card-surface rounded-xl p-8 text-center text-sm text-white/40">
          Nenhuma meta definida para este período. Fale com a Gestão.
        </div>
      ) : (
        <div className="space-y-3">
          {(goals ?? []).map((g) => (
            <GoalProgressCard key={g.id} goal={g} role={profile?.role ?? null} />
          ))}
        </div>
      )}
    </div>
  )
}
