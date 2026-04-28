import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'
import { REACTION_EMOJIS, type ReactionEmoji } from '@/lib/reactions'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MessageReactionRow {
  id: string
  message_id: string
  collective_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  userReacted: boolean
  userIds: string[]
}

const REACTION_ORDER: Record<string, number> = REACTION_EMOJIS.reduce(
  (acc, e, i) => {
    acc[e] = i
    return acc
  },
  {} as Record<string, number>,
)

function reactionSortValue(emoji: string): number {
  const known = REACTION_ORDER[emoji]
  return known !== undefined ? known : 999
}

/* ------------------------------------------------------------------ */
/*  Query: all reactions for a collective                              */
/* ------------------------------------------------------------------ */
/*
 * One query per collective. Fetches every reaction row visible to the
 * current user. The chat-room view is small enough that this is cheap
 * and lets us aggregate per-message in O(n) on the client without a
 * second round trip per message. Realtime keeps the cache in sync.
 */

export function useCollectiveReactions(collectiveId: string | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['message-reactions', collectiveId],
    queryFn: async (): Promise<MessageReactionRow[]> => {
      if (!collectiveId) return []
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('collective_id', collectiveId)
      if (error) throw error
      return (data ?? []) as MessageReactionRow[]
    },
    enabled: !!collectiveId,
    staleTime: 30 * 1000,
  })

  /* Realtime: keep the cache fresh. INSERT/DELETE both flow through here. */
  useEffect(() => {
    if (!collectiveId) return

    const channel = supabase
      .channel(`reactions:${collectiveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `collective_id=eq.${collectiveId}`,
        },
        (payload) => {
          const row = payload.new as MessageReactionRow
          queryClient.setQueryData<MessageReactionRow[]>(
            ['message-reactions', collectiveId],
            (old) => {
              if (!old) return [row]
              if (old.some((r) => r.id === row.id)) return old
              // Drop any optimistic placeholder for this (message,user,emoji)
              // tuple, then prepend the real row.
              const filtered = old.filter(
                (r) =>
                  !(
                    r.id.startsWith('optimistic-') &&
                    r.message_id === row.message_id &&
                    r.user_id === row.user_id &&
                    r.emoji === row.emoji
                  ),
              )
              return [row, ...filtered]
            },
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `collective_id=eq.${collectiveId}`,
        },
        (payload) => {
          const oldRow = payload.old as Partial<MessageReactionRow>
          if (!oldRow.id) return
          queryClient.setQueryData<MessageReactionRow[]>(
            ['message-reactions', collectiveId],
            (old) => (old ? old.filter((r) => r.id !== oldRow.id) : old),
          )
        },
      )

    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [collectiveId, queryClient, user?.id])

  return query
}

/* ------------------------------------------------------------------ */
/*  Selector: reactions grouped per message                            */
/* ------------------------------------------------------------------ */

export function useMessageReactions(
  messageId: string | undefined,
  collectiveId: string | undefined,
): ReactionGroup[] {
  const { data: rows } = useCollectiveReactions(collectiveId)
  const { user } = useAuth()

  return useMemo(() => {
    if (!messageId || !rows) return []
    const buckets = new Map<string, ReactionGroup>()
    for (const r of rows) {
      if (r.message_id !== messageId) continue
      const existing = buckets.get(r.emoji)
      if (existing) {
        existing.count += 1
        existing.userIds.push(r.user_id)
        if (r.user_id === user?.id) existing.userReacted = true
      } else {
        buckets.set(r.emoji, {
          emoji: r.emoji,
          count: 1,
          userReacted: r.user_id === user?.id,
          userIds: [r.user_id],
        })
      }
    }
    return Array.from(buckets.values()).sort(
      (a, b) => reactionSortValue(a.emoji) - reactionSortValue(b.emoji),
    )
  }, [rows, messageId, user?.id])
}

/* ------------------------------------------------------------------ */
/*  Mutation: toggle a reaction                                        */
/* ------------------------------------------------------------------ */

interface ToggleInput {
  messageId: string
  collectiveId: string
  emoji: ReactionEmoji
}

export function useToggleReaction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, collectiveId, emoji }: ToggleInput) => {
      if (!user) throw new Error('Not authenticated')

      // Look at the current cache to decide add vs remove. The cache is
      // realtime-backed, so this matches what the server will accept.
      const cache =
        queryClient.getQueryData<MessageReactionRow[]>([
          'message-reactions',
          collectiveId,
        ]) ?? []
      const existing = cache.find(
        (r) =>
          r.message_id === messageId &&
          r.user_id === user.id &&
          r.emoji === emoji &&
          !r.id.startsWith('optimistic-'),
      )

      if (existing) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existing.id)
        if (error) throw error
        return { mode: 'removed' as const, messageId, emoji }
      }

      const { error } = await supabase.from('message_reactions').insert({
        message_id: messageId,
        collective_id: collectiveId,
        user_id: user.id,
        emoji,
      })
      if (error) {
        // Unique-constraint races: if the server already has the row,
        // treat the toggle as a no-op so the optimistic state stays.
        const code = (error as { code?: string }).code
        if (code === '23505') return { mode: 'added' as const, messageId, emoji }
        throw error
      }
      return { mode: 'added' as const, messageId, emoji }
    },

    /* Optimistic: flip the chip immediately. Realtime will reconcile. */
    onMutate: async ({ messageId, collectiveId, emoji }) => {
      if (!user) return
      await queryClient.cancelQueries({
        queryKey: ['message-reactions', collectiveId],
      })

      const previous =
        queryClient.getQueryData<MessageReactionRow[]>([
          'message-reactions',
          collectiveId,
        ]) ?? []

      const userExisting = previous.find(
        (r) =>
          r.message_id === messageId &&
          r.user_id === user.id &&
          r.emoji === emoji,
      )

      let next: MessageReactionRow[]
      if (userExisting) {
        next = previous.filter((r) => r.id !== userExisting.id)
      } else {
        const optimisticRow: MessageReactionRow = {
          id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          message_id: messageId,
          collective_id: collectiveId,
          user_id: user.id,
          emoji,
          created_at: new Date().toISOString(),
        }
        next = [optimisticRow, ...previous]
      }

      queryClient.setQueryData(['message-reactions', collectiveId], next)
      return { previous }
    },

    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['message-reactions', collectiveId],
          context.previous,
        )
      }
    },

    onSettled: (_data, _err, { collectiveId }) => {
      // Realtime usually beats this, but invalidate as a safety net for
      // dropped channels so the UI eventually reconciles.
      queryClient.invalidateQueries({
        queryKey: ['message-reactions', collectiveId],
      })
    },
  })
}
