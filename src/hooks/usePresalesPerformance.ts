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
  emAtendimento: number
  followUps: number
  agendamentosDiretos: number
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
 * DE ONDE VEM CADA NÚMERO — a regra é: se o campo existe na grade "Seu relatório do
 * dia", ele vem SÓ de lá; se não existe, vem do kanban.
 *
 *   Só manual  Em atendimento, Follow-up, Agendamentos diretos, Agendamentos, Ofertas,
 *              Ativações, Conversas. São exatamente as colunas que a pessoa preenche,
 *              então o ranking mostra o mesmo número que ela vê — e o mesmo que a
 *              barra de meta logo abaixo, no mesmo card.
 *   Só kanban  Leads, Qualificados (leads.is_mql, a tag QUALIFICADO do card),
 *              Realizadas, No-show, Vendas, Receita. Nenhum destes tem coluna na
 *              grade da pré-venda: se fossem lidos do manual, ficariam zerados para
 *              sempre — foi o que aconteceu quando o ranking virou manual-only e a
 *              Carolina passou de 5 realizadas / 2 vendas para 0.
 *
 * "Agendamentos diretos" e "Agendamentos" ficam SEPARADOS aqui, a pedido da gestão
 * (ver de onde veio cada um). No funil geral do Dashboard e na meta eles somam.
 *
 * "Realizadas"/"No-show" contam por scheduled_at (o dia em que a reunião aconteceu);
 * as vendas são creditadas a quem agendou a reunião daquele lead.
 */
export function usePresalesPerformanceSplit(range: DateRange) {
  useRealtimeInvalidate(
    'presales-split-rt',
    ['leads', 'meetings', 'sales', 'social_metrics'],
    [['presales-split']],
  )

  return useQuery({
    queryKey: ['presales-split', range],
    queryFn: async () => {
      const from = range.from
      const to = range.to

      const [{ data: profiles }, { data: leads }, { data: allMeetings }, { data: sales }, { data: metrics }] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, role').eq('active', true),
          supabase.from('leads').select('owner_id, is_mql, created_at').gte('created_at', from).lte('created_at', to),
          supabase.from('meetings').select('booked_by, status, lead_id, scheduled_at'),
          supabase.from('sales').select('lead_id, amount, sold_at').gte('sold_at', from).lte('sold_at', to),
          supabase.from('social_metrics').select('*').gte('date', localDay(from)).lte('date', localDay(to)),
        ])

      const meetings = allMeetings ?? []
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
        emAtendimento: 0,
        followUps: 0,
        agendamentosDiretos: 0,
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

      // ── Kanban: leads recebidos e qualificados (a tag QUALIFICADO do card) ──
      for (const l of leads ?? []) {
        const r = row(l.owner_id)
        if (!r) continue
        r.leads++
        if (l.is_mql) r.qualificados++
      }

      // ── Kanban: o que a pré-venda entregou e virou reunião/venda ──
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

      // ── Manual: exatamente as colunas de "Seu relatório do dia" ──
      for (const m of (metrics ?? []) as ManualMetrics[]) {
        const r = row(m.profile_id)
        if (!r) continue
        r.emAtendimento += m.em_atendimento ?? 0
        r.followUps += m.follow_ups ?? 0
        r.agendamentosDiretos += m.agendamentos_diretos ?? 0
        r.agendamentos += m.agendamentos ?? 0

        const s = social.get(m.profile_id)
        if (s) {
          s.ativacoes += m.ativacoes ?? 0
          s.conversas += m.conversas ?? 0
          s.ofertas += m.ofertas ?? 0
        }
      }

      // Ordena pelo total de agendamentos (os dois tipos), como no funil geral.
      const totalAgendado = (r: SdrRow) => r.agendamentos + r.agendamentosDiretos
      return {
        sdr: [...sdr.values()].sort((a, b) => totalAgendado(b) - totalAgendado(a)),
        social: [...social.values()].sort((a, b) => totalAgendado(b) - totalAgendado(a)),
      }
    },
  })
}
