import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualSales } from './useManualSales'
import type { DateRange } from './useFunnelMetrics'
import { CHANNEL_TAGS } from '@/types/domain'

export interface ChannelRow {
  channel: string
  leads: number
  vendas: number
  receita: number
}

/** Vendas e faturamento por canal de origem (tag do lead). */
export function useChannelSales(range: DateRange) {
  useRealtimeInvalidate('channel-sales-rt', ['leads', 'sales', 'manual_sales'], [['channel-sales']])

  return useQuery({
    queryKey: ['channel-sales', range],
    queryFn: async (): Promise<ChannelRow[]> => {
      const [{ data: leads }, { data: sales }] = await Promise.all([
        supabase.from('leads').select('id, form_tag, created_at').gte('created_at', range.from).lte('created_at', range.to),
        supabase.from('sales').select('lead_id, amount, sold_at').gte('sold_at', range.from).lte('sold_at', range.to),
      ])

      // Precisa da tag de todos os leads vendidos, mesmo os criados fora do período.
      const soldIds = [...new Set((sales ?? []).map((s) => s.lead_id))]
      const tagById = new Map<string, string>()
      for (const l of leads ?? []) tagById.set(l.id, l.form_tag ?? 'Sem canal')
      const missing = soldIds.filter((id) => !tagById.has(id))
      if (missing.length > 0) {
        const { data: extra } = await supabase.from('leads').select('id, form_tag').in('id', missing)
        for (const l of extra ?? []) tagById.set(l.id, l.form_tag ?? 'Sem canal')
      }

      const rows = new Map<string, ChannelRow>()
      for (const c of CHANNEL_TAGS) rows.set(c, { channel: c, leads: 0, vendas: 0, receita: 0 })
      const get = (c: string) => {
        if (!rows.has(c)) rows.set(c, { channel: c, leads: 0, vendas: 0, receita: 0 })
        return rows.get(c)!
      }

      for (const l of leads ?? []) get(l.form_tag ?? 'Sem canal').leads++
      for (const s of sales ?? []) {
        const r = get(tagById.get(s.lead_id) ?? 'Sem canal')
        r.vendas++
        r.receita += Number(s.amount)
      }

      // Venda sem card carrega o canal nela mesma (não há lead de onde herdar a tag).
      for (const s of await fetchManualSales(range)) {
        const r = get(s.channel ?? 'Sem canal')
        r.vendas++
        r.receita += Number(s.amount)
      }

      return [...rows.values()].sort((a, b) => b.receita - a.receita)
    },
  })
}
