import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { DERIVED_FIELDS, type DerivedField } from './useManualMetrics'
import type { DateRange } from './useFunnelMetrics'

export type DerivedTotals = Record<DerivedField, number>

export interface DerivedDailyCounts {
  /** "yyyy-MM-dd" local → contagens do dia. Dia sem lead nenhum não aparece. */
  byDay: Record<string, DerivedTotals>
  totals: DerivedTotals
}

function emptyDerived(): DerivedTotals {
  return { leads_recebidos: 0, leads_qualificados: 0 }
}

/**
 * As colunas read-only da grade do relatório, contadas direto do kanban.
 *
 * "Leads recebidos" são os leads sob responsabilidade da pessoa, pelo dia em que
 * ENTRARAM (leads.created_at). "Leads qualificados" são os mesmos, filtrados por
 * `is_mql` — que é o que a interface mostra como a tag QUALIFICADO no card.
 *
 * ATENÇÃO À DATA: o qualificado é contado no dia em que o lead entrou, não no dia em
 * que foi marcado (decisão do time). Como `is_mql` é o estado ATUAL e não existe
 * registro de quando virou, qualificar hoje um lead de terça faz o número subir na
 * linha de terça, não na de hoje. É o comportamento combinado — a alternativa exigia
 * gravar a data da qualificação, que não existe para o histórico já cadastrado.
 */
export function useDerivedDailyCounts(profileId: string | null, range: DateRange) {
  useRealtimeInvalidate('derived-daily-rt', ['leads'], [['derived-daily']])

  return useQuery({
    queryKey: ['derived-daily', profileId, range],
    enabled: !!profileId,
    queryFn: async (): Promise<DerivedDailyCounts> => {
      const { data, error } = await supabase
        .from('leads')
        .select('created_at, is_mql')
        .eq('owner_id', profileId!)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
      if (error) throw error

      const byDay: Record<string, DerivedTotals> = {}
      const totals = emptyDerived()

      for (const lead of data ?? []) {
        // Dia local: a grade é lida no fuso de quem preenche, não em UTC.
        const day = format(new Date(lead.created_at), 'yyyy-MM-dd')
        const bucket = (byDay[day] ??= emptyDerived())
        bucket.leads_recebidos++
        totals.leads_recebidos++
        if (lead.is_mql) {
          bucket.leads_qualificados++
          totals.leads_qualificados++
        }
      }

      return { byDay, totals }
    },
  })
}

/** Soma as contagens derivadas de um período — usada pelos totais do rodapé. */
export function sumDerived(counts: DerivedDailyCounts | undefined): DerivedTotals {
  if (!counts) return emptyDerived()
  const out = emptyDerived()
  for (const f of DERIVED_FIELDS) out[f] = counts.totals[f]
  return out
}
