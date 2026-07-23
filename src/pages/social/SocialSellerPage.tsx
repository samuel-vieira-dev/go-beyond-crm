import { PresalesBoard } from '@/pages/presales/PresalesBoard'
import { SOCIAL_SELLER_COLUMNS } from '@/types/domain'

export function SocialSellerPage() {
  return (
    <PresalesBoard
      title="Leads — Social Seller"
      subtitle="Prospecção via Instagram até o agendamento com o Closer"
      columns={SOCIAL_SELLER_COLUMNS}
      defaultOrigin="instagram"
      originOptions={['instagram', 'indicacao', 'manual', 'outro']}
    />
  )
}
