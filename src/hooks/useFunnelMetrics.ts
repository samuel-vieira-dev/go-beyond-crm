import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchManualByProfile } from './useManualMetrics'
import { fetchManualSales } from './useManualSales'

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
    const channel = supabase.channel('admin-funnel-changes')
    for (const table of ['leads', 'meetings', 'sales', 'social_metrics', 'manual_sales']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        queryClient.invalidateQueries({ queryKey: ['funnel-metrics'] })
      })
    }
    channel.subscribe()
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

      // O funil da gestão precisa mostrar a operação inteira, não só a parte que
      // virou card. Soma o que foi lançado à mão em cada etapa.
      const [{ byProfile: manual }, manualSales] = await Promise.all([
        fetchManualByProfile(range),
        fetchManualSales(range),
      ])
      const totals = [...manual.values()].reduce(
        (acc, t) => ({
          qualified: acc.qualified + t.mqls,
          scheduled: acc.scheduled + t.agendamentos,
          held: acc.held + t.reunioes_realizadas,
          noShow: acc.noShow + t.no_shows,
        }),
        { qualified: 0, scheduled: 0, held: 0, noShow: 0 },
      )

      const meetingsHeld = (meetingsRes.data ?? []).filter((m) => m.status === 'realizada').length
      const meetingsNoShow = (meetingsRes.data ?? []).filter((m) => m.status === 'nao_compareceu').length
      const revenue =
        (salesRes.data ?? []).reduce((sum, s) => sum + Number(s.amount), 0) +
        manualSales.reduce((sum, s) => sum + Number(s.amount), 0)

      return {
        // "leads" continua sendo só card: lançamento manual é de etapa, não de lead —
        // inflar a base aqui distorceria toda taxa de conversão do funil.
        leads: leadsRes.count ?? 0,
        qualified: (qualifiedRes.count ?? 0) + totals.qualified,
        scheduled: (scheduledRes.count ?? 0) + totals.scheduled,
        meetingsHeld: meetingsHeld + totals.held,
        meetingsNoShow: meetingsNoShow + totals.noShow,
        sales: (salesRes.data?.length ?? 0) + manualSales.length,
        revenue,
      }
    },
  })
}
