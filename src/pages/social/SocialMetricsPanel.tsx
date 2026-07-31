import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useMySocialMetrics, useSaveSocialMetrics } from '@/hooks/useSocialMetrics'
import type { DateRange } from '@/hooks/useFunnelMetrics'

/**
 * Ativações e Conversas em condução acontecem no Business Suite e não viram card.
 * A social seller lança os números do dia aqui para fechar o funil do canal.
 */
export function SocialMetricsPanel({ range }: { range: DateRange }) {
  const { data } = useMySocialMetrics(range)
  const save = useSaveSocialMetrics()
  const [ativacoes, setAtivacoes] = useState('')
  const [conversas, setConversas] = useState('')
  const [saved, setSaved] = useState(false)

  const hoje = new Date()
  const hojeKey = format(hoje, 'yyyy-MM-dd')
  const hojeRow = data?.rows.find((r) => r.date === hojeKey)

  useEffect(() => {
    setAtivacoes(String(hojeRow?.ativacoes ?? ''))
    setConversas(String(hojeRow?.conversas ?? ''))
  }, [hojeRow?.ativacoes, hojeRow?.conversas])

  async function handleSave() {
    await save.mutateAsync({
      date: hoje,
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
          Lançar números de hoje — {format(hoje, "d 'de' MMMM", { locale: ptBR })}
        </h2>
        {saved && <span className="text-xs text-success">✓ salvo</span>}
      </div>
      <p className="mb-3 text-xs text-white/40">
        Ativações e Conversas acontecem no Business Suite. Lance aqui no fim do dia para fechar o
        funil do Social Selling.
      </p>

      <div className="flex flex-wrap items-end gap-3">
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
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {data && (data.ativacoes > 0 || data.conversas > 0) && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
          No período selecionado: <span className="text-white">{data.ativacoes}</span> ativações ·{' '}
          <span className="text-white">{data.conversas}</span> conversas em condução
        </p>
      )}
    </div>
  )
}
