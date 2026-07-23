import { PresalesReport } from '@/pages/presales/PresalesReport'
import { SDR_COLUMNS } from '@/types/domain'

export function SdrReportPage() {
  return <PresalesReport title="Relatório — SDR" columns={SDR_COLUMNS} />
}
