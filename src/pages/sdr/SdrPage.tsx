import { PresalesBoard } from '@/pages/presales/PresalesBoard'
import { SDR_COLUMNS } from '@/types/domain'

export function SdrPage() {
  return (
    <PresalesBoard
      title="Leads — SDR"
      subtitle="Atendimento via WhatsApp (Clint) até o agendamento com o Closer"
      columns={SDR_COLUMNS}
      defaultOrigin="manual"
      originOptions={['manual', 'quiz', 'indicacao', 'outro']}
    />
  )
}
