export type Role = 'admin' | 'sdr' | 'social_seller' | 'closer'

export type LeadOrigin = 'quiz' | 'clint' | 'instagram' | 'indicacao' | 'manual' | 'outro'

export type LeadStage =
  | 'novo_lead'
  | 'em_atendimento'
  | 'em_qualificacao'
  | 'oferta_reuniao'
  | 'follow_up_prevenda'
  | 'agendado'
  | 'reuniao_agendada'
  | 'reuniao_nao_realizada'
  | 'reuniao_realizada'
  | 'follow_up_fechamento'
  | 'venda_fechada'
  | 'perdido'

export type MeetingStatus = 'agendada' | 'realizada' | 'nao_compareceu' | 'remarcada' | 'cancelada'

export type LeadEventType =
  | 'created'
  | 'stage_change'
  | 'note'
  | 'meeting_booked'
  | 'meeting_outcome'
  | 'sale'
  | 'claimed'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Gestão',
  sdr: 'SDR',
  social_seller: 'Social Seller',
  closer: 'Closer',
}

export const STAGE_LABELS: Record<LeadStage, string> = {
  novo_lead: 'Novo Lead',
  em_atendimento: 'Em Atendimento',
  em_qualificacao: 'Em Qualificação',
  oferta_reuniao: 'Oferta de Reunião',
  follow_up_prevenda: 'Follow-up',
  agendado: 'Agendamento',
  reuniao_agendada: 'Reunião Agendada',
  reuniao_nao_realizada: 'Reunião Não Realizada',
  reuniao_realizada: 'Reunião Realizada',
  follow_up_fechamento: 'Follow-up de Fechamento',
  venda_fechada: 'Venda Fechada',
  perdido: 'Perdido',
}

export const ORIGIN_LABELS: Record<LeadOrigin, string> = {
  quiz: 'Quiz',
  clint: 'Clint',
  instagram: 'Instagram',
  indicacao: 'Indicação',
  manual: 'Manual',
  outro: 'Outro',
}

/** Colunas do pipeline de pré-venda do SDR, na ordem do kanban. */
export const SDR_STAGES: LeadStage[] = [
  'novo_lead',
  'em_atendimento',
  'em_qualificacao',
  'follow_up_prevenda',
  'agendado',
]

/** Colunas do pipeline de pré-venda do Social Seller, na ordem do kanban. */
export const SOCIAL_SELLER_STAGES: LeadStage[] = [
  'novo_lead',
  'em_qualificacao',
  'oferta_reuniao',
  'follow_up_prevenda',
  'agendado',
]

/** Colunas do pipeline do Closer, na ordem do kanban. */
export const CLOSER_STAGES: LeadStage[] = [
  'reuniao_agendada',
  'reuniao_nao_realizada',
  'reuniao_realizada',
  'follow_up_fechamento',
  'venda_fechada',
]

/** Funil unificado exibido na Gestão (pré-venda + closer + perdido). */
export const UNIFIED_STAGES: LeadStage[] = [
  'novo_lead',
  'em_atendimento',
  'em_qualificacao',
  'oferta_reuniao',
  'follow_up_prevenda',
  'agendado',
  'reuniao_agendada',
  'reuniao_nao_realizada',
  'reuniao_realizada',
  'follow_up_fechamento',
  'venda_fechada',
  'perdido',
]

/** Etapas em que o lead já foi entregue ao Closer (pré-venda concluída). */
export const HANDED_OFF_STAGES: LeadStage[] = [
  'reuniao_agendada',
  'reuniao_nao_realizada',
  'reuniao_realizada',
  'follow_up_fechamento',
  'venda_fechada',
]

/** Uma coluna do kanban: a etapa-alvo do drop (id) e quais etapas ela exibe. */
export interface BoardColumn {
  id: LeadStage
  title: string
  stages: LeadStage[]
}

/** Constrói colunas simples (uma etapa por coluna). */
export function simpleColumns(stages: LeadStage[]): BoardColumn[] {
  return stages.map((s) => ({ id: s, title: STAGE_LABELS[s], stages: [s] }))
}

/** A coluna "Agendamento" agrega todas as etapas de avanço pós-agendamento (menos No-Show),
 *  para o pré-vendedor acompanhar o que já entregou ao Closer sem perder o card de vista. */
export const AGENDAMENTO_STAGES: LeadStage[] = [
  'agendado',
  'reuniao_agendada',
  'reuniao_realizada',
  'follow_up_fechamento',
  'venda_fechada',
]

export const SDR_COLUMNS: BoardColumn[] = [
  { id: 'novo_lead', title: 'Novo Lead', stages: ['novo_lead'] },
  { id: 'em_atendimento', title: 'Em Atendimento', stages: ['em_atendimento'] },
  { id: 'em_qualificacao', title: 'Em Qualificação', stages: ['em_qualificacao'] },
  { id: 'follow_up_prevenda', title: 'Follow-up', stages: ['follow_up_prevenda'] },
  { id: 'agendado', title: 'Agendamento', stages: AGENDAMENTO_STAGES },
  { id: 'reuniao_nao_realizada', title: 'Reunião Não Realizada', stages: ['reuniao_nao_realizada'] },
]

/** A social seller trabalha Ativações e Conversas no Business Suite — no kanban
 *  entram só os leads que já receberam oferta de reunião. */
export const SOCIAL_SELLER_COLUMNS: BoardColumn[] = [
  { id: 'oferta_reuniao', title: 'Ofertas de Reunião', stages: ['oferta_reuniao', 'novo_lead', 'em_qualificacao'] },
  { id: 'follow_up_prevenda', title: 'Follow-up', stages: ['follow_up_prevenda'] },
  { id: 'agendado', title: 'Agendamento', stages: AGENDAMENTO_STAGES },
  { id: 'reuniao_nao_realizada', title: 'No-Show', stages: ['reuniao_nao_realizada'] },
]

/** Canais de venda (tag do lead) — usados no funil e no filtro por canal. */
export const CHANNEL_TAGS = ['Tráfego', 'Organico', 'Formulário - Alunos', 'Social Selling'] as const

export type StageAccent = 'green' | 'red' | 'none'

/** Cor de destaque do card por etapa (verde = agendado/vendido, vermelho = perdido/no-show). */
export function stageAccent(stage: LeadStage): StageAccent {
  if (stage === 'agendado' || stage === 'reuniao_agendada' || stage === 'venda_fechada') return 'green'
  if (stage === 'perdido' || stage === 'reuniao_nao_realizada') return 'red'
  return 'none'
}

export type ActivityType = 'ligacao' | 'email' | 'followup' | 'lembrete' | 'tarefa'

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ligacao: 'Ligação',
  email: 'E-mail',
  followup: 'Follow-up',
  lembrete: 'Lembrete',
  tarefa: 'Tarefa',
}

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  ligacao: '📞',
  email: '✉️',
  followup: '🔁',
  lembrete: '⏰',
  tarefa: '✅',
}

export const INCOME_RANGES = [
  { value: 'ate5', label: 'Até R$ 5 mil' },
  { value: '5a8', label: 'R$ 5 mil a R$ 8 mil' },
  { value: '8a10', label: 'R$ 8 mil a R$ 10 mil' },
  { value: 'acima10', label: 'Acima de R$ 10 mil' },
] as const

export const LOST_REASONS = [
  'Desqualificado',
  'Sumiu / sem resposta',
  'Sem interesse',
  'Sem orçamento',
  'Fechou com concorrente',
  'Outro',
] as const
