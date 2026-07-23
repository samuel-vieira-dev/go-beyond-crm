interface FunnelStep {
  label: string
  value: number
}

// Tons de dourado do mais claro (topo) ao mais profundo (base) — magnitude sequencial.
const SHADES = ['#f3c374', '#efaf55', '#e6a648', '#d99633', '#c9852a', '#b8741f']

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(steps[0]?.value ?? 0, 1)
  // Largura mínima de 22% pra que etapas pequenas ainda fiquem legíveis.
  const widthAt = (value: number) => Math.max(22, (value / max) * 100)

  return (
    <div className="mx-auto w-full max-w-3xl">
      {steps.map((step, i) => {
        const topW = widthAt(step.value)
        const botW = widthAt(steps[i + 1]?.value ?? step.value)
        const isLast = i === steps.length - 1
        const prev = steps[i - 1]?.value
        const convFromPrev = prev && prev > 0 ? (step.value / prev) * 100 : null
        const shade = SHADES[Math.min(i, SHADES.length - 1)]

        const clip = isLast
          ? undefined
          : {
              clipPath: `polygon(${50 - topW / 2}% 0, ${50 + topW / 2}% 0, ${50 + botW / 2}% 100%, ${50 - botW / 2}% 100%)`,
            }

        return (
          <div key={step.label} className="relative flex items-center">
            {/* rótulo/conversão à esquerda */}
            <div className="hidden w-40 shrink-0 pr-3 text-right sm:block">
              {convFromPrev !== null && (
                <span className="text-xs text-white/40">
                  ↓ {convFromPrev.toFixed(0)}% da etapa anterior
                </span>
              )}
            </div>

            {/* segmento do funil */}
            <div className="relative flex-1">
              <div
                className="mx-auto flex h-16 items-center justify-center"
                style={{
                  width: isLast ? `${topW}%` : '100%',
                  background: shade,
                  ...clip,
                }}
              >
                <div className="text-center leading-tight">
                  <p className="text-xl font-bold text-navy-950">{step.value.toLocaleString('pt-BR')}</p>
                  <p className="text-[11px] font-semibold text-navy-950/70 uppercase">{step.label}</p>
                </div>
              </div>
            </div>

            {/* espaço espelhado à direita pra manter o funil centralizado */}
            <div className="hidden w-40 shrink-0 sm:block" />
          </div>
        )
      })}
    </div>
  )
}
