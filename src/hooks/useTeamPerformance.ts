import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
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
  useRealtimeInvalidate('closer-perf-rt', ['sales', 'meetings', 'social_metrics'], [['team-performance', 'closers']])
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

      const { rows: manualRows, byProfile: manual } = await fetchManualByProfile(range)

      // A linha de cada closer no ranking mostra só o lançamento manual — o mesmo
      // número que aparece no relatório dele e alimenta a meta logo abaixo, no mesmo
      // card. Antes somava kanban + manual aqui e o card mostrava dois valores
      // diferentes de "vendas" lado a lado (um no ranking, outro na barra de meta).
      const perfById = new Map<string, CloserPerformance>()
      // Começa com os closers ativos (para aparecerem mesmo com 0 vendas).
      for (const p of profiles ?? []) {
        if (p.role === 'closer' && p.active) {
          perfById.set(p.id, { profileId: p.id, fullName: p.full_name, sales: 0, revenue: 0 })
        }
      }
      for (const [profileId, totals] of manual) {
        if (totals.vendas === 0 && totals.faturamento === 0) continue
        const existing =
          perfById.get(profileId) ??
          { profileId, fullName: nameById.get(profileId) ?? 'Sem closer', sales: 0, revenue: 0 }
        existing.sales += totals.vendas
        existing.revenue += totals.faturamento
        perfById.set(profileId, existing)
      }

      const byCloser = Array.from(perfById.values())

      const dailyMap = new Map<string, DailyPoint>()
      const addDay = (day: string, count: number, amount: number) => {
        const point = dailyMap.get(day) ?? { date: day, sales: 0, revenue: 0 }
        point.sales += count
        point.revenue += amount
        dailyMap.set(day, point)
      }
      for (const s of sales ?? []) addDay(s.sold_at.slice(0, 10), 1, Number(s.amount))
      for (const r of manualRows) {
        if (r.vendas || r.faturamento) addDay(r.date, r.vendas ?? 0, Number(r.faturamento ?? 0))
      }
      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

      const manualSales = manualRows.reduce((t, r) => t + (r.vendas ?? 0), 0)
      const manualRevenue = manualRows.reduce((t, r) => t + Number(r.faturamento ?? 0), 0)

      return {
        byCloser,
        daily,
        totalSales: (sales?.length ?? 0) + manualSales,
        totalRevenue: (sales ?? []).reduce((t, s) => t + Number(s.amount), 0) + manualRevenue,
      }
    },
  })
}
