import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { ManualMetrics } from '@/types/database'
import type { DateRange } from './useFunnelMetrics'

/**
 * Camada de lançamento manual: o que aconteceu fora do kanban.
 *
 * Todo número aqui SOMA ao equivalente derivado de leads/meetings/sales — um dia
 * pode ter 3 agendamentos com card e 2 lançados à mão, e o relatório mostra 5.
 * Por isso os campos zerados são inofensivos: não escondem nem substituem nada.
 *
 * A tabela ainda se chama social_metrics (nome histórico, de quando só a social
 * seller lançava ativações). Renomear derrubaria o deploy no ar, então fica.
 */
export const MANUAL_METRICS_TABLE = 'social_metrics'

/** Campos numéricos, na ordem em que fazem sentido para quem preenche. */
export const MANUAL_FIELDS = [
  'ativacoes',
  'conversas',
  'mqls',
  'ofertas',
  'em_atendimento',
  'follow_ups',
  'agendamentos_diretos',
  'agendamentos',
  'reunioes_realizadas',
  'no_shows',
  'vendas',
  'faturamento',
] as const

export type ManualField = (typeof MANUAL_FIELDS)[number]

/** Rótulo curto: é cabeçalho de coluna numa grade apertada, não legenda de formulário. */
export const MANUAL_FIELD_LABELS: Record<ManualField, string> = {
  ativacoes: 'Ativações',
  conversas: 'Conversas',
  mqls: 'Qualificados',
  ofertas: 'Ofertas',
  em_atendimento: 'Em atendimento',
  follow_ups: 'Follow-up',
  agendamentos_diretos: 'Agend. diretos',
  agendamentos: 'Agendamentos',
  reunioes_realizadas: 'Realizadas',
  no_shows: 'No-shows',
  vendas: 'Vendas',
  faturamento: 'Faturamento',
}

/** Explicação que aparece ao passar o mouse no cabeçalho — some a dúvida sem poluir. */
export const MANUAL_FIELD_HINTS: Record<ManualField, string> = {
  ativacoes: 'Contatos abordados no dia',
  conversas: 'Conversas em condução',
  mqls: 'Leads qualificados (MQL)',
  ofertas: 'Ofertas de reunião feitas',
  em_atendimento: 'Leads que você colocou em atendimento no dia',
  follow_ups: 'Follow-ups realizados',
  agendamentos_diretos: 'Reunião marcada direto, sem passar pela qualificação',
  agendamentos: 'Reuniões marcadas',
  reunioes_realizadas: 'Reuniões que aconteceram',
  no_shows: 'Lead não compareceu',
  vendas: 'Vendas fechadas',
  faturamento: 'Valor negociado, não o preço de tabela',
}

/** Faturamento é dinheiro: formata e edita diferente do resto, que é contagem. */
export const MONEY_FIELDS: ManualField[] = ['faturamento']

/** Quem lança o quê: pré-venda preenche o topo do funil, closer o fundo. */
export const FIELDS_BY_ROLE: Record<string, ManualField[]> = {
  social_seller: ['ativacoes', 'conversas', 'mqls', 'ofertas', 'follow_ups', 'agendamentos'],
  // A SDR não lança mais "Qualificados" à mão: agora ele é coluna read-only vinda do
  // kanban (ver DERIVED_BY_ROLE). "Ofertas" saiu junto — não estava no fluxo dela.
  sdr: ['agendamentos_diretos', 'em_atendimento', 'follow_ups', 'agendamentos'],
  closer: ['agendamentos', 'reunioes_realizadas', 'no_shows', 'vendas', 'faturamento'],
  admin: [...MANUAL_FIELDS],
}

/**
 * Colunas READ-ONLY da grade: contadas do kanban na hora, não digitadas nem gravadas.
 *
 * Não viram coluna em social_metrics de propósito. Gravar uma cópia criaria uma
 * segunda verdade que envelhece sozinha — qualificar um lead depois deixaria o número
 * salvo desatualizado, e ninguém teria como saber qual dos dois está certo.
 */
export const DERIVED_FIELDS = ['leads_recebidos', 'leads_qualificados'] as const

export type DerivedField = (typeof DERIVED_FIELDS)[number]

export const DERIVED_FIELD_LABELS: Record<DerivedField, string> = {
  leads_recebidos: 'Leads recebidos',
  leads_qualificados: 'Leads qualificados',
}

export const DERIVED_FIELD_HINTS: Record<DerivedField, string> = {
  leads_recebidos: 'Leads que entraram para você no dia — vem do kanban, não editável',
  leads_qualificados: 'Destes, os que estão marcados como QUALIFICADO no kanban — não editável',
}

/** Quem vê colunas derivadas na grade. Hoje só a SDR pediu. */
export const DERIVED_BY_ROLE: Record<string, DerivedField[]> = {
  sdr: ['leads_recebidos', 'leads_qualificados'],
}

/**
 * Dia LOCAL de um instante ISO — a chave da tabela manual é um `date`, não timestamp.
 *
 * Não dá para fatiar a string: `range.to` é o fim do dia local, que em UTC-3 vira
 * 02:59 do dia SEGUINTE. `slice(0, 10)` devolvia essa data e o período somava um dia
 * a mais de lançamentos — o total da meta ficava maior que a soma das linhas que a
 * pessoa vê na grade do relatório, que sempre foi montada em dia local.
 */
export function localDay(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

export type ManualTotals = Record<ManualField, number>

export function emptyTotals(): ManualTotals {
  return {
    ativacoes: 0,
    conversas: 0,
    mqls: 0,
    ofertas: 0,
    em_atendimento: 0,
    follow_ups: 0,
    agendamentos_diretos: 0,
    agendamentos: 0,
    reunioes_realizadas: 0,
    no_shows: 0,
    vendas: 0,
    faturamento: 0,
  }
}

/** Soma as linhas de um período no acumulado de um profile. */
export function addRow(totals: ManualTotals, row: Partial<ManualMetrics>): ManualTotals {
  for (const f of MANUAL_FIELDS) totals[f] += Number(row[f] ?? 0)
  return totals
}

/**
 * Busca as linhas manuais de um período, já indexadas por profile_id.
 * Usada pelos hooks de relatório para somar sem refazer a consulta em cada um.
 */
export async function fetchManualByProfile(range: DateRange) {
  const { data, error } = await supabase
    .from(MANUAL_METRICS_TABLE)
    .select('*')
    .gte('date', localDay(range.from))
    .lte('date', localDay(range.to))
  if (error) throw error

  const byProfile = new Map<string, ManualTotals>()
  for (const row of (data ?? []) as ManualMetrics[]) {
    const totals = byProfile.get(row.profile_id) ?? emptyTotals()
    byProfile.set(row.profile_id, addRow(totals, row))
  }
  return { rows: (data ?? []) as ManualMetrics[], byProfile }
}

/** Os lançamentos do próprio usuário no período. */
export function useMyManualMetrics(range: DateRange) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['manual-metrics', profile?.id, range],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(MANUAL_METRICS_TABLE)
        .select('*')
        .eq('profile_id', profile!.id)
        .gte('date', localDay(range.from))
        .lte('date', localDay(range.to))
        .order('date', { ascending: false })
      if (error) throw error

      const rows = (data ?? []) as ManualMetrics[]
      const totals = rows.reduce((acc, r) => addRow(acc, r), emptyTotals())
      return { rows, totals }
    },
  })
}

/** Queries que um lançamento manual invalida: ranking, funil e relatório ao mesmo tempo. */
const AFFECTED_KEYS = [
  ['manual-metrics'],
  ['presales-split'],
  ['team-performance'],
  ['daily-report'],
  ['funnel-metrics'],
  ['channel-sales'],
  // Sem isto, o número lançado na grade só chegava na aba de metas no próximo reload.
  ['realizado'],
]

/**
 * Salva UM campo de UM dia — o que a grade editável precisa.
 *
 * O upsert só manda a coluna alterada: se a linha do dia ainda não existe ela nasce
 * com o resto zerado, e se já existe nenhum outro número é tocado. Sem isso, dois
 * campos salvos em sequência sobrescreveriam um ao outro.
 */
export function useSaveManualField() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      date,
      field,
      value,
      profileId,
    }: {
      /** "yyyy-MM-dd" — a grade já trabalha em dia local. */
      date: string
      field: ManualField
      value: number
      profileId?: string
    }) => {
      const { error } = await supabase.from(MANUAL_METRICS_TABLE).upsert(
        {
          profile_id: profileId ?? profile!.id,
          date,
          [field]: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,date' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useSaveManualMetrics() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      date,
      profileId,
      values,
      nota,
    }: {
      date: Date
      /** Só o admin lança pelos outros; o padrão é o próprio usuário. */
      profileId?: string
      values: Partial<Record<ManualField, number>>
      nota?: string | null
    }) => {
      const { error } = await supabase.from(MANUAL_METRICS_TABLE).upsert(
        {
          profile_id: profileId ?? profile!.id,
          date: format(date, 'yyyy-MM-dd'),
          ...values,
          ...(nota !== undefined ? { nota } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,date' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
