const RELOAD_FLAG = 'chunk-reload-attempted'

// A última alternativa cobre o caso em que o servidor devolve o index.html no
// lugar de um chunk que já não existe: o Chrome recusa com "'text/html' is not a
// valid JavaScript MIME type" em vez de um erro de import.
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|is not a valid JavaScript MIME type/i

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return CHUNK_ERROR_PATTERN.test(message)
}

/**
 * Um deploy novo troca os hashes dos arquivos; uma aba aberta antes disso tenta
 * buscar um chunk que não existe mais e cai num erro de import dinâmico. Em vez
 * de deixar a pessoa travada, recarrega uma vez sozinho — o sessionStorage evita
 * loop infinito se o problema for outro.
 */
export function reloadOnChunkError(): boolean {
  if (sessionStorage.getItem(RELOAD_FLAG)) return false
  sessionStorage.setItem(RELOAD_FLAG, '1')
  window.location.reload()
  return true
}
