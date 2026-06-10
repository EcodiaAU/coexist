import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LegalPage {
  slug: string
  title: string
  content: string
  summary: string | null
  is_published: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** Fetch a single published legal page by slug (public) */
export function useLegalPage(slug: string) {
  return useQuery({
    queryKey: ['legal-page', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('legal_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()
      if (error) throw error
      return data as unknown as LegalPage
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Fetch all legal pages (admin - includes unpublished) */
export function useAllLegalPages() {
  return useQuery({
    queryKey: ['legal-pages-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('legal_pages')
        .select('*')
        .order('title')
      if (error) throw error
      return (data ?? []) as unknown as LegalPage[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Save (upsert) a legal page */
export function useSaveLegalPage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (page: {
      slug: string
      title: string
      content: string
      summary: string
      is_published: boolean
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('legal_pages')
        .upsert(
          { ...page, updated_by: user?.id ?? null },
          { onConflict: 'slug' },
        )
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['legal-pages-admin'] })
      queryClient.invalidateQueries({ queryKey: ['legal-page', variables.slug] })
    },
  })
}
