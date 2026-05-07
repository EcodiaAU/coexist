import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'
import type { Tables } from '@/types/database.types'

type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StaffChannel {
  id: string
  type: 'staff_collective' | 'staff_state' | 'staff_national'
  collective_id: string | null
  state: string | null
  name: string
  created_at: string
}

export interface ChannelMessageWithSender {
  id: string
  channel_id: string
  collective_id: string | null
  user_id: string | null
  content: string | null
  image_url: string | null
  voice_url: string | null
  video_url: string | null
  reply_to_id: string | null
  is_pinned: boolean
  is_deleted: boolean
  created_at: string
  message_type?: 'text' | 'image' | 'voice' | 'video' | 'poll' | 'announcement' | 'system' | 'html'
  poll_id?: string | null
  announcement_id?: string | null
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
  reply_message: { id: string; content: string | null; user_id: string | null } | null
  _optimistic?: boolean
  _optimisticId?: string
  _confirmed?: boolean
}

/* ------------------------------------------------------------------ */
/*  useMyStaffChannels - channels the user is a member of              */
/* ------------------------------------------------------------------ */

export function useMyStaffChannels() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-staff-channels', user?.id],
    queryFn: async () => {
      if (!user) return []

      const { data, error } = await supabase
        .from('chat_channel_members')
        .select('channel_id, chat_channels(id, type, collective_id, state, name, created_at)')
        .eq('user_id', user.id)

      if (error) throw error

      return (data ?? [])
        .map((row: Record<string, unknown>) => row.chat_channels as StaffChannel)
        .filter(Boolean)
        // Hide carpool_breakout channels from the main collective/staff chat list.
        // Carpool breakouts are surfaced under the event detail page's
        // "Coordination" subsection instead. Worker 3 (fork_motgygqh_0531ff).
        .filter((c: StaffChannel) => (c.type as string) !== 'carpool_breakout')
        .sort((a: StaffChannel, b: StaffChannel) => {
          // National first, then state, then collective
          const typeOrder = { staff_national: 0, staff_state: 1, staff_collective: 2 }
          return (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3)
        })
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useChannelMessages - paginated messages for a channel              */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 40

export function useChannelMessages(channelId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: ['channel-messages', channelId],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!channelId) return []

      let q = supabase
        .from('chat_messages')
        .select(`
          *,
          profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)
        `)
        .eq('channel_id', channelId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (pageParam) {
        q = q.lt('created_at', pageParam)
      }

      const { data, error } = await q
      if (error) throw error

      const messages = (data ?? []) as unknown as ChannelMessageWithSender[]

      // Resolve reply_message client-side (self-referencing FK not in PostgREST cache)
      // Replies to deleted parents resolve to null so the reply-context preview also disappears.
      const replyIds = messages
        .map((m) => m.reply_to_id)
        .filter((id): id is string => !!id)

      if (replyIds.length > 0) {
        const { data: replies } = await supabase
          .from('chat_messages')
          .select('id, content, user_id')
          .in('id', replyIds)
          .eq('is_deleted', false)

        const replyMap = new Map((replies ?? []).map((r: Record<string, unknown>) => [r.id as string, r as unknown as { id: string; content: string | null; user_id: string | null }]))
        for (const msg of messages) {
          msg.reply_message = msg.reply_to_id ? (replyMap.get(msg.reply_to_id) ?? null) : null
        }
      } else {
        for (const msg of messages) {
          msg.reply_message = null
        }
      }

      return messages
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return lastPage[lastPage.length - 1]?.created_at
    },
    enabled: !!channelId && !!user,
    staleTime: 10 * 1000,
  })

  // Realtime subscription for new messages
  useEffect(() => {
    if (!channelId) return

    const channel = supabase
      .channel(`channel-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChannelMessageWithSender

          // Fetch full message with profile
          const { data } = await supabase
            .from('chat_messages')
            .select(`*, profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)`)
            .eq('id', newMsg.id)
            .single()

          if (!data) return

          const fullMsg = data as unknown as ChannelMessageWithSender
          fullMsg.reply_message = null

          queryClient.setQueryData<{ pages: ChannelMessageWithSender[][]; pageParams: unknown[] }>(
            ['channel-messages', channelId],
            (old) => {
              if (!old) return old
              let firstPage = old.pages[0] ?? []

              // Replace optimistic message
              const optimisticIdx = firstPage.findIndex(
                (m) => m._optimistic && m.user_id === fullMsg.user_id && m.content === fullMsg.content,
              )

              if (optimisticIdx !== -1) {
                firstPage = [...firstPage]
                firstPage[optimisticIdx] = { ...fullMsg, _optimistic: false, _confirmed: true }
              } else if (!firstPage.some((m) => m.id === fullMsg.id)) {
                firstPage = [fullMsg, ...firstPage]
              }

              return { ...old, pages: [firstPage, ...old.pages.slice(1)] }
            },
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const { profiles: _profiles, reply_message: _reply, ...columnUpdates } = payload.new as Record<string, unknown>
          const becameDeleted = (payload.new as Record<string, unknown>).is_deleted === true
          const targetId = payload.new.id
          queryClient.setQueryData<{ pages: ChannelMessageWithSender[][]; pageParams: unknown[] }>(
            ['channel-messages', channelId],
            (old) => {
              if (!old) return old
              if (becameDeleted) {
                // Soft-delete arrived via realtime: remove from local cache so it
                // disappears from the channel (no "Message removed" placeholder).
                return {
                  ...old,
                  pages: old.pages.map((page) =>
                    page
                      .filter((msg) => msg.id !== targetId)
                      .map((msg) =>
                        msg.reply_message?.id === targetId
                          ? { ...msg, reply_message: null }
                          : msg,
                      ),
                  ),
                }
              }
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((msg) =>
                    msg.id === targetId ? { ...msg, ...columnUpdates } : msg,
                  ),
                ),
              }
            },
          )
        },
      )


    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [channelId, queryClient])

  // Flatten pages into a single array (pages are newest-first, reverse for display)
  const messages = useMemo(
    () => query.data?.pages.flat().reverse() ?? [],
    [query.data],
  )

  return {
    ...query,
    messages,
  }
}

/* ------------------------------------------------------------------ */
/*  useSendChannelMessage - send a message to a channel                */
/* ------------------------------------------------------------------ */

export function useSendChannelMessage() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      channelId,
      collectiveId,
      content,
      imageUrl,
      replyToId,
      messageType,
    }: {
      channelId: string
      collectiveId?: string | null
      content?: string
      imageUrl?: string
      replyToId?: string
      messageType?: string
    }) => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: channelId,
          collective_id: collectiveId || null,
          user_id: user.id,
          content: content || null,
          image_url: imageUrl || null,
          reply_to_id: replyToId || null,
          message_type: messageType || 'text',
        })

      if (error) throw error
    },
    onMutate: async ({ channelId, collectiveId, content, imageUrl, replyToId, messageType }) => {
      await queryClient.cancelQueries({ queryKey: ['channel-messages', channelId] })

      const optimisticMessage: ChannelMessageWithSender = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channel_id: channelId,
        collective_id: collectiveId || null,
        user_id: user!.id,
        content: content || null,
        image_url: imageUrl || null,
        voice_url: null,
        video_url: null,
        reply_to_id: replyToId || null,
        message_type: (messageType ?? 'text') as ChannelMessageWithSender['message_type'],
        is_pinned: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        profiles: { id: user!.id, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
        reply_message: null,
        _optimistic: true,
      }

      queryClient.setQueryData<{ pages: ChannelMessageWithSender[][]; pageParams: unknown[] }>(
        ['channel-messages', channelId],
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: [[optimisticMessage, ...old.pages[0]], ...old.pages.slice(1)],
          }
        },
      )
    },
    onError: (_err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['channel-messages', variables.channelId] })
    },
    onSuccess: (_data, variables) => {
      // Send push notification to other channel members (fire-and-forget)
      if (user) {
        const senderName = profile?.display_name ?? 'Someone'
        const pushBody = variables.imageUrl
          ? 'Sent a photo'
          : variables.content?.slice(0, 200) ?? 'Sent a message'

        supabase
          .from('chat_channel_members')
          .select('user_id')
          .eq('channel_id', variables.channelId)
          .then(({ data: members }) => {
            const recipientIds = (members ?? [])
              .map((m: { user_id: string }) => m.user_id)
              .filter((id: string) => id !== user.id)

            if (recipientIds.length > 0) {
              supabase.functions.invoke('send-push', {
                body: {
                  userIds: recipientIds,
                  title: `${senderName} (Staff)`,
                  body: pushBody,
                  data: {
                    type: 'chat_messages',
                    channel_id: variables.channelId,
                    collective_id: variables.collectiveId ?? '',
                  },
                },
              })
            }
          })
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['channel-messages', variables.channelId] })
      queryClient.invalidateQueries({ queryKey: ['channel-unread'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useDeleteChannelMessage - soft delete (own or moderator)           */
/* ------------------------------------------------------------------ */

export function useDeleteChannelMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; channelId: string }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_deleted: true })
        .eq('id', messageId)
      if (error) throw error
    },
    onMutate: async ({ messageId, channelId }) => {
      await queryClient.cancelQueries({ queryKey: ['channel-messages', channelId] })
      const previous = queryClient.getQueryData(['channel-messages', channelId])
      queryClient.setQueryData<{ pages: ChannelMessageWithSender[][]; pageParams: unknown[] }>(
        ['channel-messages', channelId],
        (old) => {
          if (!old) return old
          // Optimistic delete: remove the message from local cache entirely so
          // it disappears from the channel (no "Message removed" placeholder).
          // Also clear any reply_message preview pointing at the deleted id.
          return {
            ...old,
            pages: old.pages.map((page) =>
              page
                .filter((msg) => msg.id !== messageId)
                .map((msg) =>
                  msg.reply_message?.id === messageId ? { ...msg, reply_message: null } : msg,
                ),
            ),
          }
        },
      )
      return { previous }
    },
    onError: (_err, { channelId }, context) => {
      if (context?.previous) queryClient.setQueryData(['channel-messages', channelId], context.previous)
    },
    onSettled: (_data, _err, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  usePinChannelMessage - pin / unpin (moderator)                     */
/* ------------------------------------------------------------------ */

export function usePinChannelMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, pinned }: { messageId: string; channelId: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_pinned: pinned })
        .eq('id', messageId)
      if (error) throw error
    },
    onMutate: async ({ messageId, channelId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ['channel-messages', channelId] })
      const previous = queryClient.getQueryData(['channel-messages', channelId])
      queryClient.setQueryData<{ pages: ChannelMessageWithSender[][]; pageParams: unknown[] }>(
        ['channel-messages', channelId],
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((msg) => (msg.id === messageId ? { ...msg, is_pinned: pinned } : msg)),
            ),
          }
        },
      )
      return { previous }
    },
    onError: (_err, { channelId }, context) => {
      if (context?.previous) queryClient.setQueryData(['channel-messages', channelId], context.previous)
    },
    onSettled: (_data, _err, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useChannelUnreadCounts - unread counts per channel                 */
/* ------------------------------------------------------------------ */

export function useChannelUnreadCounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['channel-unread', user?.id],
    queryFn: async () => {
      if (!user) return {}

      // Get user's channel memberships with collective_id
      const { data: memberships } = await supabase
        .from('chat_channel_members')
        .select('channel_id, chat_channels(collective_id)')
        .eq('user_id', user.id)

      if (!memberships?.length) return {}

      // Build channel → readKey map (use collective_id if available, channel_id as fallback)
      const channelToCollective = new Map<string, string>()
      for (const m of memberships as unknown as { channel_id: string; chat_channels: { collective_id: string | null } | null }[]) {
        channelToCollective.set(m.channel_id, m.chat_channels?.collective_id || m.channel_id)
      }

      // Get read receipts by collective_id (that's the unique key on chat_read_receipts)
      const collectiveIds = [...new Set(channelToCollective.values())]
      const { data: receipts } = await supabase
        .from('chat_read_receipts')
        .select('collective_id, last_read_at')
        .eq('user_id', user.id)
        .in('collective_id', collectiveIds)

      const receiptMap = new Map<string, string>()
      for (const r of (receipts ?? []) as unknown as { collective_id: string; last_read_at: string }[]) {
        receiptMap.set(r.collective_id, r.last_read_at)
      }

      // Count unread messages per channel (parallel)
      const results = await Promise.all(
        [...channelToCollective.entries()].map(async ([chId, collectiveId]) => {
          const lastRead = receiptMap.get(collectiveId)
          let q = supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('channel_id', chId)
            .eq('is_deleted', false)
            .neq('user_id', user.id)

          if (lastRead) {
            q = q.gt('created_at', lastRead)
          }

          const { count } = await q
          return [chId, count ?? 0] as const
        }),
      )

      const counts: Record<string, number> = {}
      for (const [chId, count] of results) {
        if (count > 0) counts[chId] = count
      }
      return counts
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useMarkChannelRead - update read receipt for a channel             */
/* ------------------------------------------------------------------ */

export function useMarkChannelRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ channelId, collectiveId }: { channelId: string; collectiveId?: string | null }) => {
      if (!user) return

      // Use collectiveId if available, otherwise use channelId as the identifier
      // so that channels without a collective_id still track read state
      const readKey = collectiveId || channelId

      await supabase
        .from('chat_read_receipts')
        .upsert({
          collective_id: readKey,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        }, { onConflict: 'collective_id,user_id' })
    },
    onMutate: async ({ channelId }) => {
      await queryClient.cancelQueries({ queryKey: ['channel-unread'] })
      const previous = queryClient.getQueryData<Record<string, number>>(['channel-unread', user?.id])
      queryClient.setQueryData<Record<string, number>>(['channel-unread', user?.id], (old) => {
        if (!old) return old
        const updated = { ...old }
        delete updated[channelId]
        return updated
      })
      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['channel-unread', user?.id], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-unread'] })
    },
  })
}
