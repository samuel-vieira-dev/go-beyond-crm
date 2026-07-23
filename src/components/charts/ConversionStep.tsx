export function ConversionStep({
  fromLabel,
  toLabel,
  fromValue,
  toValue,
}: {
  fromLabel: string
  toLabel: string
  fromValue: number
  toValue: number
}) {
  const pct = fromValue > 0 ? (toValue / fromValue) * 100 : 0
  const pctClamped = Math.max(0, Math.min(100, pct))

  return (
    <div className="card-surface rounded-xl p-5">
      {/* de → para, com os números absolutos bem visíveis */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white/40 uppercase">{fromLabel}</p>
          <p className="text-2xl font-bold text-white">{fromValue.toLocaleString('pt-BR')}</p>
        </div>

        <div className="flex flex-col items-center px-2">
          <span className="text-3xl leading-none font-extrabold text-gold-400">{pct.toFixed(1)}%</span>
          <span className="mt-0.5 text-lg text-white/30">→</span>
        </div>

        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-medium text-white/40 uppercase">{toLabel}</p>
          <p className="text-2xl font-bold text-gold-400">{toValue.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* barra de progresso reforçando a taxa */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${pctClamped}%` }} />
      </div>
      <p className="mt-2 text-xs text-white/40">
        {toValue.toLocaleString('pt-BR')} de {fromValue.toLocaleString('pt-BR')} passaram desta etapa
      </p>
    </div>
  )
}
