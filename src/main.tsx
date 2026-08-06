import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/context/AuthContext'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { reloadOnChunkError } from '@/lib/chunkReload'

// Deploy novo troca os hashes dos chunks; uma aba antiga que tenta importar um
// chunk removido cai aqui. Recarrega sozinho em vez de deixar a tela em branco.
window.addEventListener('vite:preloadError', () => {
  reloadOnChunkError()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
