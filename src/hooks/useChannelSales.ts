import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
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
  useRealtimeInvalidate('channel-sales-rt', ['leads', 'sales', 'manual_sales', 'social_metrics'], [['channel-sales']])

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

      // Venda sem card: o TOTAL é o que a pessoa lançou no relatório do dia, e
      // manual_sales só diz de qual canal veio cada parte dele. Somar manual_sales
      // direto contaria em dobro; somar só o total jogaria tudo em "Sem canal".
      // Então atribui o que está identificado e manda a sobra para "Sem canal".
      const [{ byProfile: manual }, atribuidas] = await Promise.all([
        fetchManualByProfile(range),
        fetchManualSales(range),
      ])

      let totalManual = 0
      let totalManualVendas = 0
      for (const t of manual.values()) {
        totalManual += t.faturamento
        totalManualVendas += t.vendas
      }

      let identificado = 0
      let identificadas = 0
      for (const s of atribuidas) {
        const r = get(s.channel ?? 'Sem canal')
        r.vendas++
        r.receita += Number(s.amount)
        identificado += Number(s.amount)
        identificadas++
      }

      const sobra = totalManual - identificado
      const sobraVendas = totalManualVendas - identificadas
      if (sobra > 0.01 || sobraVendas > 0) {
        const r = get('Sem canal')
        r.vendas += Math.max(sobraVendas, 0)
        r.receita += Math.max(sobra, 0)
      }

      return [...rows.values()].sort((a, b) => b.receita - a.receita)
    },
  })
}
