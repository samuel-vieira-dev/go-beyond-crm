import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import type { DateRange } from './useFunnelMetrics'

export interface OperationBreakdown {
  scheduledByPresaler: { name: string; count: number }[]
  realizedByCloser: { name: string; count: number }[]
}

/** Métricas da operação para o Admin: agendamentos por pré-vendedor e reuniões
 *  realizadas por closer (estado atual, em tempo real). */
export function useOperationBreakdown() {
  useRealtimeInvalidate('operation-breakdown-rt', ['meetings'], [['operation-breakdown']])

  return useQuery({
    queryKey: ['operation-breakdown'],
    queryFn: async (): Promise<OperationBreakdown> => {
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, role')
      if (pErr) throw pErr
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

      const { data: meetings, error: mErr } = await supabase.from('meetings').select('booked_by, closer_id, status')
      if (mErr) throw mErr

      const scheduled = new Map<string, number>()
      const realized = new Map<string, number>()
      for (const m of meetings ?? []) {
        if (m.booked_by) scheduled.set(m.booked_by, (scheduled.get(m.booked_by) ?? 0) + 1)
        if (m.status === 'realizada' && m.closer_id) {
          realized.set(m.closer_id, (realized.get(m.closer_id) ?? 0) + 1)
        }
      }

      const toList = (map: Map<string, number>) =>
        Array.from(map.entries())
          .map(([id, count]) => ({ name: nameById.get(id) ?? 'Desconhecido', count }))
          .sort((a, b) => b.count - a.count)

      return { scheduledByPresaler: toList(scheduled), realizedByCloser: toList(realized) }
    },
  })
}

export interface PresalesPerformance {
  profileId: string
  fullName: string
  meetingsBooked: number
  meetingsHeld: number
  meetingsNoShow: number
  attendanceRate: number
  noShowRate: number
}

export function usePresalesPerformance(range: DateRange) {
  useRealtimeInvalidate('presales-perf-rt', ['meetings', 'leads'], [['team-performance', 'presales']])
  return useQuery({
    queryKey: ['team-performance', 'presales', range],
    queryFn: async (): Promise<PresalesPerformance[]> => {
      const { data: presalers, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['sdr', 'social_seller'])
        .eq('active', true)
      if (profilesError) throw profilesError

      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('booked_by, status')
        .gte('scheduled_at', range.from)
        .lte('scheduled_at', range.to)
      if (meetingsError) throw meetingsError

      return (presalers ?? []).map((p) => {
        const mine = (meetings ?? []).filter((m) => m.booked_by === p.id)
        const held = mine.filter((m) => m.status === 'realizada').length
        const noShow = mine.filter((m) => m.status === 'nao_compareceu').length
        const resolved = held + noShow
        return {
          profileId: p.id,
          fullName: p.full_name,
          meetingsBooked: mine.length,
          meetingsHeld: held,
          meetingsNoShow: noShow,
          attendanceRate: resolved > 0 ? (held / resolved) * 100 : 0,
          noShowRate: resolved > 0 ? (noShow / resolved) * 100 : 0,
        }
      })
    },
  })
}

export interface CloserPerformance {
  profileId: string
  fullName: string
  sales: number
  revenue: number
}

export interface DailyPoint {
  date: string
  sales: number
  revenue: number
}

export interface CloserPerformanceResult {
  byCloser: CloserPerformance[]
  daily: DailyPoint[]
  totalSales: number
  totalRevenue: number
}

export function useCloserPerformance(range: DateRange) {
  useRealtimeInvalidate('closer-perf-rt', ['sales', 'meetings'], [['team-performance', 'closers']])
  return useQuery({
    queryKey: ['team-performance', 'closers', range],
    queryFn: async (): Promise<CloserPerformanceResult> => {
      // Todos os perfis (para resolver o nome de quem fez a venda, mesmo admin/inativo).
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, role, active')
      if (profilesError) throw profilesError
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('closer_id, amount, sold_at')
        .gte('sold_at', range.from)
        .lte('sold_at', range.to)
      if (salesError) throw salesError

      // Agrupa as vendas por quem realmente as fez — nenhuma venda fica de fora.
      const perfById = new Map<string, CloserPerformance>()
      // Começa com os closers ativos (para aparecerem mesmo com 0 vendas).
      for (const p of profiles ?? []) {
        if (p.role === 'closer' && p.active) {
          perfById.set(p.id, { profileId: p.id, fullName: p.full_name, sales: 0, revenue: 0 })
        }
      }
      for (const s of sales ?? []) {
        const existing =
          perfById.get(s.closer_id) ??
          { profileId: s.closer_id, fullName: nameById.get(s.closer_id) ?? 'Sem closer', sales: 0, revenue: 0 }
        existing.sales += 1
        existing.revenue += Number(s.amount)
        perfById.set(s.closer_id, existing)
      }
      const byCloser = Array.from(perfById.values())

      const dailyMap = new Map<string, DailyPoint>()
      for (const s of sales ?? []) {
        const day = s.sold_at.slice(0, 10)
        const point = dailyMap.get(day) ?? { date: day, sales: 0, revenue: 0 }
        point.sales += 1
        point.revenue += Number(s.amount)
        dailyMap.set(day, point)
      }
      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

      return {
        byCloser,
        daily,
        totalSales: sales?.length ?? 0,
        totalRevenue: (sales ?? []).reduce((sum, s) => sum + Number(s.amount), 0),
      }
    },
  })
}
