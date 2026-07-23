import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Toggle } from '@/components/ui/Toggle'
import { FormRow, Input } from '@/components/ui/Field'
import { useCreateProduct, useDeleteProduct, useProducts, useUpdateProduct } from '@/hooks/useProducts'
import type { Product } from '@/types/database'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdminProductsPage() {
  const { data: products, isLoading } = useProducts(false)
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteProduct.mutateAsync(p.id)
    } catch {
      alert(
        'Não foi possível excluir: este produto já está vinculado a vendas registradas. ' +
          'Desative-o com o botão de status para tirá-lo do catálogo sem perder o histórico.',
      )
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Produtos</h1>
          <p className="text-sm text-white/40">Catálogo usado pelo Closer ao registrar uma venda</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>+ Novo produto</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/40">Carregando produtos...</p>
      ) : (
        <div className="card-surface overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Preço padrão</th>
                <th className="px-4 py-3 font-medium">Disponível no catálogo</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{p.name}</td>
                  <td className="px-4 py-3 text-white/70">{currency.format(p.default_price)}</td>
                  <td className="px-4 py-3">
                    <Toggle
                      checked={p.active}
                      onChange={(active) => updateProduct.mutate({ id: p.id, active })}
                      labelOn="Ativo"
                      labelOff="Inativo"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(p)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ProductFormModal open={!!editing} onClose={() => setEditing(null)} product={editing} />
    </div>
  )
}

function ProductFormModal({
  open,
  onClose,
  product,
}: {
  open: boolean
  onClose: () => void
  product?: Product | null
}) {
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.default_price) : '')

  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setPrice(product ? String(product.default_price) : '')
    }
  }, [open, product])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (product) {
      await updateProduct.mutateAsync({ id: product.id, name, default_price: Number(price) })
    } else {
      await createProduct.mutateAsync({ name, default_price: Number(price) })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar produto' : 'Novo produto'} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormRow label="Nome *">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="Preço padrão (R$) *">
          <Input type="number" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </FormRow>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
