import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
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
 * "Agendamentos" conta pela data em que a reunião foi MARCADA (meetings.created_at),
 * não pela data em que ela vai acontecer (scheduled_at) — é a mesma definição do
 * funil do Admin (useFunnelMetrics) e do relatório do próprio pré-vendedor
 * (usePresalesDailyReport). Contar por scheduled_at fazia o número deste ranking
 * divergir MUITO do que o pré-vendedor via no relatório dele: alguém que marca hoje
 * uma reunião pra semana que vem soma no relatório dele hoje, mas só apareceria
 * aqui na semana que vem — o vendedor via 26 agendamentos e o admin via 6.
 *
 * "Realizadas"/"No-show" continuam por scheduled_at: o resultado pertence ao dia em
 * que a reunião de fato aconteceu, não ao dia em que foi marcada.
 */
export function usePresalesPerformanceSplit(range: DateRange) {
  useRealtimeInvalidate('presales-split-rt', ['leads', 'meetings', 'sales', 'social_metrics'], [['presales-split']])

  return useQuery({
    queryKey: ['presales-split', range],
    queryFn: async () => {
      const from = range.from
      const to = range.to

      const [{ data: profiles }, { data: leads }, { data: allMeetings }, { data: sales }, { data: metrics }] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, role').eq('active', true),
          supabase.from('leads').select('owner_id, is_mql, stage, created_at').gte('created_at', from).lte('created_at', to),
          // Tabela pequena: mais simples e mais correto buscar tudo e separar em JS
          // por dois campos de data diferentes do que arriscar duas queries divergirem.
          supabase.from('meetings').select('booked_by, closer_id, status, lead_id, scheduled_at, created_at'),
          supabase.from('sales').select('lead_id, amount, sold_at').gte('sold_at', from).lte('sold_at', to),
          supabase.from('social_metrics').select('*').gte('date', from.slice(0, 10)).lte('date', to.slice(0, 10)),
        ])

      const meetings = allMeetings ?? []
      const bookedInRange = meetings.filter((m) => m.created_at >= from && m.created_at <= to)
      const heldInRange = meetings.filter((m) => m.scheduled_at >= from && m.scheduled_at <= to)

      // Quem agendou a reunião do lead → a venda é creditada a essa pessoa, mesmo que
      // o agendamento tenha sido marcado fora do período (a venda pode fechar semanas
      // depois da reunião ter sido agendada).
      const bookerByLead = new Map<string, string>()
      for (const m of meetings) if (m.lead_id && m.booked_by) bookerByLead.set(m.lead_id, m.booked_by)

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
        const s = social.get(l.owner_id!)
        if (s && ['oferta_reuniao', 'follow_up_prevenda', 'agendado', 'reuniao_agendada', 'reuniao_realizada', 'follow_up_fechamento', 'venda_fechada'].includes(l.stage)) {
          s.ofertas++
        }
      }

      for (const m of bookedInRange) {
        const r = row(m.booked_by)
        if (r) r.agendamentos++
      }

      for (const m of heldInRange) {
        const r = row(m.booked_by)
        if (!r) continue
        if (m.status === 'realizada') r.realizadas++
        if (m.status === 'nao_compareceu') r.noShow++
      }

      for (const sale of sales ?? []) {
        const r = row(bookerByLead.get(sale.lead_id))
        if (!r) continue
        r.vendas++
        r.receita += Number(sale.amount)
      }

      // Lançamento manual: o que aconteceu fora do kanban (Business Suite, WhatsApp,
      // ou período anterior à adoção do CRM). SOMA ao que veio dos cards — quem
      // trabalha nos dois lugares aparece com o total, não com metade.
      for (const m of (metrics ?? []) as ManualMetrics[]) {
        const r = row(m.profile_id)
        if (!r) continue
        r.qualificados += m.mqls ?? 0
        r.agendamentos += m.agendamentos ?? 0
        r.realizadas += m.reunioes_realizadas ?? 0
        r.noShow += m.no_shows ?? 0

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
