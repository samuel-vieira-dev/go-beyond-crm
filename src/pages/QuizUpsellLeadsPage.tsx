import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { StatCard } from '@/components/ui/StatCard'
import {
  useMarkQuizOutreach,
  useQuizUpsellLeads,
  useSendToClint,
  type QuizUpsellLead,
} from '@/hooks/useQuizUpsellLeads'
import { cn } from '@/lib/cn'

// Rótulos das respostas do quiz pós-venda — o banco guarda o código ("8a12"),
// a tela mostra o texto que a pessoa realmente leu.
const URGENCIA: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

const RENDA: Record<string, string> = {
  acima12: 'Acima de R$12.000',
  '8a12': 'R$8.000–12.000',
  '5a8': 'R$5.000–8.000',
  '3a5': 'R$3.500–5.000',
  '1a3': 'R$1.500–3.500',
  ate1: 'Até R$1.500',
}

const MOTIVACAO: Record<string, string> = {
  carreira: 'Crescer na carreira',
  viajar: 'Viajar sem tradutor',
  morar: 'Morar fora do país',
  relacionamento: 'Conversar com estrangeiros',
}

const OBSTACULO: Record<string, string> = {
  travo: 'Trava na hora de falar',
  inicio: 'Não sabe por onde começar',
  disciplina: 'Falta de disciplina',
  estrutura: 'Precisa de estrutura',
  tempo: 'Falta de tempo',
}

type Filter = 'todos' | 'pendentes' | 'contatados' | 'qualificados'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pendentes', label: 'A chamar' },
  { key: 'qualificados', label: 'Qualificados' },
  { key: 'contatados', label: 'Já chamados' },
  { key: 'todos', label: 'Todos' },
]

export function QuizUpsellLeadsPage() {
  const { data, isLoading } = useQuizUpsellLeads()
  const markOutreach = useMarkQuizOutreach()

  const [filter, setFilter] = useState<Filter>('pendentes')
  const [search, setSearch] = useState('')
  // Lead aguardando a resposta "quer levar para o kanban?"
  const [pendingKanban, setPendingKanban] = useState<QuizUpsellLead | null>(null)

  // Referência estável: `data ?? []` criaria um array novo a cada render e
  // invalidaria os useMemo abaixo sem necessidade.
  const leads = useMemo(() => data ?? [], [data])

  const stats = useMemo(
    () => ({
      total: leads.length,
      contatados: leads.filter((l) => l.contacted).length,
      qualificados: leads.filter((l) => l.is_qualified).length,
    }),
    [leads],
  )

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (filter === 'pendentes' && l.contacted) return false
      if (filter === 'contatados' && !l.contacted) return false
      if (filter === 'qualificados' && !l.is_qualified) return false
      if (!term) return true
      return (
        (l.full_name ?? '').toLowerCase().includes(term) ||
        (l.email ?? '').toLowerCase().includes(term) ||
        (l.phone_e164 ?? '').includes(term)
      )
    })
  }, [leads, filter, search])

  /** Depois que o lead sai para a Clint, marca como contatado e, se ainda não virou card, pergunta sobre o kanban. */
  function handleSent(lead: QuizUpsellLead) {
    markOutreach.mutate(
      { personId: lead.person_id, contacted: true },
      { onSuccess: () => !lead.lead_id && setPendingKanban(lead) },
    )
  }

  function confirmKanban(createLead: boolean) {
    if (createLead && pendingKanban) {
      markOutreach.mutate({ personId: pendingKanban.person_id, contacted: true, createLead: true })
    }
    setPendingKanban(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Leads Upsell AF</h1>
          <p className="text-sm text-white/40">
            Alunos do Autodidata Fluente que responderam o quiz pós-venda · acionamento via Clint
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads com telefone" value={stats.total} accent />
        <StatCard
          label="Qualificados (MQL)"
          value={stats.qualificados}
          hint={stats.total ? `${((stats.qualificados / stats.total) * 100).toFixed(0)}% da base` : undefined}
        />
        <StatCard label="Já chamados" value={stats.contatados} />
        <StatCard label="Faltam chamar" value={stats.total - stats.contatados} accent />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-gold-500/15 text-gold-400'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white',
            )}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou telefone..."
          className="ml-auto w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-gold-500/50 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando...</p>
      ) : visible.length === 0 ? (
        <div className="card-surface rounded-xl p-8 text-center text-sm text-white/40">
          {leads.length === 0
            ? 'Nenhum lead do quiz pós-venda com telefone cadastrado ainda.'
            : 'Nenhum lead neste filtro.'}
        </div>
      ) : (
        <div className="card-surface overflow-x-auto rounded-xl">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40">
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Respondeu em</th>
                <th className="px-4 py-3 font-medium">Respostas do quiz</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => (
                <LeadRow key={lead.person_id} lead={lead} onSent={() => handleSent(lead)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/30">
        Mostrando {visible.length} de {leads.length} leads.
      </p>

      <Modal
        open={pendingKanban !== null}
        onClose={() => setPendingKanban(null)}
        title="Levar para o seu kanban?"
        width="sm"
      >
        <p className="text-sm text-white/70">
          Enviado para a Clint. Quer também criar um card para{' '}
          <strong className="text-white">{pendingKanban?.full_name ?? 'este lead'}</strong> na coluna{' '}
          <strong className="text-white">Novo Lead</strong> do seu kanban? Ele entra com você como
          responsável e com as respostas do quiz anexadas.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => confirmKanban(false)}>
            Não, obrigado
          </Button>
          <Button onClick={() => confirmKanban(true)} disabled={markOutreach.isPending}>
            Sim, criar card
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function LeadRow({ lead, onSent }: { lead: QuizUpsellLead; onSent: () => void }) {
  const sendToClint = useSendToClint()
  const a = lead.answers ?? {}

  function handleSendToClint() {
    sendToClint.mutate(
      { nome: lead.full_name, telefone: lead.phone_e164, email: lead.email },
      { onSuccess: onSent },
    )
  }

  return (
    <tr className={cn('border-b border-white/5 transition-colors hover:bg-white/[0.03]', lead.contacted && 'opacity-60')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{lead.full_name ?? 'Sem nome'}</span>
          {lead.is_qualified && <Badge tone="gold">Qualificado</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-white/40">{lead.email ?? '—'}</div>
        <div className="text-xs text-white/30">{lead.phone_e164}</div>
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-xs text-white/50">
        {new Date(lead.answered_at).toLocaleDateString('pt-BR')}
        <div className="text-white/30">{new Date(lead.answered_at).toLocaleTimeString('pt-BR').slice(0, 5)}</div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {a.urgencia && <Badge tone={a.urgencia === 'alta' ? 'green' : 'neutral'}>Urgência: {URGENCIA[a.urgencia] ?? a.urgencia}</Badge>}
          {a.renda && <Badge tone="blue">{RENDA[a.renda] ?? a.renda}</Badge>}
          {a.motivacao && <Badge tone="neutral">{MOTIVACAO[a.motivacao] ?? a.motivacao}</Badge>}
          {a.obstaculo && <Badge tone="neutral">{OBSTACULO[a.obstaculo] ?? a.obstaculo}</Badge>}
        </div>
      </td>

      <td className="px-4 py-3">
        {lead.contacted ? (
          <div className="text-xs">
            <Badge tone="green">✓ Chamado</Badge>
            <div className="mt-1 text-white/40">
              {lead.contacted_by_name ?? 'alguém'}
              {lead.contacted_at && ` · ${new Date(lead.contacted_at).toLocaleDateString('pt-BR')}`}
            </div>
            {lead.lead_id && <div className="text-white/30">no kanban</div>}
          </div>
        ) : (
          <Badge tone="neutral">A chamar</Badge>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {lead.phone_e164 && (
            <Button
              size="sm"
              variant={sendToClint.isError ? 'danger' : 'primary'}
              onClick={handleSendToClint}
              disabled={sendToClint.isPending}
            >
              {sendToClint.isPending
                ? 'Enviando...'
                : sendToClint.isSuccess
                  ? '✓ Enviado'
                  : sendToClint.isError
                    ? '✕ Erro, tentar de novo'
                    : 'Enviar para Clint'}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
