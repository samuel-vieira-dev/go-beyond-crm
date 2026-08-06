import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { FormRow, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useProducts } from '@/hooks/useProducts'
import { useSales, useUpdateSale } from '@/hooks/useSales'
import type { DateRange } from '@/hooks/useFunnelMetrics'
import type { SaleWithRelations } from '@/types/database'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Vendas que vieram de card no kanban, com o valor corrigível.
 *
 * O closer tem margem de negociação: o preço de tabela do produto é só sugestão, e
 * o desconto às vezes só é acertado depois do registro. Antes disso a única saída
 * era apagar a venda e refazer, perdendo o vínculo com a reunião.
 *
 * Venda que aconteceu FORA do kanban não entra aqui — vai no total do dia, na grade
 * do relatório acima.
 */
export function CloserSalesPanel({ range, closerId }: { range: DateRange; closerId: string }) {
  const { data: sales } = useSales({ closerId, from: range.from, to: range.to })
  const [editing, setEditing] = useState<SaleWithRelations | null>(null)

  const rows = sales ?? []
  if (rows.length === 0) return null

  const total = rows.reduce((sum, s) => sum + Number(s.amount), 0)

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Vendas registradas no kanban</h2>
        <span className="text-[11px] text-white/30">negociou por outro valor? corrija aqui</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] text-white/40">
              <th className="py-2 pr-3 font-medium">Dia</th>
              <th className="py-2 pr-3 font-medium">Lead</th>
              <th className="py-2 pr-3 font-medium">Produto</th>
              <th className="py-2 pr-3 text-right font-medium">Valor</th>
              <th className="py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="py-2 pr-3 text-gold-400">{format(parseISO(s.sold_at), 'dd/MM')}</td>
                <td className="py-2 pr-3 text-white">{s.lead?.name ?? '—'}</td>
                <td className="py-2 pr-3 text-white/60">{s.product?.name ?? '—'}</td>
                <td className="py-2 pr-3 text-right text-white">{currency.format(Number(s.amount))}</td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Editar valor
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
        {rows.length} venda{rows.length > 1 ? 's' : ''} pelo kanban · {currency.format(total)}
      </p>

      {editing && <EditSaleModal sale={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditSaleModal({ sale, onClose }: { sale: SaleWithRelations; onClose: () => void }) {
  const { data: products } = useProducts()
  const updateSale = useUpdateSale()

  const [amount, setAmount] = useState(String(sale.amount))
  const [productId, setProductId] = useState(sale.product_id)

  async function handleSave() {
    if (!amount) return
    await updateSale.mutateAsync({ saleId: sale.id, amount: Number(amount), productId: productId || undefined })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Editar venda — ${sale.lead?.name ?? ''}`} width="sm">
      <div className="space-y-4">
        <p className="text-xs text-white/40">
          O preço de tabela do produto é só sugestão. Se você negociou por menos (ou por mais),
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateSale.isPending || !amount}>
            {updateSale.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
