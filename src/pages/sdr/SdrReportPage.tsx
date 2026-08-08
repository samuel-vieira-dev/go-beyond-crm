import { PresalesReport } from '@/pages/presales/PresalesReport'
import { ManualMetricsPanel } from '@/components/metrics/ManualMetricsPanel'

export function SdrReportPage() {
  return (
    <PresalesReport
      title="Relatório — SDR"
      // Leads recebidos e qualificados vêm do kanban (read-only); atendimento,
      // follow-up e agendamentos que aconteceram no WhatsApp/DM entram à mão.
      manualPanel={(range) => <ManualMetricsPanel range={range} />}
    />
  )
}
