import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'
import type { Role } from '@/types/domain'

export function useProfiles(role?: Role) {
  return useQuery({
    queryKey: ['profiles', role ?? 'all'],
    queryFn: async () => {
      let query = supabase.from('profiles').select('*').eq('active', true).order('full_name')
      if (role) query = query.eq('role', role)
      const { data, error } = await query
      if (error) throw error
      return data as Profile[]
    },
  })
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles', 'all-including-inactive'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name')
      if (error) throw error
      return data as Profile[]
    },
  })
}
