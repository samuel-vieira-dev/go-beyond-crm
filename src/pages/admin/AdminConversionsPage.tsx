import { useState } from 'react'
import { startOfDay, subDays } from 'date-fns'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { ConversionStep } from '@/components/charts/ConversionStep'
import { useFunnelMetrics, type DateRange } from '@/hooks/useFunnelMetrics'

export function AdminConversionsPage() {
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 29)).toISOString(),
    to: new Date().toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = useFunnelMetrics(range)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Conversões do Funil</h1>
          <p className="text-sm text-white/40">Quanto passa de uma etapa para a próxima</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={() => refetch()} loading={isFetching} />
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-white/40">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ConversionStep
            fromLabel="Leads recebidos"
            toLabel="Leads qualificados"
            fromValue={data.leads}
            toValue={data.qualified}
          />
          <ConversionStep
            fromLabel="Qualificados"
            toLabel="Agendamentos"
            fromValue={data.qualified}
            toValue={data.scheduled}
          />
          <ConversionStep
            fromLabel="Reuniões marcadas"
            toLabel="Reuniões realizadas"
            fromValue={data.meetingsHeld + data.meetingsNoShow}
            toValue={data.meetingsHeld}
          />
          <ConversionStep
            fromLabel="Reuniões realizadas"
            toLabel="Vendas fechadas"
            fromValue={data.meetingsHeld}
            toValue={data.sales}
          />
        </div>
      )}
    </div>
  )
}
