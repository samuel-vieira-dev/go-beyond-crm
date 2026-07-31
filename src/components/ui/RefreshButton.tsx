import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/cn'

/**
 * Atualiza os dados da tela. Invalida todas as queries — antes chamava o refetch
 * de uma query só, e as telas que carregam vários dados não atualizavam de fato.
 */
export function RefreshButton({ onClick, loading }: { onClick?: () => void; loading?: boolean }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const spinning = busy || loading

  async function handleClick() {
    setBusy(true)
    try {
      onClick?.()
      await queryClient.invalidateQueries()
      await queryClient.refetchQueries({ type: 'active' })
    } finally {
      setTimeout(() => setBusy(false), 400)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
      title="Atualizar dados agora"
    >
      <span className={cn('text-base', spinning && 'inline-block animate-spin')}>↻</span>
      Atualizar
    </button>
  )
}
