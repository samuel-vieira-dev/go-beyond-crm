import { PresalesReport } from '@/pages/presales/PresalesReport'
import { ManualMetricsPanel } from '@/components/metrics/ManualMetricsPanel'

export function SocialSellerReportPage() {
  return (
    <PresalesReport
      title="Relatório — Social Seller"
      manualPanel={(range) => <ManualMetricsPanel range={range} />}
    />
  )
}
