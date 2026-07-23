import { useState } from 'react'
import { startOfDay, subDays } from 'date-fns'
import { StatCard } from '@/components/ui/StatCard'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { useFunnelMetrics, type DateRange } from '@/hooks/useFunnelMetrics'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdminDashboardPage() {
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 29)).toISOString(),
    to: new Date().toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = useFunnelMetrics(range)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard de Funil</h1>
          <p className="flex items-center gap-2 text-sm text-white/40">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Atualização em tempo real
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={() => refetch()} loading={isFetching} />
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-white/40">Carregando métricas...</p>
      ) : (
        <>
          <div className="card-surface rounded-2xl p-6">
            <h2 className="mb-6 text-sm font-semibold text-white/70">Funil de vendas</h2>
            <FunnelChart
              steps={[
                { label: 'Leads', value: data.leads },
                { label: 'Qualificados', value: data.qualified },
                { label: 'Agendamentos', value: data.scheduled },
                { label: 'Reuniões realizadas', value: data.meetingsHeld },
                { label: 'Vendas', value: data.sales },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Faturamento" value={currency.format(data.revenue)} accent />
            <StatCard
              label="Ticket Médio"
              value={currency.format(data.sales > 0 ? data.revenue / data.sales : 0)}
            />
            <StatCard label="No-shows" value={data.meetingsNoShow} />
            <StatCard
              label="Conversão Geral"
              value={`${data.leads > 0 ? ((data.sales / data.leads) * 100).toFixed(1) : '0'}%`}
              hint="Leads → Vendas"
            />
          </div>
        </>
      )}
    </div>
  )
}
