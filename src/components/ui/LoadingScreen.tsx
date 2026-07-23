export function LoadingScreen({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-500" />
        {label}
      </div>
    </div>
  )
}
