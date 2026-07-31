import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DateRange } from './useFunnelMetrics'

/** Números que a social seller preenche à mão (Ativações e Conversas em condução). */
export function useMySocialMetrics(range: DateRange) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['social-metrics', profile?.id, range],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_metrics')
        .select('*')
        .eq('profile_id', profile!.id)
        .gte('date', range.from.slice(0, 10))
        .lte('date', range.to.slice(0, 10))
      if (error) throw error
      const rows = (data ?? []) as { date: string; ativacoes: number; conversas: number }[]
      return {
        rows,
        ativacoes: rows.reduce((s, r) => s + r.ativacoes, 0),
        conversas: rows.reduce((s, r) => s + r.conversas, 0),
      }
    },
  })
}

export function useSaveSocialMetrics() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ date, ativacoes, conversas }: { date: Date; ativacoes: number; conversas: number }) => {
      const { error } = await supabase.from('social_metrics').upsert(
        {
          profile_id: profile!.id,
          date: format(date, 'yyyy-MM-dd'),
          ativacoes,
          conversas,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,date' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social-metrics'] }),
  })
}
