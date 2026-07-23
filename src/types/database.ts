import type { ActivityType, LeadEventType, LeadOrigin, LeadStage, MeetingStatus, Role } from './domain'

export interface Profile {
  id: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
}

export interface Lead {
  id: string
  name: string
  whatsapp: string
  email: string | null
  instagram: string | null
  profession: string | null
  income_range: string | null
  origin: LeadOrigin
  is_mql: boolean
  stage: LeadStage
  owner_id: string | null
  closer_id: string | null
  quiz_answers: Record<string, unknown> | null
  utm: Record<string, unknown> | null
  lost_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LeadWithRelations extends Lead {
  owner?: Pick<Profile, 'id' | 'full_name'> | null
  closer?: Pick<Profile, 'id' | 'full_name'> | null
  meetings?: Meeting[]
}

export interface Meeting {
  id: string
  lead_id: string
  closer_id: string
  booked_by: string
  scheduled_at: string
  status: MeetingStatus
  notes: string | null
  created_at: string
}

export interface MeetingWithLead extends Meeting {
  lead: Lead
  booked_by_profile?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Product {
  id: string
  name: string
  default_price: number
  active: boolean
}

export interface Sale {
  id: string
  lead_id: string
  meeting_id: string | null
  closer_id: string
  product_id: string
  amount: number
  sold_at: string
}

export interface SaleWithRelations extends Sale {
  product?: Pick<Product, 'id' | 'name'>
  lead?: Pick<Lead, 'id' | 'name'>
}

export type GoalMetric = 'agendamentos' | 'reunioes_realizadas' | 'vendas' | 'faturamento'

export interface Goal {
  id: string
  profile_id: string
  metric: GoalMetric
  target_reachable: number
  target_high: number
  target_super: number
  period_start: string
  period_end: string
}

export interface Activity {
  id: string
  lead_id: string
  created_by: string | null
  type: ActivityType
  title: string | null
  notes: string | null
  due_at: string | null
  done: boolean
  done_at: string | null
  created_at: string
}

export interface ActivityWithLead extends Activity {
  lead?: Pick<Lead, 'id' | 'name' | 'whatsapp'> | null
}

export interface LeadEvent {
  id: string
  lead_id: string
  actor_id: string | null
  type: LeadEventType
  from_stage: LeadStage | null
  to_stage: LeadStage | null
  payload: Record<string, unknown> | null
  created_at: string
}
