import { useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { useCloserDailyReport } from '@/hooks/useDailyReport'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { DateRangePicker } from '@/components/ui/DateRangePicker'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS: Record<string, { label: string; tone: 'gold' | 'green' | 'red' | 'neutral' }> = {
  agendada: { label: 'Agendada', tone: 'gold' },
  realizada: { label: 'Realizada', tone: 'green' },
  nao_compareceu: { label: 'Não compareceu', tone: 'red' },
  remarcada: { label: 'Remarcada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
}

export function CloserReportPage() {
  const { profile } = useAuth()
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(new Date()).toISOString(),
    to: new Date().toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = useCloserDailyReport(profile?.id ?? null, range)

  const ticketMedio = data && data.sales > 0 ? data.revenue / data.sales : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Relatório — Closer</h1>
          <p className="text-sm text-white/40 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={() => refetch()} loading={isFetching} />
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-white/40">Carregando relatório...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard label="Reuniões" value={data.meetingsScheduled} />
            <StatCard label="Realizadas" value={data.meetingsHeld} accent />
            <StatCard label="No-show" value={data.noShow} />
            <StatCard label="Vendas" value={data.sales} accent />
            <StatCard label="Faturamento" value={currency.format(data.revenue)} accent />
            <StatCard
              label="Taxa de conversão"
              value={`${data.conversionRate.toFixed(0)}%`}
              hint="Realizadas → vendas"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:w-1/3">
            <StatCard label="Ticket Médio" value={currency.format(ticketMedio)} />
            <StatCard
              label="Comparecimento"
              value={`${
                data.meetingsHeld + data.noShow > 0
                  ? ((data.meetingsHeld / (data.meetingsHeld + data.noShow)) * 100).toFixed(0)
                  : '0'
              }%`}
            />
          </div>

          <div className="card-surface rounded-xl p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Reuniões no período</h2>
            {data.meetings.length === 0 ? (
              <p className="text-xs text-white/30">Nenhuma reunião no período.</p>
            ) : (
              <div className="space-y-2">
                {data.meetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gold-400">
                        {format(new Date(m.scheduled_at), 'dd/MM HH:mm')}
                      </span>
                      <span className="text-white">{m.lead_name}</span>
                    </div>
                    <Badge tone={STATUS[m.status]?.tone ?? 'neutral'}>{STATUS[m.status]?.label ?? m.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
