import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { usePresalesDailyReport } from '@/hooks/useDailyReport'
import { useMySocialMetrics, useSaveSocialMetrics } from '@/hooks/useSocialMetrics'
import { cn } from '@/lib/cn'
import type { DateRange } from '@/hooks/useFunnelMetrics'

/** Teto de linhas da tabela por dia — períodos longos mostram só os dias mais recentes. */
const MAX_ROWS = 10

/** Dias do período, do mais recente para o mais antigo. Nunca lista dia futuro. */
function daysInRange(range: DateRange): string[] {
  const from = parseISO(range.from)
  const rawTo = parseISO(range.to)
  if (!isValid(from) || !isValid(rawTo)) return []
  // "Este mês" vai até o fim do mês; sem isto a tabela abriria em 31/08 zerado.
  const hoje = new Date()
  const to = rawTo > hoje ? hoje : rawTo
  const total = differenceInCalendarDays(to, from)
  if (total < 0) return []
  const days: string[] = []
  for (let i = total; i >= 0; i--) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    days.push(format(d, 'yyyy-MM-dd'))
  }
  return days
}

/**
 * Ativações e Conversas em condução acontecem no Business Suite e não viram card.
 * A social seller lança os números do dia aqui para fechar o funil do canal.
 */
export function SocialMetricsPanel({ range }: { range: DateRange }) {
  const { profile } = useAuth()
  const { data } = useMySocialMetrics(range)
  // Mesmo queryKey do relatório: o React Query reaproveita o cache, não refaz a chamada.
  const { data: report } = usePresalesDailyReport(profile?.id ?? null, range)
  const save = useSaveSocialMetrics()
  const [ativacoes, setAtivacoes] = useState('')
  const [conversas, setConversas] = useState('')
  const [saved, setSaved] = useState(false)

  const hojeKey = format(new Date(), 'yyyy-MM-dd')
  // Data selecionada para lançar/editar (default hoje). Permite corrigir um dia passado.
  const [selectedKey, setSelectedKey] = useState(hojeKey)
  const selectedDate = parseISO(selectedKey)
  const selectedRow = data?.rows.find((r) => r.date === selectedKey)

  const allDays = useMemo(() => daysInRange(range), [range])
  const days = allDays.slice(0, MAX_ROWS)

  useEffect(() => {
    setAtivacoes(String(selectedRow?.ativacoes ?? ''))
    setConversas(String(selectedRow?.conversas ?? ''))
  }, [selectedKey, selectedRow?.ativacoes, selectedRow?.conversas])

  async function handleSave() {
    if (!isValid(selectedDate)) return
    await save.mutateAsync({
      date: selectedDate,
      ativacoes: Number(ativacoes || 0),
      conversas: Number(conversas || 0),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">
          Lançar números —{' '}
          {isValid(selectedDate) ? format(selectedDate, "d 'de' MMMM", { locale: ptBR }) : '—'}
          {selectedKey === hojeKey && ' (hoje)'}
        </h2>
        {saved && <span className="text-xs text-success">✓ salvo</span>}
      </div>
      <p className="mb-3 text-xs text-white/40">
        Ativações e Conversas acontecem no Business Suite. Lance aqui no fim do dia para fechar o
        funil do Social Selling. Errou ou esqueceu um dia? Escolha a data (ou clique na linha
        abaixo) e salve por cima.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs text-white/50">Data</p>
          <Input
            type="date"
            className="w-40"
            max={hojeKey}
            value={selectedKey}
            // Chrome dispara onChange com valor vazio enquanto a data está incompleta;
            // aceitar isso quebrava o format() e derrubava a tela inteira.
            onChange={(e) => e.target.value && setSelectedKey(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-white/50">Ativações</p>
          <Input
            type="number"
            min="0"
            className="w-32"
            value={ativacoes}
            onChange={(e) => setAtivacoes(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-white/50">Conversas em condução</p>
          <Input
            type="number"
            min="0"
            className="w-32"
            value={conversas}
            onChange={(e) => setConversas(e.target.value)}
            placeholder="0"
          />
        </div>
        <Button onClick={handleSave} disabled={save.isPending || !isValid(selectedDate)}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {days.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold text-white/60">Dia a dia do período</h3>
            {allDays.length > days.length && (
              <span className="text-[11px] text-white/30">
                mostrando os {days.length} dias mais recentes de {allDays.length}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] text-white/40">
                  <th className="py-2 pr-3 font-medium">Dia</th>
                  <th className="py-2 pr-3 text-right font-medium">Ativações</th>
                  <th className="py-2 pr-3 text-right font-medium">Conversas</th>
                  <th className="py-2 pr-3 text-right font-medium">Novos leads</th>
                  <th className="py-2 text-right font-medium">Reuniões</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const metrics = data?.rows.find((r) => r.date === day)
                  const dayReport = report?.byDay[day]
                  const date = parseISO(day)
                  const empty = !metrics && !dayReport
                  return (
                    <tr
                      key={day}
                      onClick={() => setSelectedKey(day)}
                      title="Clique para lançar ou corrigir este dia"
                      className={cn(
                        'cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.04]',
                        selectedKey === day && 'bg-gold-500/10',
                      )}
                    >
                      <td className="py-2 pr-3">
                        <span className="text-white capitalize">
                          {format(date, "EEE, d 'de' MMM", { locale: ptBR })}
                        </span>
                        {day === hojeKey && <span className="ml-1 text-[11px] text-gold-400">hoje</span>}
                      </td>
                      <td className={cn('py-2 pr-3 text-right', empty ? 'text-white/20' : 'text-white')}>
                        {metrics?.ativacoes ?? '—'}
                      </td>
                      <td className={cn('py-2 pr-3 text-right', empty ? 'text-white/20' : 'text-white')}>
                        {metrics?.conversas ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right text-white/70">{dayReport?.newLeads ?? 0}</td>
                      <td className="py-2 text-right text-white/70">{dayReport?.meetingsBooked ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (data.ativacoes > 0 || data.conversas > 0) && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
          Total no período: <span className="text-white">{data.ativacoes}</span> ativações ·{' '}
          <span className="text-white">{data.conversas}</span> conversas em condução
        </p>
      )}
    </div>
  )
}
