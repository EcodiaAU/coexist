import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60
const STALE_TIME_MS = 50 * 60 * 1000
const GC_TIME_MS = 60 * 60 * 1000

export function useSignedChatImage(path: string | null | undefined): {
  url: string | undefined
  isLoading: boolean
  error: Error | null
} {
  const enabled = !!path
  const query = useQuery({
    queryKey: ['chat-image-signed', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(path!, SIGNED_URL_TTL_SECONDS)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('Empty signed URL response')
      return data.signedUrl
    },
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  return {
    url: query.data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  }
}
