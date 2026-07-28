import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DateRange } from './useFunnelMetrics'

export interface QuizScreenStat {
  screen: string
  views: number
  clicks: number
}

export function useQuizAnalytics(range: DateRange) {
  return useQuery({
    queryKey: ['quiz-analytics', range],
    queryFn: async (): Promise<QuizScreenStat[]> => {
      const { data, error } = await supabase.rpc('get_quiz_stats', {
        p_from: range.from,
        p_to: range.to,
      })
      if (error) throw error
      return (data ?? []) as QuizScreenStat[]
    },
  })
}
