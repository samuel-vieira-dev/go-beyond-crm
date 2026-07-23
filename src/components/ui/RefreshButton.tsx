import { cn } from '@/lib/cn'

export function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
      title="Atualizar dados agora"
    >
      <span className={cn('text-base', loading && 'inline-block animate-spin')}>↻</span>
      Atualizar
    </button>
  )
}
