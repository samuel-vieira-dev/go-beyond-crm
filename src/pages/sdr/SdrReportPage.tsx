import { PresalesReport } from '@/pages/presales/PresalesReport'
import { ManualMetricsPanel } from '@/components/metrics/ManualMetricsPanel'
import { SDR_COLUMNS } from '@/types/domain'

export function SdrReportPage() {
  return (
    <PresalesReport
      title="Relatório — SDR"
      columns={SDR_COLUMNS}
      // O SDR também qualifica e agenda fora do kanban (DM, WhatsApp): sem o painel,
      // esses números não teriam onde entrar.
      manualPanel={(range) => <ManualMetricsPanel range={range} />}
    />
  )
}
