import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { SaleWithRelations } from '@/types/database'

const SALE_SELECT = '*, product:products(id,name), lead:leads(id,name)'

export function useSales(filters: { closerId?: string; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      let q = supabase.from('sales').select(SALE_SELECT).order('sold_at', { ascending: false })
      if (filters.closerId) q = q.eq('closer_id', filters.closerId)
      if (filters.from) q = q.gte('sold_at', filters.from)
      if (filters.to) q = q.lte('sold_at', filters.to)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as SaleWithRelations[]
    },
  })
}

interface RegisterSaleInput {
  leadId: string
  meetingId?: string | null
  productId: string
  amount: number
}

interface RegisterNoSaleInput {
  leadId: string
  lost: boolean
  lostReason?: string
}

export function useRegisterSale() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, meetingId, productId, amount }: RegisterSaleInput) => {
      if (!profile) throw new Error('Sem sessão')

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          lead_id: leadId,
          meeting_id: meetingId ?? null,
          closer_id: profile.id,
          product_id: productId,
          amount,
        })
        .select()
        .single()
      if (saleError) throw saleError

      const { error: leadError } = await supabase.from('leads').update({ stage: 'venda_fechada' }).eq('id', leadId)
      if (leadError) throw leadError

      // Vender pressupõe que a reunião aconteceu: garante que ela conste como realizada
      // (caso o closer tenha pulado direto para o registro da venda).
      if (meetingId) {
        await supabase.from('meetings').update({ status: 'realizada' }).eq('id', meetingId)
      } else {
        await supabase
          .from('meetings')
          .update({ status: 'realizada' })
          .eq('lead_id', leadId)
          .eq('status', 'agendada')
      }

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile.id,
        type: 'sale',
        to_stage: 'venda_fechada',
        payload: { sale_id: sale.id, amount, product_id: productId },
      })

      return sale
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

/** Reunião realizada mas não vendeu: segue pra follow-up de fechamento ou é marcado como perdido. */
export function useRegisterNoSale() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, lost, lostReason }: RegisterNoSaleInput) => {
      const newStage = lost ? 'perdido' : 'follow_up_fechamento'
      const { error } = await supabase
        .from('leads')
        .update({ stage: newStage, lost_reason: lost ? (lostReason ?? 'Outro') : null })
        .eq('id', leadId)
      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'stage_change',
        to_stage: newStage,
        payload: lost ? { lost_reason: lostReason } : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}
