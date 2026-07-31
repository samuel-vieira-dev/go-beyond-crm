import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { LeadEvent, LeadWithRelations } from '@/types/database'
import type { LeadOrigin, LeadStage } from '@/types/domain'

export interface LeadFilters {
  stages?: LeadStage[]
  search?: string
  origin?: LeadOrigin
  isMql?: boolean
  dateFrom?: string
  dateTo?: string
  formTag?: string
  ownerId?: string
  closerId?: string
  unassignedOnly?: boolean
}

const LEAD_SELECT = '*, owner:profiles!leads_owner_id_fkey(id,full_name), closer:profiles!leads_closer_id_fkey(id,full_name)'

export function leadsQueryKey(filters: LeadFilters) {
  return ['leads', filters] as const
}

export function useLeads(filters: LeadFilters = {}) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: leadsQueryKey(filters),
    queryFn: async () => {
      let q = supabase.from('leads').select(LEAD_SELECT).order('created_at', { ascending: false })

      if (filters.stages && filters.stages.length > 0) q = q.in('stage', filters.stages)
      if (filters.origin) q = q.eq('origin', filters.origin)
      if (typeof filters.isMql === 'boolean') q = q.eq('is_mql', filters.isMql)
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
      if (filters.formTag) q = q.eq('form_tag', filters.formTag)
      if (filters.ownerId) q = q.eq('owner_id', filters.ownerId)
      if (filters.closerId) q = q.eq('closer_id', filters.closerId)
      if (filters.unassignedOnly) q = q.is('owner_id', null)
      if (filters.search) {
        const term = filters.search.trim()
        q = q.or(`name.ilike.%${term}%,whatsapp.ilike.%${term}%,email.ilike.%${term}%,instagram.ilike.%${term}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as unknown as LeadWithRelations[]
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

export function useLead(leadId: string | null) {
  return useQuery({
    queryKey: ['lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', leadId!).single()
      if (error) throw error
      return data as unknown as LeadWithRelations
    },
  })
}

export interface CreateLeadInput {
  name: string
  whatsapp: string | null
  email?: string | null
  instagram?: string | null
  profession?: string | null
  income_range?: string | null
  origin: LeadOrigin
  is_mql?: boolean
  stage?: LeadStage
  notes?: string | null
  owner_id?: string | null
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateLeadInput) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...input,
          owner_id: input.owner_id ?? profile?.id ?? null,
          stage: input.stage ?? 'novo_lead',
        })
        .select()
        .single()
      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: data.id,
        actor_id: profile?.id ?? null,
        type: 'created',
        to_stage: data.stage,
      })

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (leadId: string) => {
      // Remove vendas primeiro (não têm cascade); reuniões, eventos e atividades caem por cascade.
      await supabase.from('sales').delete().eq('lead_id', leadId)
      const { error } = await supabase.from('leads').delete().eq('id', leadId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CreateLeadInput> & Record<string, unknown>) => {
      const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.id] })
    },
  })
}

/** Muda a etapa do lead e registra o evento de auditoria. */
export function useChangeLeadStage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      leadId,
      fromStage,
      toStage,
      extra,
    }: {
      leadId: string
      fromStage: LeadStage
      toStage: LeadStage
      extra?: Record<string, unknown>
    }) => {
      const { error } = await supabase
        .from('leads')
        .update({ stage: toStage, ...extra })
        .eq('id', leadId)
      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'stage_change',
        from_stage: fromStage,
        to_stage: toStage,
      })
    },
    // Atualização otimista: move o card na hora, antes do round-trip.
    onMutate: async ({ leadId, toStage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] })
      const snapshots = queryClient.getQueriesData<LeadWithRelations[]>({ queryKey: ['leads'] })
      for (const [key, leads] of snapshots) {
        if (!leads) continue
        queryClient.setQueryData<LeadWithRelations[]>(
          key,
          leads.map((l) => (l.id === leadId ? { ...l, stage: toStage } : l)),
        )
      }
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots?.forEach(([key, leads]) => queryClient.setQueryData(key, leads))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

/** SDR/Social Seller assume um lead que chegou sem responsável (ex.: via webhook do quiz). */
export function useClaimLead() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error('Sem sessão')
      const { error } = await supabase.from('leads').update({ owner_id: profile.id }).eq('id', leadId)
      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile.id,
        type: 'claimed',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useAddLeadNote() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, note }: { leadId: string; note: string }) => {
      const { error } = await supabase.from('leads').update({ notes: note }).eq('id', leadId)
      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'note',
        payload: { note },
      })
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['lead-events', variables.leadId] })
    },
  })
}

export interface LeadEventWithActor extends LeadEvent {
  actor?: { id: string; full_name: string } | null
}

export function useLeadEvents(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-events', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_events')
        .select('*, actor:profiles(id,full_name)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as LeadEventWithActor[]
    },
  })
}
