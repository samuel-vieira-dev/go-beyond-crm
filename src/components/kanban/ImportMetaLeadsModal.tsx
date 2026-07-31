import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { parseMetaLeadsCsv, type ParsedMetaLead } from '@/lib/metaLeadsCsv'
import { STAGE_LABELS } from '@/types/domain'

export function ImportMetaLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: sellers } = useProfiles('social_seller')
  const [rows, setRows] = useState<ParsedMetaLead[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sellerNames = useMemo(() => (sellers ?? []).map((s) => s.full_name), [sellers])

  function handleFile(file: File) {
    setError(null)
    setResult(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseMetaLeadsCsv(String(reader.result ?? ''), sellerNames)
        if (parsed.length === 0) setError('Nenhum lead encontrado no arquivo. Confira se é o CSV da Central de Leads.')
        setRows(parsed)
      } catch {
        setError('Não foi possível ler o arquivo.')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // Resumo do que será importado
  const summary = useMemo(() => {
    const byStage = new Map<string, number>()
    const byApproach = new Map<string, number>()
    let semResponsavel = 0
    for (const r of rows) {
      byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1)
      const a = r.approachType ?? 'sem tipo'
      byApproach.set(a, (byApproach.get(a) ?? 0) + 1)
      if (!r.ownerName) semResponsavel++
    }
    return { byStage: [...byStage], byApproach: [...byApproach], semResponsavel }
  }, [rows])

  async function handleImport() {
    if (rows.length === 0) return
    setImporting(true)
    setError(null)
    try {
      // Quais já foram importados antes (dedupe pela chave da Meta).
      const keys = rows.map((r) => r.metaKey)
      const existing = new Set<string>()
      for (let i = 0; i < keys.length; i += 200) {
        const { data } = await supabase
          .from('leads')
          .select('meta_lead_key')
          .in('meta_lead_key', keys.slice(i, i + 200))
        for (const d of data ?? []) if (d.meta_lead_key) existing.add(d.meta_lead_key)
      }

      const byName = new Map((sellers ?? []).map((s) => [s.full_name.toLowerCase(), s.id]))
      const novos = rows.filter((r) => !existing.has(r.metaKey))

      const payload = novos.map((r) => ({
        name: r.name,
        whatsapp: null,
        origin: 'instagram' as const,
        is_mql: false,
        stage: r.stage,
        approach_type: r.approachType,
        meta_lead_key: r.metaKey,
        notes: r.labels.length ? `Rótulos da Meta: ${r.labels.join(', ')}` : null,
        owner_id:
          (r.ownerName ? byName.get(r.ownerName.toLowerCase()) : undefined) ?? profile?.id ?? null,
        created_at: r.createdAt ?? undefined,
      }))

      let created = 0
      for (let i = 0; i < payload.length; i += 100) {
        const slice = payload.slice(i, i + 100)
        // Sem .select(): a RLS de leitura bloquearia os leads atribuídos a outras
        // pessoas, o que fazia o insert retornar 403.
        const { error: insErr } = await supabase.from('leads').insert(slice)
        if (insErr) throw insErr
        created += slice.length
      }

      setResult({ created, skipped: rows.length - novos.length })
      setRows([])
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar.')
    } finally {
      setImporting(false)
    }
  }

  function close() {
    setRows([])
    setFileName('')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Importar leads da Central de Leads (Meta)" width="lg">
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-white/20 p-6 text-center">
          <input
            id="meta-csv"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <label htmlFor="meta-csv" className="cursor-pointer">
            <p className="text-sm text-white">📄 Clique para escolher o arquivo CSV</p>
            <p className="mt-1 text-xs text-white/40">
              Baixe em Meta Business Suite → Central de Leads → Exportar
            </p>
          </label>
          {fileName && <p className="mt-2 text-xs text-gold-400">{fileName}</p>}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {result && (
          <div className="card-surface rounded-lg p-4 text-sm">
            <p className="font-semibold text-success">✓ {result.created} lead(s) importado(s)</p>
            {result.skipped > 0 && (
              <p className="mt-1 text-xs text-white/50">
                {result.skipped} já tinham sido importados antes (ignorados, sem duplicar).
              </p>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{rows.length} leads no arquivo</p>
              {summary.semResponsavel > 0 && (
                <Badge tone="red">{summary.semResponsavel} sem responsável</Badge>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs text-white/40 uppercase">Vão entrar nestas etapas</p>
              <div className="flex flex-wrap gap-1">
                {summary.byStage.map(([stage, n]) => (
                  <Badge key={stage} tone="gold">
                    {STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage}: {n}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs text-white/40 uppercase">Tipo de abordagem</p>
              <div className="flex flex-wrap gap-1">
                {summary.byApproach.map(([a, n]) => (
                  <Badge key={a} tone="blue">
                    {a}: {n}
                  </Badge>
                ))}
              </div>
            </div>

            {summary.semResponsavel > 0 && (
              <p className="text-xs text-white/40">
                Leads sem responsável (Proprietário "Unassigned" e sem rótulo com nome cadastrado)
                ficam com você.
              </p>
            )}

            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-navy-900">
                  <tr className="text-left text-white/40">
                    <th className="px-2 py-1.5">Nome</th>
                    <th className="px-2 py-1.5">Etapa</th>
                    <th className="px-2 py-1.5">Abordagem</th>
                    <th className="px-2 py-1.5">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r) => (
                    <tr key={r.metaKey} className="border-t border-white/5">
                      <td className="max-w-40 truncate px-2 py-1.5 text-white">{r.name}</td>
                      <td className="px-2 py-1.5 text-white/60">{STAGE_LABELS[r.stage]}</td>
                      <td className="px-2 py-1.5 text-white/60">{r.approachType ?? '—'}</td>
                      <td className="px-2 py-1.5 text-white/60">{r.ownerName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={close}>
            Fechar
          </Button>
          <Button onClick={handleImport} disabled={rows.length === 0 || importing}>
            {importing ? 'Importando...' : `Importar ${rows.length || ''} leads`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
