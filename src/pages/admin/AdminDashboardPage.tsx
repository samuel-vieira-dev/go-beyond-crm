import { useState } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { StatCard } from '@/components/ui/StatCard'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { useFunnelMetrics, type DateRange } from '@/hooks/useFunnelMetrics'
import { useChannelSales } from '@/hooks/useChannelSales'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdminDashboardPage() {
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = useFunnelMetrics(range)
  const { data: channels } = useChannelSales(range)

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
          <DateRangePicker value={range} onChange={setRange} defaultPreset="month" />
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

          <ChannelSection rows={channels ?? []} />

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

/** Vendas por canal — mostra de onde vem o faturamento. */
function ChannelSection({ rows }: { rows: { channel: string; leads: number; vendas: number; receita: number }[] }) {
  const total = rows.reduce((s, r) => s + r.receita, 0)
  if (rows.every((r) => r.leads === 0 && r.vendas === 0)) return null

  return (
    <div className="card-surface rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-white/70">Vendas por canal</h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.channel}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-white">{r.channel}</span>
              <span className="text-white/40">
                {r.leads} leads · <span className="text-white">{r.vendas}</span> vendas ·{' '}
                <span className="font-semibold text-gold-400">{currency.format(r.receita)}</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gold-500"
                style={{ width: `${total > 0 ? (r.receita / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/40">
        Total no período: <span className="font-semibold text-white">{currency.format(total)}</span>
      </p>
    </div>
  )
}
