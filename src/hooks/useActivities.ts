import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useRealtimeInvalidate } from './useRealtime'
import type { Activity, ActivityWithLead } from '@/types/database'
import type { ActivityType } from '@/types/domain'

export function useLeadActivities(leadId: string | null) {
  return useQuery({
    queryKey: ['activities', 'lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('lead_id', leadId!)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as Activity[]
    },
  })
}

/** Atividades pendentes do usuário logado, com dados do lead — alimenta a aba de Alertas. */
export function useMyPendingActivities() {
  const { profile } = useAuth()
  useRealtimeInvalidate('my-activities-rt', ['activities'], [['activities']])

  return useQuery({
    queryKey: ['activities', 'mine-pending', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*, lead:leads(id,name,whatsapp)')
        .eq('created_by', profile!.id)
        .eq('done', false)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as unknown as ActivityWithLead[]
    },
  })
}

export interface CreateActivityInput {
  leadId: string
  type: ActivityType
  title?: string
  notes?: string
  dueAt?: string | null
}

export function useCreateActivity() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, type, title, notes, dueAt }: CreateActivityInput) => {
      const { error } = await supabase.from('activities').insert({
        lead_id: leadId,
        created_by: profile?.id ?? null,
        type,
        title: title || null,
        notes: notes || null,
        due_at: dueAt || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', v.leadId] })
    },
  })
}

export function useToggleActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('activities')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  })
}
