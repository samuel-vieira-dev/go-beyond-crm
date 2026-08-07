import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Goal, GoalMetric } from '@/types/database'

export interface GoalFilters {
  profileId?: string
  /** Metas vigentes num dia específico ("yyyy-MM-dd"). */
  activeOn?: string
  /**
   * Metas que ENCOSTAM no período ("yyyy-MM-dd" nos dois). Substitui o `activeOn`
   * das telas de ranking, que só pegava as metas vigentes no PRIMEIRO dia do filtro:
   * com "Este mês" selecionado, uma meta quinzenal começando no dia 16 sumia da tela.
   */
  overlapping?: { from: string; to: string }
}

export function useGoals(filters: GoalFilters = {}) {
  return useQuery({
    queryKey: ['goals', filters],
    queryFn: async () => {
      let q = supabase.from('goals').select('*').order('period_start', { ascending: false })
      if (filters.profileId) q = q.eq('profile_id', filters.profileId)
      if (filters.activeOn) q = q.lte('period_start', filters.activeOn).gte('period_end', filters.activeOn)
      if (filters.overlapping) {
        q = q.lte('period_start', filters.overlapping.to).gte('period_end', filters.overlapping.from)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Goal[]
    },
  })
}

export interface UpsertGoalInput {
  id?: string
  profile_id: string
  metric: GoalMetric
  target_reachable: number
  target_high: number
  target_super: number
  period_start: string
  period_end: string
}

export function useUpsertGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertGoalInput) => {
      const { id, ...rest } = input
      if (id) {
        const { error } = await supabase.from('goals').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('goals').insert(rest)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  })
}
