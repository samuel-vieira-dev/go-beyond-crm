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
  whatsapp: string | null
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
  form_tag: string | null
  approach_type: string | null
  /**
   * Lead descartado. Independente de `stage`: a etapa fica preservada para dizer
   * ONDE a perda aconteceu, e o kanban esconde o card em vez de movê-lo.
   */
  is_lost: boolean
  lost_at: string | null
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
  /**
   * Vem null quando o lead não é visível para quem consultou (RLS) — acontece
   * quando o lead é transferido para outro closer mas a reunião antiga continua
   * na agenda do closer original. Sempre checar antes de ler campos.
   */
  lead: Lead | null
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

/**
 * Números lançados à mão, por pessoa e por dia. Existe porque agendamento, reunião
 * e no-show só nascem de um card no kanban — e boa parte da operação acontece fora
 * dele (Business Suite, WhatsApp, período anterior à adoção do CRM). SOMA ao que
 * vem de leads/meetings/sales; nunca substitui.
 *
 * A tabela se chama social_metrics por histórico: nasceu só para a social seller.
 */
export interface ManualMetrics {
  id: string
  profile_id: string
  date: string
  ativacoes: number
  conversas: number
  mqls: number
  ofertas: number
  follow_ups: number
  agendamentos: number
  reunioes_realizadas: number
  no_shows: number
  vendas: number
  /** Valor negociado no dia, não o preço de tabela do produto. */
  faturamento: number
  nota: string | null
  updated_at: string
}

/** Venda fechada sem card no kanban. Espelha Sale, menos o lead_id. */
export interface ManualSale {
  id: string
  closer_id: string
  sold_on: string
  product_id: string | null
  product_name: string | null
  channel: string | null
  amount: number
  nota: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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
