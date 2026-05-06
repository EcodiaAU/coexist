import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Lightweight check - returns true when at least one organisation exists. */
export function useHasPartners() {
  const { data: hasPartners = false, isLoading } = useQuery({
    queryKey: ['has-partners'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('organisations')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return (count ?? 0) > 0
    },
    staleTime: 10 * 60 * 1000,
  })
  return { hasPartners, isLoading }
}
