import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
import { fetchRealized, type Realized } from './useRealized'
import type { DateRange } from './useFunnelMetrics'
import type { LeadStage, Role } from '@/types/domain'

export interface PresalesDailyReport {
  newLeads: number
  meetingsBooked: number
  /**
   * Exatamente os números que as metas medem, pela MESMA conta (ver useRealized).
   * Estão aqui para que o relatório e a aba de metas não possam mostrar valores
   * diferentes do mesmo período — era essa a divergência que o time reportava.
   */
  realizado: Realized
  /** Contagem ATUAL de leads por etapa (do próprio pré-vendedor). */
  pipeline: Record<string, number>
  leads: { id: string; name: string; stage: LeadStage; created_at: string }[]
  /** Mesmos números, quebrados por dia ("yyyy-MM-dd" local) para o relatório diário. */
  byDay: Record<string, { newLeads: number; meetingsBooked: number }>
}

/** Relatório do pré-vendedor: atividade no período + snapshot atual do pipeline dele. */
export function usePresalesDailyReport(profileId: string | null, role: Role, range: DateRange) {
  useRealtimeInvalidate(
    'presales-report-rt',
    ['leads', 'lead_events', 'meetings', 'social_metrics'],
    [['daily-report', 'presales']],
  )

  return useQuery({
    queryKey: ['daily-report', 'presales', profileId, role, range],
    enabled: !!profileId,
    queryFn: async (): Promise<PresalesDailyReport> => {
      const { data: events, error: eventsError } = await supabase
        .from('lead_events')
        .select('created_at')
        .eq('actor_id', profileId!)
        .eq('type', 'created')
        .gte('created_at', range.from)
        .lte('created_at', range.to)
      if (eventsError) throw eventsError

      // Agendamentos: mesma fonte e mesmo campo de data do funil do Admin
      // (useFunnelMetrics) e do ranking (usePresalesPerformanceSplit) — a data em que
      // a reunião foi MARCADA, não a data em que ela vai acontecer. Vem direto de
      // meetings (não de lead_events): não depende do evento espelho ter sido gravado.
      const { data: booked, error: bookedError } = await supabase
        .from('meetings')
        .select('created_at')
        .eq('booked_by', profileId!)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
      if (bookedError) throw bookedError

      let newLeads = 0
      const byDay: PresalesDailyReport['byDay'] = {}
      for (const ev of events ?? []) {
        newLeads++
        // Dia local: o relatório é lido no fuso de quem preenche, não em UTC.
        const day = format(new Date(ev.created_at), 'yyyy-MM-dd')
        const bucket = (byDay[day] ??= { newLeads: 0, meetingsBooked: 0 })
        bucket.newLeads++
      }
      for (const m of booked ?? []) {
        const day = format(new Date(m.created_at), 'yyyy-MM-dd')
        const bucket = (byDay[day] ??= { newLeads: 0, meetingsBooked: 0 })
        bucket.meetingsBooked++
      }

      // Lançamento manual soma ao total E ao dia certo — sem isso, o número do topo
      // (com manual) não batia com a soma das linhas da grade abaixo (que já mostrava
      // o manual separado).
      const { rows: manualRows } = await fetchManualByProfile(range)
      for (const r of manualRows) {
        if (r.profile_id !== profileId || !r.agendamentos) continue
        const bucket = (byDay[r.date] ??= { newLeads: 0, meetingsBooked: 0 })
        bucket.meetingsBooked += r.agendamentos
      }
      // Os totais das metas vêm da fonte única — não de uma segunda conta feita aqui.
      const realizado = await fetchRealized(profileId!, role, range)
      const meetingsBooked = realizado.agendamentos

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

      return { newLeads, meetingsBooked, realizado, pipeline, leads: leads ?? [], byDay }
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
