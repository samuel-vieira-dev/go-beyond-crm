import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Invalida as queries indicadas sempre que qualquer uma das tabelas muda no banco.
 * Usado para manter relatórios/dashboards sincronizados com o kanban em tempo real.
 *
 * O nome do canal recebe um sufixo único por instância para que dois componentes
 * que assinem o "mesmo" canal (ex.: provider + página) não colidam no Supabase.
 */
export function useRealtimeInvalidate(channelName: string, tables: string[], queryKeys: unknown[][]) {
  const queryClient = useQueryClient()
  const idRef = useRef(Math.random().toString(36).slice(2))

  useEffect(() => {
    const channel = supabase.channel(`${channelName}-${idRef.current}`)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        for (const key of queryKeys) queryClient.invalidateQueries({ queryKey: key })
      })
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName])
}
