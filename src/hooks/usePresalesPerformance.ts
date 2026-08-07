import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { localDay } from './useManualMetrics'
import type { DateRange } from './useFunnelMetrics'
import type { ManualMetrics } from '@/types/database'

export interface SdrRow {
  profileId: string
  fullName: string
  leads: number
  qualificados: number
  agendamentos: number
  realizadas: number
  noShow: number
  vendas: number
  receita: number
}

export interface SocialRow extends SdrRow {
  ativacoes: number
  conversas: number
  ofertas: number
}

/**
 * Performance separada por canal: o SDR recebe leads, a Social Seller ativa contatos.
 *
 * Ofertas, Agendamentos, Realizadas, No-show, Vendas e Receita vêm SÓ do lançamento
 * manual (social_metrics) — o mesmo número que a pessoa vê em "Seu relatório do dia"
 * e que alimenta a meta dela. Antes este ranking somava kanban + manual nesses
 * campos, e o card mostrava dois números pra "agendamentos" na mesma tela: 40 no
 * funil (kanban+manual) e 22 na barra de meta logo abaixo (só manual, ver
 * useRealized). Por pedido do time: o funil do admin passa a refletir só o que foi
 * lançado no relatório, pra bater com a meta e com o que o vendedor vê ao abrir a
 * própria grade.
 *
 * "Leads" e "Qualificados" continuam vindo do kanban (mais o manual): não têm como
 * ser só manual — "Leads" não tem campo manual equivalente (é o lead que ENTROU,
 * não uma atividade que se lança à mão), e qualificação normalmente acontece direto
 * no card, não na grade.
 */
export function usePresalesPerformanceSplit(range: DateRange) {
  useRealtimeInvalidate('presales-split-rt', ['leads', 'social_metrics'], [['presales-split']])

  return useQuery({
    queryKey: ['presales-split', range],
    queryFn: async () => {
      const from = range.from
      const to = range.to

      const [{ data: profiles }, { data: leads }, { data: metrics }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('active', true),
        supabase.from('leads').select('owner_id, is_mql, created_at').gte('created_at', from).lte('created_at', to),
        supabase.from('social_metrics').select('*').gte('date', localDay(from)).lte('date', localDay(to)),
      ])

      const base = (p: { id: string; full_name: string }) => ({
        profileId: p.id,
        fullName: p.full_name,
        leads: 0,
        qualificados: 0,
        agendamentos: 0,
        realizadas: 0,
        noShow: 0,
        vendas: 0,
        receita: 0,
      })

      const sdr = new Map<string, SdrRow>()
      const social = new Map<string, SocialRow>()
      for (const p of profiles ?? []) {
        if (p.role === 'sdr') sdr.set(p.id, base(p))
        if (p.role === 'social_seller') social.set(p.id, { ...base(p), ativacoes: 0, conversas: 0, ofertas: 0 })
      }

      const row = (id?: string | null) => (id ? (sdr.get(id) ?? social.get(id)) : undefined)

      for (const l of leads ?? []) {
        const r = row(l.owner_id)
        if (!r) continue
        r.leads++
        if (l.is_mql) r.qualificados++
      }

      // Lançamento manual: o mesmo número que aparece em "Seu relatório do dia".
      for (const m of (metrics ?? []) as ManualMetrics[]) {
        const r = row(m.profile_id)
        if (!r) continue
        r.qualificados += m.mqls ?? 0
        r.agendamentos += m.agendamentos ?? 0
        r.realizadas += m.reunioes_realizadas ?? 0
        r.noShow += m.no_shows ?? 0
        r.vendas += m.vendas ?? 0
        r.receita += Number(m.faturamento ?? 0)

        const s = social.get(m.profile_id)
        if (s) {
          s.ativacoes += m.ativacoes ?? 0
          s.conversas += m.conversas ?? 0
          s.ofertas += m.ofertas ?? 0
        }
      }

      return {
        sdr: [...sdr.values()].sort((a, b) => b.agendamentos - a.agendamentos),
        social: [...social.values()].sort((a, b) => b.agendamentos - a.agendamentos),
      }
    },
  })
}
