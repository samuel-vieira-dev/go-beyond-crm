import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { assertSlotFree } from './useMeetings'
import type { LeadStage } from '@/types/domain'

/**
 * Lançamento retroativo (ou antecipado) de lead direto pelo closer.
 *
 * O caso real: a reunião aconteceu fora do kanban — indicação, contato direto,
 * lead que o closer trouxe — e agora precisa existir com nome, data e valor, não
 * como um número solto na grade do relatório diário.
 *
 * DATAS. Tudo é datado pelo dia do FATO, não pelo dia do lançamento: lead,
 * reunião e venda nascem com created_at/sold_at na data da reunião. É o que faz o
 * relatório de um dia passado passar a bater depois do lançamento. Para reunião
 * futura não há o que retroagir — o agendamento aconteceu agora mesmo.
 *
 * Os lead_events, ao contrário, ficam com a hora real do lançamento: eles são a
 * auditoria de quem registrou o quê e quando, e mentir neles apagaria justamente
 * o rastro de que o registro foi feito depois.
 */
export interface CloserQuickLeadInput {
  name: string
  whatsapp?: string | null
  notes?: string | null
  /** Data e hora da reunião, em ISO. Pode ser passada ou futura. */
  scheduledAt: string
  /**
   * A reunião aconteceu? `null` quando ela ainda está por vir — aí o lançamento
   * para no agendamento e o resultado é registrado depois, pelo fluxo normal.
   */
  attended: boolean | null
  /** Só quando `attended` é true. */
  sold?: boolean
  productId?: string
  amount?: number
  /** Destino quando compareceu e não vendeu. */
  outcome?: 'follow_up' | 'lost'
  lostReason?: string
}

/** Etapa e status da reunião que correspondem ao que o closer respondeu nos menus. */
function resolveResult(input: CloserQuickLeadInput): {
  stage: LeadStage
  meetingStatus: 'agendada' | 'realizada' | 'nao_compareceu'
} {
  if (input.attended === null) return { stage: 'reuniao_agendada', meetingStatus: 'agendada' }
  if (!input.attended) return { stage: 'reuniao_nao_realizada', meetingStatus: 'nao_compareceu' }
  if (input.sold) return { stage: 'venda_fechada', meetingStatus: 'realizada' }
  return {
    stage: input.outcome === 'lost' ? 'perdido' : 'follow_up_fechamento',
    meetingStatus: 'realizada',
  }
}

export function useCreateCloserQuickLead() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: CloserQuickLeadInput) => {
      if (!profile) throw new Error('Sem sessão')

      const { stage, meetingStatus } = resolveResult(input)
      const now = new Date().toISOString()
      // Reunião futura não retroage nada: o agendamento é de agora.
      const factAt = input.scheduledAt < now ? input.scheduledAt : now

      // O closer é dono e responsável: o lead nunca cai no pool da pré-venda.
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          name: input.name.trim(),
          whatsapp: input.whatsapp?.trim() || null,
          origin: 'manual',
          stage,
          owner_id: profile.id,
          closer_id: profile.id,
          notes: input.notes?.trim() || null,
          lost_reason: input.outcome === 'lost' ? (input.lostReason ?? 'Outro') : null,
          created_at: factAt,
        })
        .select()
        .single()
      if (leadError) throw leadError

      if (meetingStatus === 'agendada') await assertSlotFree(profile.id, input.scheduledAt)

      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          lead_id: lead.id,
          closer_id: profile.id,
          booked_by: profile.id,
          scheduled_at: input.scheduledAt,
          status: meetingStatus,
          created_at: factAt,
        })
        .select()
        .single()
      if (meetingError) throw meetingError

      let saleId: string | null = null
      if (input.sold && input.productId && input.amount != null) {
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            lead_id: lead.id,
            meeting_id: meeting.id,
            closer_id: profile.id,
            product_id: input.productId,
            amount: input.amount,
            sold_at: factAt,
          })
          .select()
          .single()
        if (saleError) throw saleError
        saleId = sale.id
      }

      await supabase.from('lead_events').insert([
        {
          lead_id: lead.id,
          actor_id: profile.id,
          type: 'created',
          to_stage: stage,
          payload: { lancamento_retroativo: true, data_do_fato: factAt },
        },
        {
          lead_id: lead.id,
          actor_id: profile.id,
          type: 'meeting_booked',
          to_stage: stage,
          payload: {
            meeting_id: meeting.id,
            scheduled_at: input.scheduledAt,
            lancamento_retroativo: true,
          },
        },
        ...(input.attended !== null
          ? [
              {
                lead_id: lead.id,
                actor_id: profile.id,
                type: 'meeting_outcome' as const,
                to_stage: stage,
                payload: { attended: input.attended, lancamento_retroativo: true },
              },
            ]
          : []),
        ...(saleId
          ? [
              {
                lead_id: lead.id,
                actor_id: profile.id,
                type: 'sale' as const,
                to_stage: stage,
                payload: {
                  sale_id: saleId,
                  amount: input.amount,
                  product_id: input.productId,
                  lancamento_retroativo: true,
                },
              },
            ]
          : []),
      ])

      return lead
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['funnel-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['team-performance'] })
    },
  })
}
