import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface QuizUpsellLead {
  person_id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  answered_at: string
  segment: string | null
  is_qualified: boolean
  answers: Record<string, string> | null
  quiz_count: number
  contacted: boolean
  contacted_at: string | null
  contacted_by: string | null
  contacted_by_name: string | null
  lead_id: string | null
}

const PAGE_SIZE = 1000

/** Leads do quiz pós-venda com telefone, prontos para acionamento via Clint. */
export function useQuizUpsellLeads() {
  return useQuery({
    queryKey: ['quiz-upsell-leads'],
    queryFn: async (): Promise<QuizUpsellLead[]> => {
      // O PostgREST do projeto trava em 1000 linhas por resposta (db.max_rows), mesmo
      // pedindo mais via .range() — é limite de servidor, não do client. A base já
      // passa de 3 mil, então pagina aqui até a última página vir incompleta.
      const all: QuizUpsellLead[] = []
      for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE
        const { data, error } = await supabase
          .rpc('get_quiz_upsell_leads')
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        const rows = (data ?? []) as QuizUpsellLead[]
        all.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }
      return all
    },
  })
}

export interface MarkOutreachInput {
  personId: string
  contacted: boolean
  /** Cria o card na coluna "Novo Lead" do kanban de quem marcou. */
  createLead?: boolean
}

export function useMarkQuizOutreach() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personId, contacted, createLead = false }: MarkOutreachInput) => {
      const { data, error } = await supabase.rpc('mark_quiz_outreach', {
        p_person_id: personId,
        p_contacted: contacted,
        p_create_lead: createLead,
      })
      if (error) throw error
      return data as string | null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz-upsell-leads'] })
      // Se virou card, o kanban precisa recarregar.
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export interface SendToClintInput {
  nome: string | null
  telefone: string | null
  email: string | null
  /** Tags aplicadas ao lead na Clint (ex.: "SDR,Fulana"). Se omitido, a function usa um padrão. */
  tags?: string
}

/** Envia o lead para o webhook de integração da Clint (via Edge Function — a URL não fica no client). */
export function useSendToClint() {
  return useMutation({
    mutationFn: async (input: SendToClintInput) => {
      const { data, error } = await supabase.functions.invoke('clint-send', { body: input })
      if (error) throw error
      return data
    },
  })
}
