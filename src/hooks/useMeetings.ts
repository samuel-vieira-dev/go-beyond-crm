import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { MeetingWithLead } from '@/types/database'

const MEETING_SELECT = '*, lead:leads(*), booked_by_profile:profiles!meetings_booked_by_fkey(id,full_name)'

/** Impede overbooking: garante que o closer não tem outra reunião agendada no mesmo horário. */
async function assertSlotFree(closerId: string, scheduledAt: string, ignoreMeetingId?: string) {
  let q = supabase
    .from('meetings')
    .select('id')
    .eq('closer_id', closerId)
    .eq('scheduled_at', scheduledAt)
    .eq('status', 'agendada')
  if (ignoreMeetingId) q = q.neq('id', ignoreMeetingId)
  const { data, error } = await q
  if (error) throw error
  if (data && data.length > 0) {
    throw new Error('Este horário acabou de ser ocupado. Escolha outro slot.')
  }
}

export function useMeetingsForCloser(closerId: string | null, range?: { from: string; to: string }) {
  return useQuery({
    queryKey: ['meetings', 'closer', closerId, range],
    enabled: !!closerId,
    queryFn: async () => {
      let q = supabase
        .from('meetings')
        .select(MEETING_SELECT)
        .eq('closer_id', closerId!)
        .order('scheduled_at', { ascending: true })

      if (range) q = q.gte('scheduled_at', range.from).lte('scheduled_at', range.to)

      const { data, error } = await q
      if (error) throw error
      return data as unknown as MeetingWithLead[]
    },
  })
}

/**
 * Troca o closer responsável pelo lead. Se houver reunião em aberto, ela é
 * transferida junto (senão continuaria na agenda do closer antigo).
 */
export function useReassignCloser() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ leadId, closerId }: { leadId: string; closerId: string | null }) => {
      const { error: leadError } = await supabase
        .from('leads')
        .update({ closer_id: closerId })
        .eq('id', leadId)
      if (leadError) throw leadError

      let movedMeeting = false
      if (closerId) {
        const { data: open } = await supabase
          .from('meetings')
          .select('id, scheduled_at')
          .eq('lead_id', leadId)
          .eq('status', 'agendada')
          .order('scheduled_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (open) {
          // Não transfere para um horário em que o novo closer já tem reunião.
          const { data: conflict } = await supabase
            .from('meetings')
            .select('id')
            .eq('closer_id', closerId)
            .eq('scheduled_at', open.scheduled_at)
            .eq('status', 'agendada')
            .neq('id', open.id)
            .limit(1)
          if (conflict && conflict.length > 0) {
            throw new Error(
              'O novo closer já tem uma reunião nesse horário. Reagende antes de transferir.',
            )
          }

          const { error: meetingError } = await supabase
            .from('meetings')
            .update({ closer_id: closerId })
            .eq('id', open.id)
          if (meetingError) throw meetingError
          movedMeeting = true
        }
      }

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'note',
        payload: { note: movedMeeting ? 'Closer alterado (reunião transferida)' : 'Closer alterado' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

/** Última reunião registrada para o lead, de qualquer status — usada para reagendar e para corrigir resultado. */
export function useLatestMeetingForLead(leadId: string | null) {
  return useQuery({
    queryKey: ['meetings', 'latest-for-lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId!)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useMeetingsRealtime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('meetings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}

/** SDR/Social Seller/Admin agenda a reunião: cria o meeting e move o lead pro pipeline do closer. */
export function useScheduleMeeting() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      leadId,
      closerId,
      scheduledAt,
    }: {
      leadId: string
      closerId: string
      scheduledAt: string
    }) => {
      await assertSlotFree(closerId, scheduledAt)

      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          lead_id: leadId,
          closer_id: closerId,
          booked_by: profile?.id ?? null,
          scheduled_at: scheduledAt,
          status: 'agendada',
        })
        .select()
        .single()
      if (meetingError) throw meetingError

      const { error: leadError } = await supabase
        .from('leads')
        .update({ stage: 'reuniao_agendada', closer_id: closerId })
        .eq('id', leadId)
      if (leadError) throw leadError

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'meeting_booked',
        to_stage: 'reuniao_agendada',
        payload: { meeting_id: meeting.id, scheduled_at: scheduledAt, closer_id: closerId },
      })

      return meeting
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

interface MeetingOutcomeInput {
  meetingId: string
  leadId: string
  attended: boolean
}

/** Registra se o lead compareceu à reunião. */
export function useSetMeetingAttendance() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ meetingId, leadId, attended }: MeetingOutcomeInput) => {
      const newStage = attended ? 'reuniao_realizada' : 'reuniao_nao_realizada'
      const meetingStatus = attended ? 'realizada' : 'nao_compareceu'

      const { error: meetingError } = await supabase
        .from('meetings')
        .update({ status: meetingStatus })
        .eq('id', meetingId)
      if (meetingError) throw meetingError

      const { error: leadError } = await supabase.from('leads').update({ stage: newStage }).eq('id', leadId)
      if (leadError) throw leadError

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'meeting_outcome',
        to_stage: newStage,
        payload: { attended },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

/** Reagenda: fecha a reunião antiga e cria uma nova, sem perder histórico. */
export function useRescheduleMeeting() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      oldMeetingId,
      leadId,
      closerId,
      scheduledAt,
    }: {
      oldMeetingId: string
      leadId: string
      closerId: string
      scheduledAt: string
    }) => {
      await assertSlotFree(closerId, scheduledAt, oldMeetingId)

      await supabase.from('meetings').update({ status: 'remarcada' }).eq('id', oldMeetingId)

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          lead_id: leadId,
          closer_id: closerId,
          booked_by: profile?.id ?? null,
          scheduled_at: scheduledAt,
          status: 'agendada',
        })
        .select()
        .single()
      if (error) throw error

      await supabase.from('leads').update({ stage: 'reuniao_agendada' }).eq('id', leadId)

      await supabase.from('lead_events').insert({
        lead_id: leadId,
        actor_id: profile?.id ?? null,
        type: 'meeting_booked',
        to_stage: 'reuniao_agendada',
        payload: { meeting_id: meeting.id, scheduled_at: scheduledAt, rescheduled_from: oldMeetingId },
      })

      return meeting
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}
