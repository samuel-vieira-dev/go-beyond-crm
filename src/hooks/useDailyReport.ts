import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
import { fetchRealized, type Realized } from './useRealized'
import type { DateRange } from './useFunnelMetrics'
import type { LeadStage } from '@/types/domain'

export interface PresalesDailyReport {
  leads: { id: string; name: string; stage: LeadStage; created_at: string }[]
}

/**
 * A lista de leads que o pré-vendedor recebeu no período.
 *
 * Ficou só nisso: os blocos "Sua atividade no período" e "Seu pipeline agora" saíram
 * da tela, e os números do dia agora vivem todos na grade editável (ManualMetricsPanel
 * + useDerivedDailyCounts). Manter aqui os agregados que ninguém lê custaria quatro
 * consultas por abertura de tela e mais uma chance de divergir da grade.
 */
export function usePresalesDailyReport(profileId: string | null, range: DateRange) {
  useRealtimeInvalidate('presales-report-rt', ['leads'], [['daily-report', 'presales']])

  return useQuery({
    queryKey: ['daily-report', 'presales', profileId, range],
    enabled: !!profileId,
    queryFn: async (): Promise<PresalesDailyReport> => {
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, stage, created_at')
        .eq('owner_id', profileId!)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
        .order('created_at', { ascending: false })
      if (leadsError) throw leadsError

      return { leads: leads ?? [] }
    },
  })
}

export interface CloserDailyReport {
  meetingsScheduled: number
  meetingsHeld: number
  noShow: number
  sales: number
  revenue: number
  /** Taxa de conversão do closer: vendas ÷ reuniões realizadas. */
  conversionRate: number
  meetings: DayMeeting[]
  /** Os mesmos números que as metas medem, pela mesma conta. Ver PresalesDailyReport. */
  realizado: Realized
}

export interface DayMeeting {
  id: string
  scheduled_at: string
  status: string
  lead_name: string
}

/** Relatório do Closer para um período (hoje/semana/mês/personalizado). */
export function useCloserDailyReport(profileId: string | null, range: DateRange) {
  useRealtimeInvalidate(
    'closer-report-rt',
    ['leads', 'meetings', 'sales', 'social_metrics'],
    [['daily-report', 'closer']],
  )

  return useQuery({
    queryKey: ['daily-report', 'closer', profileId, range],
    enabled: !!profileId,
    queryFn: async (): Promise<CloserDailyReport> => {
      // Reuniões agendadas no período (qualquer status), com nome do lead.
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id, status, scheduled_at, lead:leads(name)')
        .eq('closer_id', profileId!)
        .gte('scheduled_at', range.from)
        .lte('scheduled_at', range.to)
        .order('scheduled_at', { ascending: true })
      if (meetingsError) throw meetingsError

      const rows = (meetings ?? []) as unknown as {
        id: string
        status: string
        scheduled_at: string
        lead: { name: string } | null
      }[]

      // Reuniões e vendas que aconteceram sem card entram no mesmo relatório.
      const { byProfile: manual } = await fetchManualByProfile(range)
      const extra = manual.get(profileId!)

      // Reunião, agendamento, venda e faturamento vêm da fonte única — a mesma que
      // alimenta as metas. Só o no-show é contado aqui: não é métrica de meta.
      const realizado = await fetchRealized(profileId!, 'closer', range)
      const meetingsHeld = realizado.reunioes_realizadas
      const salesCount = realizado.vendas
      const noShow = rows.filter((m) => m.status === 'nao_compareceu').length + (extra?.no_shows ?? 0)

      return {
        meetingsScheduled: realizado.agendamentos,
        meetingsHeld,
        noShow,
        sales: salesCount,
        revenue: realizado.faturamento,
        conversionRate: meetingsHeld > 0 ? (salesCount / meetingsHeld) * 100 : 0,
        realizado,
        meetings: rows.map((m) => ({
          id: m.id,
          scheduled_at: m.scheduled_at,
          status: m.status,
          lead_name: m.lead?.name ?? '—',
        })),
      }
    },
  })
}
