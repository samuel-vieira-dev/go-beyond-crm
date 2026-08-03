import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DateRange } from './useFunnelMetrics'

export interface QuizScreenStat {
  screen: string
  views: number
  clicks: number
}

export function useQuizAnalytics(range: DateRange, quiz = 'link-bio') {
  return useQuery({
    queryKey: ['quiz-analytics', range, quiz],
    queryFn: async (): Promise<QuizScreenStat[]> => {
      const { data, error } = await supabase.rpc('get_quiz_stats', {
        p_from: range.from,
        p_to: range.to,
        p_quiz: quiz,
      })
      if (error) throw error
      return (data ?? []) as QuizScreenStat[]
    },
  })
}

export interface QuizLead {
  id: string
  quiz: string
  name: string | null
  email: string | null
  phone: string | null
  segment: string | null
  answers: Record<string, unknown> | null
  utm: Record<string, unknown> | null
  created_at: string
}

/** Leads captados pelo quiz no período — alimentam o contador e a exportação CSV. */
export function useQuizLeads(range: DateRange, quiz: string) {
  return useQuery({
    queryKey: ['quiz-leads', range, quiz],
    queryFn: async (): Promise<QuizLead[]> => {
      const { data, error } = await supabase
        .from('quiz_leads')
        .select('*')
        .eq('quiz', quiz)
        .gte('created_at', range.from)
        .lte('created_at', range.to)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as QuizLead[]
    },
  })
}

/** Monta e baixa o CSV dos leads (Excel/Sheets abrem direto). */
export function downloadQuizLeadsCsv(leads: QuizLead[], filename: string) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const head = ['Data', 'Quiz', 'Nome', 'Email', 'Telefone', 'Segmento', 'Respostas', 'UTMs']
  const rows = leads.map((l) =>
    [
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.quiz, l.name, l.email, l.phone, l.segment, l.answers, l.utm,
    ].map(cell).join(','),
  )
  // BOM para o Excel reconhecer os acentos
  const blob = new Blob(['\uFEFF' + [head.map(cell).join(','), ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
