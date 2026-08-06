import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
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
  'follow_ups',
  'agendamentos',
  'reunioes_realizadas',
  'no_shows',
] as const

export type ManualField = (typeof MANUAL_FIELDS)[number]

export const MANUAL_FIELD_LABELS: Record<ManualField, string> = {
  ativacoes: 'Ativações',
  conversas: 'Conversas em condução',
  mqls: 'Qualificados (MQL)',
  ofertas: 'Ofertas de reunião',
  follow_ups: 'Follow-ups',
  agendamentos: 'Agendamentos',
  reunioes_realizadas: 'Reuniões realizadas',
  no_shows: 'No-shows',
}

/** Quem lança o quê: SDR e social seller trabalham topo de funil, closer o fundo. */
export const FIELDS_BY_ROLE: Record<string, ManualField[]> = {
  social_seller: ['ativacoes', 'conversas', 'mqls', 'ofertas', 'follow_ups', 'agendamentos'],
  sdr: ['mqls', 'ofertas', 'follow_ups', 'agendamentos'],
  closer: ['reunioes_realizadas', 'no_shows'],
  admin: [...MANUAL_FIELDS],
}

export type ManualTotals = Record<ManualField, number>

export function emptyTotals(): ManualTotals {
  return {
    ativacoes: 0,
    conversas: 0,
    mqls: 0,
    ofertas: 0,
    follow_ups: 0,
    agendamentos: 0,
    reunioes_realizadas: 0,
    no_shows: 0,
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
    .gte('date', range.from.slice(0, 10))
    .lte('date', range.to.slice(0, 10))
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
        .gte('date', range.from.slice(0, 10))
        .lte('date', range.to.slice(0, 10))
        .order('date', { ascending: false })
      if (error) throw error

      const rows = (data ?? []) as ManualMetrics[]
      const totals = rows.reduce((acc, r) => addRow(acc, r), emptyTotals())
      return { rows, totals }
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
      // Um lançamento manual muda ranking, funil e relatório ao mesmo tempo.
      for (const key of [
        ['manual-metrics'],
        ['presales-split'],
        ['team-performance'],
        ['daily-report'],
        ['funnel-metrics'],
      ]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
