import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Goal, GoalMetric } from '@/types/database'

export function useGoals(filters: { profileId?: string; activeOn?: string } = {}) {
  return useQuery({
    queryKey: ['goals', filters],
    queryFn: async () => {
      let q = supabase.from('goals').select('*').order('period_start', { ascending: false })
      if (filters.profileId) q = q.eq('profile_id', filters.profileId)
      if (filters.activeOn) q = q.lte('period_start', filters.activeOn).gte('period_end', filters.activeOn)
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
