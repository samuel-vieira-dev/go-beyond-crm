import { useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { usePresalesDailyReport } from '@/hooks/useDailyReport'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { STAGE_LABELS, type BoardColumn } from '@/types/domain'

export function PresalesReport({ title, columns }: { title: string; columns: BoardColumn[] }) {
  const { profile } = useAuth()
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(new Date()).toISOString(),
    to: new Date().toISOString(),
  })
  const { data, isLoading, isFetching, refetch } = usePresalesDailyReport(profile?.id ?? null, range)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
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
          <div>
            <h2 className="mb-2 text-sm font-semibold text-white/60">Sua atividade no período</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Novos leads cadastrados" value={data.newLeads} accent />
              <StatCard label="Reuniões agendadas" value={data.meetingsBooked} accent />
              <StatCard label="Leads cadastrados" value={data.leads.length} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-white/60">Seu pipeline agora</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {columns.map((col) => (
                <StatCard
                  key={col.id}
                  label={col.title}
                  value={col.stages.reduce((sum, s) => sum + (data.pipeline[s] ?? 0), 0)}
                />
              ))}
            </div>
          </div>

          <div className="card-surface rounded-xl p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Leads que você cadastrou no período</h2>
            {data.leads.length === 0 ? (
              <p className="text-xs text-white/30">Nenhum lead cadastrado no período.</p>
            ) : (
              <div className="space-y-2">
                {data.leads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
                    <span className="text-white">{lead.name}</span>
                    <div className="flex items-center gap-3">
                      <Badge tone="gold">{STAGE_LABELS[lead.stage]}</Badge>
                      <span className="text-xs text-white/40">{format(new Date(lead.created_at), 'dd/MM HH:mm')}</span>
                    </div>
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
