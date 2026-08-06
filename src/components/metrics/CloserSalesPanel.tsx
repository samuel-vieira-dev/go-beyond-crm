import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useProducts } from '@/hooks/useProducts'
import { useSales, useUpdateSale } from '@/hooks/useSales'
import { useDeleteManualSale, useManualSales, useSaveManualSale } from '@/hooks/useManualSales'
import { CHANNEL_TAGS } from '@/types/domain'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import type { ManualSale, SaleWithRelations } from '@/types/database'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Uma linha da tabela, vinda do kanban (com lead) ou lançada à mão (sem lead). */
type Row =
  | { kind: 'crm'; id: string; date: string; product: string; who: string; amount: number; sale: SaleWithRelations }
  | { kind: 'manual'; id: string; date: string; product: string; who: string; amount: number; sale: ManualSale }

/**
 * Vendas do closer no período — as que vieram de card e as lançadas à mão, na mesma
 * tabela, ambas com o valor editável.
 *
 * O valor é editável porque o closer tem margem: o preço de tabela do produto é
 * sugestão, e o desconto às vezes só é acertado depois do registro. Antes disso a
 * única saída era apagar a venda e refazer, perdendo o vínculo com a reunião.
 */
export function CloserSalesPanel({ range, closerId }: { range: DateRange; closerId: string }) {
  const { data: crmSales } = useSales({ closerId, from: range.from, to: range.to })
  const { data: manualSales } = useManualSales({ closerId, range })
  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)

  const rows: Row[] = [
    ...(crmSales ?? []).map((s): Row => ({
      kind: 'crm',
      id: s.id,
      date: s.sold_at,
      product: s.product?.name ?? '—',
      who: s.lead?.name ?? '—',
      amount: Number(s.amount),
      sale: s,
    })),
    ...(manualSales ?? []).map((s): Row => ({
      kind: 'manual',
      id: s.id,
      date: s.sold_on,
      product: s.product_name ?? '—',
      who: s.channel ?? 'Sem canal',
      amount: Number(s.amount),
      sale: s,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Vendas no período</h2>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          + Venda sem card
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-white/30">Nenhuma venda no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] text-white/40">
                <th className="py-2 pr-3 font-medium">Dia</th>
                <th className="py-2 pr-3 font-medium">Produto</th>
                <th className="py-2 pr-3 font-medium">Lead / canal</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-gold-400">{format(parseISO(r.date), 'dd/MM')}</td>
                  <td className="py-2 pr-3 text-white">
                    {r.product}
                    {r.kind === 'manual' && (
                      <span className="ml-2 text-[10px] text-white/30" title="Lançada à mão, sem card no kanban">
                        manual
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-white/60">{r.who}</td>
                  <td className="py-2 pr-3 text-right text-white">{currency.format(r.amount)}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                      Editar valor
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
          {rows.length} venda{rows.length > 1 ? 's' : ''} · {currency.format(total)}
        </p>
      )}

      {editing && <EditSaleModal row={editing} onClose={() => setEditing(null)} />}
      {creating && <ManualSaleModal closerId={closerId} onClose={() => setCreating(false)} />}
    </div>
  )
}

function EditSaleModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data: products } = useProducts()
  const updateSale = useUpdateSale()
  const saveManual = useSaveManualSale()
  const deleteManual = useDeleteManualSale()

  const [amount, setAmount] = useState(String(row.amount))
  const [productId, setProductId] = useState(
    row.kind === 'crm' ? row.sale.product_id : (row.sale.product_id ?? ''),
  )

  const pending = updateSale.isPending || saveManual.isPending || deleteManual.isPending

  async function handleSave() {
    if (!amount) return
    if (row.kind === 'crm') {
      await updateSale.mutateAsync({ saleId: row.id, amount: Number(amount), productId: productId || undefined })
    } else {
      await saveManual.mutateAsync({
        id: row.id,
        closerId: row.sale.closer_id,
        soldOn: row.sale.sold_on,
        productId: productId || null,
        productName: products?.find((p) => p.id === productId)?.name ?? row.sale.product_name,
        channel: row.sale.channel,
        amount: Number(amount),
        nota: row.sale.nota,
      })
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Editar venda" width="sm">
      <div className="space-y-4">
        <p className="text-xs text-white/40">
          O valor de tabela do produto é só sugestão. Se você negociou por menos (ou por mais),
          corrija aqui — é este número que entra no seu faturamento e na meta.
        </p>
        <FormRow label="Produto">
          <Select value={productId ?? ''} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecione</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Valor negociado (R$) *">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <div className="flex justify-between gap-2 pt-2">
          {row.kind === 'manual' ? (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await deleteManual.mutateAsync(row.id)
                onClose()
              }}
              disabled={pending}
            >
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={pending || !amount}>
              {pending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ManualSaleModal({ closerId, onClose }: { closerId: string; onClose: () => void }) {
  const { data: products } = useProducts()
  const save = useSaveManualSale()

  const [soldOn, setSoldOn] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [productId, setProductId] = useState('')
  const [channel, setChannel] = useState<string>(CHANNEL_TAGS[3])
  const [amount, setAmount] = useState('')

  // Preço de tabela como ponto de partida; o closer sobrescreve se negociou.
  useEffect(() => {
    const p = products?.find((pr) => pr.id === productId)
    if (p) setAmount(String(p.default_price))
  }, [productId, products])

  async function handleSave() {
    if (!amount || !soldOn) return
    await save.mutateAsync({
      closerId,
      soldOn,
      productId: productId || null,
      productName: products?.find((p) => p.id === productId)?.name ?? null,
      channel,
      amount: Number(amount),
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Venda sem card no kanban" width="sm">
      <div className="space-y-4">
        <p className="text-xs text-white/40">
          Para venda que fechou fora do CRM. Entra no seu faturamento, no ranking e no canal —
          sem criar lead no kanban.
        </p>
        <FormRow label="Data da venda *">
          <Input type="date" value={soldOn} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => e.target.value && setSoldOn(e.target.value)} />
        </FormRow>
        <FormRow label="Produto">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecione</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Canal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNEL_TAGS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Valor negociado (R$) *">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={save.isPending || !amount}>
            {save.isPending ? 'Salvando...' : 'Registrar venda'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
