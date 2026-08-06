import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { ManualSale } from '@/types/database'
import type { DateRange } from './useFunnelMetrics'

/**
 * Venda sem card no kanban. Soma a public.sales em ranking, funil e canal.
 *
 * amount é o valor NEGOCIADO, não o de tabela: products.default_price é só a
 * sugestão que o formulário preenche. O closer tem margem e precisa poder baixar
 * o valor sem que isso vire um produto novo no cadastro.
 */
const SALE_KEYS = [
  ['manual-sales'],
  ['team-performance'],
  ['daily-report'],
  ['funnel-metrics'],
  ['channel-sales'],
]

export interface ManualSaleInput {
  id?: string
  closerId?: string
  soldOn: string
  productId?: string | null
  productName?: string | null
  channel?: string | null
  amount: number
  nota?: string | null
}

export function useManualSales(filters: { closerId?: string; range?: DateRange } = {}) {
  return useQuery({
    queryKey: ['manual-sales', filters],
    queryFn: async () => {
      let q = supabase.from('manual_sales').select('*').order('sold_on', { ascending: false })
      if (filters.closerId) q = q.eq('closer_id', filters.closerId)
      if (filters.range) {
        q = q.gte('sold_on', filters.range.from.slice(0, 10)).lte('sold_on', filters.range.to.slice(0, 10))
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ManualSale[]
    },
  })
}

/** Totais por closer no período — usado pelos rankings sem refazer a consulta. */
export async function fetchManualSales(range: DateRange) {
  const { data, error } = await supabase
    .from('manual_sales')
    .select('closer_id, sold_on, channel, amount')
    .gte('sold_on', range.from.slice(0, 10))
    .lte('sold_on', range.to.slice(0, 10))
  if (error) throw error
  return (data ?? []) as Pick<ManualSale, 'closer_id' | 'sold_on' | 'channel' | 'amount'>[]
}

export function useSaveManualSale() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: ManualSaleInput) => {
      const payload = {
        closer_id: input.closerId ?? profile!.id,
        sold_on: input.soldOn,
        product_id: input.productId ?? null,
        product_name: input.productName ?? null,
        channel: input.channel ?? null,
        amount: input.amount,
        nota: input.nota ?? null,
      }

      if (input.id) {
        const { error } = await supabase.from('manual_sales').update(payload).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('manual_sales')
          .insert({ ...payload, created_by: profile!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      for (const key of SALE_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeleteManualSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('manual_sales').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of SALE_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
