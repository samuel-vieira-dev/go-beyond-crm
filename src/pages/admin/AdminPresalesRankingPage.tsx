import { useState } from 'react'
import { endOfMonth, startOfMonth } from 'date-fns'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { GoalProgress } from '@/components/ui/GoalProgress'
import { usePresalesPerformanceSplit, type SdrRow, type SocialRow } from '@/hooks/usePresalesPerformance'
import { useGoals } from '@/hooks/useGoals'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import type { Goal } from '@/types/database'
import { cn } from '@/lib/cn'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '—')

export function AdminPresalesRankingPage() {
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()).toISOString(),
    to: endOfMonth(new Date()).toISOString(),
  })
  const { data, isLoading } = usePresalesPerformanceSplit(range)
  const { data: goals } = useGoals({ activeOn: range.from.slice(0, 10) })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Performance Pré-vendas</h1>
          <p className="text-sm text-white/40">
            Cada canal medido pelo funil que ele realmente controla
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} defaultPreset="month" />
          <RefreshButton />
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-white/40">Carregando...</p>
      ) : (
        <>
          <Section
            title="SDR"
            subtitle="Leads recebidos → qualificados → agendamentos → reuniões → vendas"
            empty="Nenhum SDR ativo."
            rows={data.sdr}
            goals={goals}
            steps={(r) => [
              { label: 'Leads', value: r.leads },
              { label: 'Qualificados', value: r.qualificados, rate: pct(r.qualificados, r.leads) },
              { label: 'Agendamentos', value: r.agendamentos, rate: pct(r.agendamentos, r.qualificados) },
              { label: 'Realizadas', value: r.realizadas, rate: pct(r.realizadas, r.agendamentos) },
              { label: 'Vendas', value: r.vendas, rate: pct(r.vendas, r.realizadas) },
            ]}
          />

          <Section
            title="Social Seller"
            subtitle="Ativações → conversas → ofertas → agendamentos → reuniões → vendas"
            empty="Nenhuma social seller ativa."
            rows={data.social}
            goals={goals}
            steps={(r) => {
              const s = r as SocialRow
              return [
                { label: 'Ativações', value: s.ativacoes },
                { label: 'Conversas', value: s.conversas, rate: pct(s.conversas, s.ativacoes) },
                { label: 'Ofertas', value: s.ofertas, rate: pct(s.ofertas, s.conversas) },
                { label: 'Agendamentos', value: s.agendamentos, rate: pct(s.agendamentos, s.ofertas) },
                { label: 'Realizadas', value: s.realizadas, rate: pct(s.realizadas, s.agendamentos) },
                { label: 'Vendas', value: s.vendas, rate: pct(s.vendas, s.realizadas) },
              ]
            }}
          />
        </>
      )}
    </div>
  )
}

function Section({
  title,
  subtitle,
  empty,
  rows,
  goals,
  steps,
}: {
  title: string
  subtitle: string
  empty: string
  rows: SdrRow[]
  goals?: Goal[]
  steps: (r: SdrRow) => { label: string; value: number; rate?: string }[]
}) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-white/35">{subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <p className="card-surface rounded-xl p-4 text-sm text-white/30">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, idx) => {
            const goal = goals?.find((g) => g.profile_id === r.profileId && g.metric === 'agendamentos')
            const funnel = steps(r)
            return (
              <div key={r.profileId} className="card-surface rounded-xl p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-400">
                      {idx + 1}
                    </span>
                    <p className="font-semibold text-white">{r.fullName}</p>
                  </div>
                  <div className="flex gap-4 text-right text-xs">
                    <div>
                      <p className="text-white/40">Comparecimento</p>
                      <p className="text-sm font-semibold text-white">
                        {pct(r.realizadas, r.realizadas + r.noShow)}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/40">No-show</p>
                      <p className="text-sm font-semibold text-white">
                        {pct(r.noShow, r.realizadas + r.noShow)}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/40">Receita gerada</p>
                      <p className="text-sm font-semibold text-gold-400">{currency.format(r.receita)}</p>
                    </div>
                  </div>
                </div>

                {/* Funil em degraus: valor + conversão da etapa anterior */}
                <div className="flex flex-wrap gap-2">
                  {funnel.map((s, i) => (
                    <div
                      key={s.label}
                      className={cn(
                        'min-w-24 flex-1 rounded-lg px-3 py-2',
                        i === funnel.length - 1 ? 'bg-gold-500/10' : 'bg-white/[0.04]',
                      )}
                    >
                      <p className="text-[11px] text-white/40 uppercase">{s.label}</p>
                      <p
                        className={cn(
                          'text-lg font-semibold',
                          i === funnel.length - 1 ? 'text-gold-400' : 'text-white',
                        )}
                      >
                        {s.value}
                      </p>
                      {s.rate && <p className="text-[11px] text-white/30">↓ {s.rate}</p>}
                    </div>
                  ))}
                </div>

                {goal && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-white/40">Meta de agendamento</p>
                    <GoalProgress
                      current={r.agendamentos}
                      reachable={goal.target_reachable}
                      high={goal.target_high}
                      superGoal={goal.target_super}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
