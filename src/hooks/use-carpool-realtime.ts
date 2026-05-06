/**
 * use-carpool-realtime
 *
 * Worker 3 (fork_motgygqh_0531ff) deliverable for Co-Exist carpool widgets.
 *
 * Subscribes to postgres_changes on `carpool_seats` and `carpool_widgets`
 * filtered to a single carpool, and invalidates the React Query cache so the
 * UI re-fetches when seats are claimed/cancelled or the widget transitions
 * (status: open ↔ full ↔ cancelled ↔ archived).
 *
 * Worker 2's `useCarpool(carpoolId)` should call this hook after its own
 * useQuery setup so realtime + manual fetch share invalidation keys.
 *
 * Pattern mirrors `useChatMessages` realtime block in src/hooks/use-chat.ts
 * (line ~173) and the recent fix in src/pages/chat/chat-room.tsx commit
 * 770fd61 (subscription order vs. initial query). Five-layer verification
 * per ~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md:
 *   1. PRODUCER  - INSERT/UPDATE/DELETE on carpool_seats + carpool_widgets
 *                  (Worker 1's edge functions + RLS-allowed direct mutations)
 *   2. TRIGGER   - Postgres logical replication slot supabase_realtime
 *                  (added by Worker 1's migration:
 *                  ALTER PUBLICATION supabase_realtime ADD TABLE …)
 *   3. BRIDGE    - supabase-js channel `carpool:{id}`
 *   4. LISTENER  - useEffect below
 *   5. SIDE-FX   - queryClient.invalidateQueries on
 *                  ['carpool', carpoolId] + ['carpool-seats', carpoolId]
 *
 * Cleanup mandatory on unmount to prevent leaked channels (carpool widgets
 * appear inline in chat, can mount/unmount rapidly during scrolling).
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'

export function useCarpoolRealtime(carpoolId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!carpoolId) return

    const channel = supabase
      .channel(`carpool:${carpoolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'carpool_seats',
          filter: `carpool_id=eq.${carpoolId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['carpool', carpoolId] })
          queryClient.invalidateQueries({ queryKey: ['carpool-seats', carpoolId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'carpool_widgets',
          filter: `id=eq.${carpoolId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['carpool', carpoolId] })
        },
      )

    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [carpoolId, queryClient])
}
