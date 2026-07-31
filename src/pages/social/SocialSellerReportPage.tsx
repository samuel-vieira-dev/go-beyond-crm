import { PresalesReport } from '@/pages/presales/PresalesReport'
import { SocialMetricsPanel } from './SocialMetricsPanel'
import { SOCIAL_SELLER_COLUMNS } from '@/types/domain'

export function SocialSellerReportPage() {
  return (
    <PresalesReport
      title="Relatório — Social Seller"
      columns={SOCIAL_SELLER_COLUMNS}
      socialPanel={(range) => <SocialMetricsPanel range={range} />}
    />
  )
}
