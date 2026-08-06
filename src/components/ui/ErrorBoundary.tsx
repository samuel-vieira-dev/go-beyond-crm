import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'
import { isChunkLoadError, reloadOnChunkError } from '@/lib/chunkReload'

/**
 * Sem isto, qualquer erro em render derruba a árvore inteira do React e a pessoa
 * fica só com o fundo azul da página até dar F5 — foi o que aconteceu ao clicar
 * numa data no Chrome/Windows. Aqui o erro vira uma tela com botão de recarregar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    if (isChunkLoadError(error)) reloadOnChunkError()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6">
        <div className="card-surface max-w-md rounded-xl p-6 text-center">
          <p className="text-base font-semibold text-white">Algo quebrou nesta tela</p>
          <p className="mt-2 text-sm text-white/50">
            Seus dados estão salvos. Recarregue a página para continuar.
          </p>
          <p className="mt-3 rounded-lg bg-white/5 p-2 text-left text-[11px] break-all text-white/30">
            {error.message}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Tentar de novo
            </Button>
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          </div>
        </div>
      </div>
    )
  }
}
