import { useMemo, useState } from 'react'
import { startOfDay, subDays } from 'date-fns'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { downloadQuizLeadsCsv, useQuizAnalytics, useQuizLeads } from '@/hooks/useQuizAnalytics'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import { cn } from '@/lib/cn'

// Ordem e rótulos das telas do quiz-link-bio (screen-N).
const SCREENS: { id: string; label: string }[] = [
  { id: '1', label: '1 · Objetivo' },
  { id: '2', label: '2 · Nível de inglês' },
  { id: '3', label: '3 · Conteúdo' },
  { id: '4', label: '4 · Obstáculo' },
  { id: '5', label: '5 · Há quanto tempo' },
  { id: '6', label: '6 · Vídeo viral' },
  { id: '7', label: '7 · Faixa de renda' },
  { id: '8', label: '8 · Carregando' },
  { id: '9', label: '9 · Captura WhatsApp' },
  { id: '10a', label: '10a · Resultado (Qualificado)' },
  { id: '10b', label: '10b · VSL (não-qualificado)' },
  { id: 'checkout', label: '➜ Clique no Checkout' },
]

/** Telas do quiz pós-venda (1–8, 9a MQL e 9b não-MQL). */
const POS_VENDA_SCREENS: { id: string; label: string }[] = [
  { id: '1', label: '1 · Boas-vindas' },
  { id: '2', label: '2 · Urgência' },
  { id: '3', label: '3 · Conteúdo' },
  { id: '4', label: '4 · Motivação' },
  { id: '5', label: '5 · Obstáculo' },
  { id: '6', label: '6 · Copy motivação' },
  { id: '7', label: '7 · Renda' },
  { id: '8', label: '8 · Carregando' },
  { id: '9a', label: '9a · VSL Go Beyond (MQL)' },
  { id: '9b', label: '9b · VSL Speak-up' },
  { id: 'checkout', label: '➜ Clique no Checkout' },
]

const QUIZZES = {
  'link-bio': { title: 'Quiz Link da Bio', screens: SCREENS, resultIds: ['10a', '10b'] },
  'pos-venda': { title: 'Quiz Pós-venda', screens: POS_VENDA_SCREENS, resultIds: ['9a', '9b'] },
} as const

export type QuizId = keyof typeof QUIZZES

export function AdminQuizDashboardPage({ quiz = 'link-bio' }: { quiz?: QuizId }) {
  const config = QUIZZES[quiz]
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 29)).toISOString(),
    to: new Date().toISOString(),
  })
  const { data, isLoading } = useQuizAnalytics(range, quiz)
  const { data: leads } = useQuizLeads(range, quiz)

  const byScreen = useMemo(() => {
    const map = new Map<string, { views: number; clicks: number }>()
    for (const s of data ?? []) map.set(s.screen, { views: s.views, clicks: s.clicks })
    return map
  }, [data])

  const firstViews = byScreen.get('1')?.views ?? 0
  const captureViews = byScreen.get(quiz === 'link-bio' ? '9' : '8')?.views ?? 0
  const checkoutClicks = byScreen.get('checkout')?.clicks ?? 0
  const totalLeads = config.resultIds.reduce((sum, id) => sum + (byScreen.get(id)?.views ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard — {config.title}</h1>
          <p className="text-sm text-white/40">Views e cliques por tela · funil de conversão</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Button
            variant="secondary"
            disabled={!leads || leads.length === 0}
            onClick={() =>
              leads && downloadQuizLeadsCsv(leads, `leads-${quiz}-${range.from.slice(0, 10)}.csv`)
            }
          >
            ⬇ Exportar {leads?.length ? `${leads.length} leads` : 'leads'} (CSV)
          </Button>
          <RefreshButton />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando...</p>
      ) : (byScreen.size === 0) ? (
        <div className="card-surface rounded-xl p-8 text-center text-sm text-white/40">
          Nenhum evento registrado no período. Assim que o quiz receber visitas, os dados aparecem aqui.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Entradas no quiz" value={firstViews} accent />
            <StatCard
              label="Chegaram na captura"
              value={captureViews}
              hint={firstViews ? `${((captureViews / firstViews) * 100).toFixed(0)}% do topo` : undefined}
            />
            <StatCard
              label="Viraram lead"
              value={totalLeads}
              accent
              hint={firstViews ? `${((totalLeads / firstViews) * 100).toFixed(0)}% do topo` : undefined}
            />
            <StatCard label="Cliques no checkout" value={checkoutClicks} accent />
            <StatCard label="Leads na base" value={leads?.length ?? 0} hint="Disponíveis no CSV" />
          </div>

          <div className="card-surface rounded-xl p-4">
            <div className="mb-3 grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs font-medium text-white/40 uppercase">
              <span>Tela</span>
              <span className="w-16 text-right">Views</span>
              <span className="w-16 text-right">Cliques</span>
              <span className="w-20 text-right">Retenção</span>
            </div>
            <div className="space-y-1.5">
              {config.screens.map((s) => {
                const st = byScreen.get(s.id) ?? { views: 0, clicks: 0 }
                const isCheckout = s.id === 'checkout'
                const retention = firstViews ? (st.views / firstViews) * 100 : 0
                const barBase = isCheckout ? checkoutClicks : st.views
                const barPct = firstViews ? Math.min(100, (barBase / firstViews) * 100) : 0
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className={cn('truncate text-sm', isCheckout ? 'text-gold-300' : 'text-white')}>
                          {s.label}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn('h-full rounded-full', isCheckout ? 'bg-success' : 'bg-gold-500')}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right text-sm text-white">{st.views.toLocaleString('pt-BR')}</span>
                    <span className="w-16 text-right text-sm text-white/60">
                      {st.clicks.toLocaleString('pt-BR')}
                    </span>
                    <span className="w-20 text-right text-xs text-white/40">
                      {isCheckout ? '—' : `${retention.toFixed(0)}%`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
