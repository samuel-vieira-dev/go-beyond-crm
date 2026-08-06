import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
import type { DateRange } from './useFunnelMetrics'
import type { LeadStage } from '@/types/domain'

export interface PresalesDailyReport {
  newLeads: number
  meetingsBooked: number
  /** Contagem ATUAL de leads por etapa (do próprio pré-vendedor). */
  pipeline: Record<string, number>
  leads: { id: string; name: string; stage: LeadStage; created_at: string }[]
  /** Mesmos números, quebrados por dia ("yyyy-MM-dd" local) para o relatório diário. */
  byDay: Record<string, { newLeads: number; meetingsBooked: number }>
}

/** Relatório do pré-vendedor: atividade no período + snapshot atual do pipeline dele. */
export function usePresalesDailyReport(profileId: string | null, range: DateRange) {
  useRealtimeInvalidate('presales-report-rt', ['leads', 'lead_events', 'meetings'], [['daily-report', 'presales']])

  return useQuery({
    queryKey: ['daily-report', 'presales', profileId, range],
    enabled: !!profileId,
    queryFn: async (): Promise<PresalesDailyReport> => {
      const { data: events, error: eventsError } = await supabase
        .from('lead_events')
        .select('type, created_at')
        .eq('actor_id', profileId!)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
      if (eventsError) throw eventsError

      let newLeads = 0
      let meetingsBooked = 0
      const byDay: PresalesDailyReport['byDay'] = {}
      for (const ev of events ?? []) {
        const isNew = ev.type === 'created'
        const isMeeting = ev.type === 'meeting_booked'
        if (!isNew && !isMeeting) continue
        if (isNew) newLeads++
        if (isMeeting) meetingsBooked++
        // Dia local: o relatório é lido no fuso de quem preenche, não em UTC.
        const day = format(new Date(ev.created_at), 'yyyy-MM-dd')
        const bucket = (byDay[day] ??= { newLeads: 0, meetingsBooked: 0 })
        if (isNew) bucket.newLeads++
        if (isMeeting) bucket.meetingsBooked++
      }

      // Snapshot atual do pipeline (leads do próprio pré-vendedor).
      const { data: allLeads, error: pipelineError } = await supabase
        .from('leads')
        .select('stage')
        .eq('owner_id', profileId!)
      if (pipelineError) throw pipelineError
      const pipeline: Record<string, number> = {}
      for (const l of allLeads ?? []) pipeline[l.stage] = (pipeline[l.stage] ?? 0) + 1

      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, stage, created_at')
        .eq('owner_id', profileId!)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
        .order('created_at', { ascending: false })
      if (leadsError) throw leadsError

      return { newLeads, meetingsBooked, pipeline, leads: leads ?? [], byDay }
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

      // Vendas fechadas no período.
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('amount')
        .eq('closer_id', profileId!)
        .gte('sold_at', range.from)
        .lte('sold_at', range.to)
      if (salesError) throw salesError

      const rows = (meetings ?? []) as unknown as {
        id: string
        status: string
        scheduled_at: string
        lead: { name: string } | null
      }[]

      // Reuniões e vendas que aconteceram sem card entram no mesmo relatório.
      const { byProfile: manual } = await fetchManualByProfile(range)
      const extra = manual.get(profileId!)

      const meetingsHeld = rows.filter((m) => m.status === 'realizada').length + (extra?.reunioes_realizadas ?? 0)
      const noShow = rows.filter((m) => m.status === 'nao_compareceu').length + (extra?.no_shows ?? 0)
      const revenue = (sales ?? []).reduce((sum, s) => sum + Number(s.amount), 0) + (extra?.faturamento ?? 0)
      const salesCount = (sales?.length ?? 0) + (extra?.vendas ?? 0)

      return {
        meetingsScheduled: rows.length + (extra?.agendamentos ?? 0),
        meetingsHeld,
        noShow,
        sales: salesCount,
        revenue,
        conversionRate: meetingsHeld > 0 ? (salesCount / meetingsHeld) * 100 : 0,
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
