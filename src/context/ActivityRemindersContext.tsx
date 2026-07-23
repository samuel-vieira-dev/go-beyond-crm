import { createContext, useContext, type ReactNode } from 'react'
import { isPast, parseISO } from 'date-fns'
import { useMyPendingActivities } from '@/hooks/useActivities'
import type { ActivityWithLead } from '@/types/database'

interface RemindersValue {
  /** lead_id -> próxima atividade pendente do usuário logado */
  byLead: Map<string, ActivityWithLead>
  pending: ActivityWithLead[]
  pendingCount: number
  overdueCount: number
}

const ActivityRemindersContext = createContext<RemindersValue>({
  byLead: new Map(),
  pending: [],
  pendingCount: 0,
  overdueCount: 0,
})

export function ActivityRemindersProvider({ children }: { children: ReactNode }) {
  const { data } = useMyPendingActivities()
  const pending = data ?? []

  const byLead = new Map<string, ActivityWithLead>()
  for (const a of pending) {
    if (!byLead.has(a.lead_id)) byLead.set(a.lead_id, a)
  }

  const overdueCount = pending.filter((a) => a.due_at && isPast(parseISO(a.due_at))).length

  return (
    <ActivityRemindersContext.Provider
      value={{ byLead, pending, pendingCount: pending.length, overdueCount }}
    >
      {children}
    </ActivityRemindersContext.Provider>
  )
}

export function useActivityReminders() {
  return useContext(ActivityRemindersContext)
}
