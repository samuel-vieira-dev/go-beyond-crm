import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DateRange {
  from: string
  to: string
}

export interface FunnelMetrics {
  leads: number
  qualified: number
  scheduled: number
  meetingsHeld: number
  meetingsNoShow: number
  sales: number
  revenue: number
}

export function useFunnelMetrics(range: DateRange) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('admin-funnel-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['funnel-metrics'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['funnel-metrics'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['funnel-metrics'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return useQuery({
    queryKey: ['funnel-metrics', range],
    queryFn: async (): Promise<FunnelMetrics> => {
      const [leadsRes, qualifiedRes, scheduledRes, meetingsRes, salesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', range.from)
          .lte('created_at', range.to),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('is_mql', true)
          .gte('created_at', range.from)
          .lte('created_at', range.to),
        supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', range.from)
          .lte('created_at', range.to),
        supabase
          .from('meetings')
          .select('status')
          .gte('scheduled_at', range.from)
          .lte('scheduled_at', range.to)
          .in('status', ['realizada', 'nao_compareceu']),
        supabase.from('sales').select('amount').gte('sold_at', range.from).lte('sold_at', range.to),
      ])

      if (leadsRes.error) throw leadsRes.error
      if (qualifiedRes.error) throw qualifiedRes.error
      if (scheduledRes.error) throw scheduledRes.error
      if (meetingsRes.error) throw meetingsRes.error
      if (salesRes.error) throw salesRes.error

      const meetingsHeld = (meetingsRes.data ?? []).filter((m) => m.status === 'realizada').length
      const meetingsNoShow = (meetingsRes.data ?? []).filter((m) => m.status === 'nao_compareceu').length
      const revenue = (salesRes.data ?? []).reduce((sum, s) => sum + Number(s.amount), 0)

      return {
        leads: leadsRes.count ?? 0,
        qualified: qualifiedRes.count ?? 0,
        scheduled: scheduledRes.count ?? 0,
        meetingsHeld,
        meetingsNoShow,
        sales: salesRes.data?.length ?? 0,
        revenue,
      }
    },
  })
}
