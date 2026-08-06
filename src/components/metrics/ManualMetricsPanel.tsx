import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import {
  FIELDS_BY_ROLE,
  MANUAL_FIELD_LABELS,
  useMyManualMetrics,
  useSaveManualMetrics,
  type ManualField,
} from '@/hooks/useManualMetrics'
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

const HINT: Record<string, string> = {
  social_seller:
    'Ativações e conversas acontecem no Business Suite e não viram card. Lance aqui no fim do dia para fechar o funil do Social Selling.',
  sdr: 'Números que não passaram pelo kanban (qualificação por DM, agendamento fechado no WhatsApp). Somam ao que já veio dos cards.',
  closer:
    'Reuniões e no-shows que aconteceram sem card no kanban. Somam ao que já está registrado nas reuniões agendadas pela plataforma.',
  admin: 'Lançamento manual de qualquer etapa. Soma ao que veio dos cards — nunca substitui.',
}

/**
 * Lançamento manual dos números do dia.
 *
 * Os campos mudam por papel: o SDR e a social seller lançam topo de funil, o closer
 * lança fundo. Tudo aqui SOMA ao que é derivado do kanban, então lançar um número
 * que já tem card duplica — a tabela abaixo mostra o que o CRM já contou no dia
 * justamente para essa conferência.
 */
export function ManualMetricsPanel({ range }: { range: DateRange }) {
  const { profile } = useAuth()
  const { data } = useMyManualMetrics(range)
  const save = useSaveManualMetrics()

  const fields = FIELDS_BY_ROLE[profile?.role ?? 'sdr'] ?? FIELDS_BY_ROLE.sdr
  const [values, setValues] = useState<Partial<Record<ManualField, string>>>({})
  const [saved, setSaved] = useState(false)

  const hojeKey = format(new Date(), 'yyyy-MM-dd')
  // Data selecionada para lançar/editar (default hoje). Permite corrigir um dia passado.
  const [selectedKey, setSelectedKey] = useState(hojeKey)
  const selectedDate = parseISO(selectedKey)
  const selectedRow = data?.rows.find((r) => r.date === selectedKey)

  const allDays = useMemo(() => daysInRange(range), [range])
  const days = allDays.slice(0, MAX_ROWS)

  useEffect(() => {
    const next: Partial<Record<ManualField, string>> = {}
    for (const f of fields) {
      const v = selectedRow?.[f]
      next[f] = v ? String(v) : ''
    }
    setValues(next)
    // selectedRow muda de identidade a cada refetch; o que importa é a data e o conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, profile?.role, JSON.stringify(fields.map((f) => selectedRow?.[f]))])

  async function handleSave() {
    if (!isValid(selectedDate)) return
    const payload = Object.fromEntries(fields.map((f) => [f, Number(values[f] || 0)])) as Record<ManualField, number>
    await save.mutateAsync({ date: selectedDate, values: payload })
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
        {HINT[profile?.role ?? 'sdr']} Errou ou esqueceu um dia? Escolha a data (ou clique na linha
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
        {fields.map((f) => (
          <div key={f}>
            <p className="mb-1 text-xs text-white/50">{MANUAL_FIELD_LABELS[f]}</p>
            <Input
              type="number"
              min="0"
              className="w-32"
              value={values[f] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              placeholder="0"
            />
          </div>
        ))}
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
                  {fields.map((f) => (
                    <th key={f} className="py-2 pr-3 text-right font-medium">
                      {MANUAL_FIELD_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const row = data?.rows.find((r) => r.date === day)
                  const date = parseISO(day)
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
                        {row?.nota && (
                          <span className="ml-2 text-[11px] text-white/25" title={row.nota}>
                            ·
                          </span>
                        )}
                      </td>
                      {fields.map((f) => (
                        <td
                          key={f}
                          className={cn('py-2 pr-3 text-right', row ? 'text-white' : 'text-white/20')}
                        >
                          {row ? row[f] : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && fields.some((f) => data.totals[f] > 0) && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
          Total no período:{' '}
          {fields
            .filter((f) => data.totals[f] > 0)
            .map((f) => `${data.totals[f]} ${MANUAL_FIELD_LABELS[f].toLowerCase()}`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
