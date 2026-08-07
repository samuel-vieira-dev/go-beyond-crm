import { useQuery } from '@tanstack/react-query'
import { endOfDay, parseISO, startOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useRealtimeInvalidate } from './useRealtime'
import { fetchManualByProfile } from './useManualMetrics'
import type { DateRange } from './useFunnelMetrics'
import type { GoalMetric } from '@/types/database'
import type { Role } from '@/types/domain'

/**
 * FONTE ÚNICA do "realizado" de uma pessoa num período.
 *
 * Existe porque cada tela calculava o mesmo número do seu jeito e elas divergiam:
 *   • "Minhas Metas" procurava o closer na lista de PRÉ-VENDA para agendamentos e
 *     reuniões realizadas — como closer não está lá, essas duas metas mostravam 0
 *     para sempre, enquanto o relatório do próprio closer mostrava os números certos;
 *   • o progresso era somado sobre o período do FILTRO da tela (mês, por padrão) e
 *     comparado com a meta de outro período — meta da semana media o mês inteiro;
 *   • o ranking da Gestão usava ainda outra conta, então admin e colaborador viam
 *     valores diferentes para a mesma meta.
 *
 * Agora meta, progresso e relatório diário leem daqui. Se um número precisar mudar,
 * muda em um lugar só e as três telas continuam batendo.
 *
 * REGRAS (as mesmas do relatório diário de cada papel):
 *
 * Pré-venda (SDR / Social Seller) — o crédito é de quem AGENDOU:
 *   agendamentos        meetings.booked_by = pessoa, contados pela data em que a
 *                       reunião foi MARCADA (created_at), não pela data dela;
 *   reuniões realizadas meetings.booked_by = pessoa, status 'realizada', pela data em
 *                       que a reunião ACONTECEU (scheduled_at);
 *   vendas/faturamento  vendas dos leads que essa pessoa agendou, por sold_at.
 *
 * Closer — o crédito é de quem ATENDEU:
 *   agendamentos        reuniões na agenda dele no período (scheduled_at);
 *   reuniões realizadas as mesmas, com status 'realizada';
 *   vendas/faturamento  sales.closer_id = pessoa, por sold_at.
 *
 * Em todos os casos SOMA o lançamento manual do período (social_metrics), que é o
 * que aconteceu fora do kanban. É justamente o número que o colaborador digita no
 * relatório diário — sem somá-lo, a meta ignora metade do trabalho dele.
 */
export type Realized = Record<GoalMetric, number>

function empty(): Realized {
  return { agendamentos: 0, reunioes_realizadas: 0, vendas: 0, faturamento: 0 }
}

/** Período de uma meta ("yyyy-MM-dd") como intervalo de instantes locais. */
export function goalPeriodRange(periodStart: string, periodEnd: string): DateRange {
  return {
    from: startOfDay(parseISO(periodStart)).toISOString(),
    to: endOfDay(parseISO(periodEnd)).toISOString(),
  }
}

export async function fetchRealized(profileId: string, role: Role, range: DateRange): Promise<Realized> {
  const out = empty()

  if (role === 'closer') {
    const [{ data: meetings, error: mErr }, { data: sales, error: sErr }] = await Promise.all([
      supabase
        .from('meetings')
        .select('status')
        .eq('closer_id', profileId)
        .gte('scheduled_at', range.from)
        .lte('scheduled_at', range.to),
      supabase
        .from('sales')
        .select('amount')
        .eq('closer_id', profileId)
        .gte('sold_at', range.from)
        .lte('sold_at', range.to),
    ])
    if (mErr) throw mErr
    if (sErr) throw sErr

    out.agendamentos = (meetings ?? []).length
    out.reunioes_realizadas = (meetings ?? []).filter((m) => m.status === 'realizada').length
    out.vendas = (sales ?? []).length
    out.faturamento = (sales ?? []).reduce((sum, s) => sum + Number(s.amount), 0)
  } else {
    // Todas as reuniões agendadas por essa pessoa: as marcadas no período contam como
    // agendamento, as que aconteceram no período contam como realizada. São recortes
    // por campos de data diferentes, por isso a mesma lista serve aos dois.
    const { data: meetings, error: mErr } = await supabase
      .from('meetings')
      .select('lead_id, status, created_at, scheduled_at')
      .eq('booked_by', profileId)
    if (mErr) throw mErr

    const all = meetings ?? []
    out.agendamentos = all.filter((m) => m.created_at >= range.from && m.created_at <= range.to).length
    out.reunioes_realizadas = all.filter(
      (m) => m.status === 'realizada' && m.scheduled_at >= range.from && m.scheduled_at <= range.to,
    ).length

    // A venda pode fechar semanas depois do agendamento: o vínculo é o lead, não a data.
    const leadIds = [...new Set(all.map((m) => m.lead_id).filter(Boolean))] as string[]
    if (leadIds.length > 0) {
      const { data: sales, error: sErr } = await supabase
        .from('sales')
        .select('amount')
        .in('lead_id', leadIds)
        .gte('sold_at', range.from)
        .lte('sold_at', range.to)
      if (sErr) throw sErr
      out.vendas = (sales ?? []).length
      out.faturamento = (sales ?? []).reduce((sum, s) => sum + Number(s.amount), 0)
    }
  }

  const { byProfile } = await fetchManualByProfile(range)
  const manual = byProfile.get(profileId)
  if (manual) {
    out.agendamentos += manual.agendamentos
    out.reunioes_realizadas += manual.reunioes_realizadas
    out.vendas += manual.vendas
    out.faturamento += manual.faturamento
  }

  return out
}

/**
 * Uma assinatura de realtime para a TELA inteira de metas.
 *
 * Fica separada de `useRealized` de propósito: uma página de ranking renderiza uma
 * dezena de metas, e assinar dentro do hook de dados abriria um canal do Supabase
 * por barra de progresso. Chame uma vez por página que mostre metas.
 */
export function useRealizedRealtime() {
  useRealtimeInvalidate('realizado-rt', ['meetings', 'sales', 'social_metrics'], [['realizado']])
}

/**
 * O realizado de uma pessoa num período.
 *
 * A chave inclui só profileId/role/range, então duas metas do mesmo período
 * compartilham uma única consulta — o caso comum é 3 ou 4 metas com o mesmo início e
 * fim.
 */
export function useRealized(profileId: string | null, role: Role | null, range: DateRange) {
  return useQuery({
    queryKey: ['realizado', profileId, role, range],
    enabled: !!profileId && !!role,
    queryFn: () => fetchRealized(profileId!, role!, range),
  })
}
