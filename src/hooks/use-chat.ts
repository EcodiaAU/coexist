import { useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { MAX_MESSAGE_LENGTH as _IMPORTED_MAX_LEN } from '@/lib/validation'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'
import type { Tables, Json } from '@/types/database.types'

type ChatMessage = Tables<'chat_messages'>
type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessageWithSender extends Omit<ChatMessage, 'message_type'> {
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
  reply_message: Pick<ChatMessage, 'id' | 'content' | 'user_id'> | null
  sender_role?: string
  message_type?: 'text' | 'image' | 'voice' | 'video' | 'poll' | 'announcement' | 'system' | 'html' | null
  /** Client-only: optimistic message not yet confirmed by server */
  _optimistic?: boolean
  _optimisticId?: string
  /** Client-only: was optimistic, now confirmed - skip entrance animation */
  _confirmed?: boolean
}

interface SendMessageInput {
  collectiveId: string
  content?: string
  imageUrl?: string
  voiceUrl?: string
  videoUrl?: string
  replyToId?: string
  messageType?: string
  pollId?: string
  announcementId?: string
}

export interface ChatPoll {
  id: string
  collective_id: string
  created_by: string
  question: string
  options: { id: string; text: string }[]
  allow_multiple: boolean
  anonymous: boolean
  closes_at: string | null
  is_closed: boolean
  created_at: string
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
  votes?: ChatPollVote[]
  _vote_counts?: Record<string, number>
  _total_votes?: number
  _user_votes?: string[]
}

export interface ChatPollVote {
  id: string
  poll_id: string
  user_id: string
  option_id: string
  created_at: string
}

export interface ChatAnnouncement {
  id: string
  collective_id: string
  created_by: string
  type: 'announcement' | 'event_invite' | 'rsvp' | 'checklist'
  title: string
  body: string | null
  metadata: Record<string, unknown>
  expires_at: string | null
  is_active: boolean
  created_at: string
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
  responses?: ChatAnnouncementResponse[]
}

export interface ChatAnnouncementResponse {
  id: string
  announcement_id: string
  user_id: string
  response: string
  created_at: string
  /** Profile populated by useAnnouncementDetail's secondary join. Optional
   *  because optimistic responses in onMutate don't have it yet. */
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

export interface BroadcastLogEntry {
  id: string
  collective_id: string
  sent_by: string
  type: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
  recipient_count: number
  created_at: string
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

const PAGE_SIZE = 40

/* ------------------------------------------------------------------ */
/*  Messages query (infinite scroll) + realtime                        */
/* ------------------------------------------------------------------ */

export function useChatMessages(collectiveId: string | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const query = useInfiniteQuery({
    queryKey: ['chat-messages', collectiveId],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!collectiveId) throw new Error('No collective ID')

      let q = supabase
        .from('chat_messages')
        .select(`
          *,
          profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)
        `)
        .eq('collective_id', collectiveId)
        .is('channel_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (pageParam) {
        q = q.lt('created_at', pageParam)
      }

      const { data, error } = await q
      if (error) throw error

      const messages = (data ?? []) as unknown as ChatMessageWithSender[]

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

        const replyMap = new Map((replies ?? []).map((r) => [r.id, r]))
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
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return lastPage[lastPage.length - 1]?.created_at
    },
    initialPageParam: null as string | null,
    enabled: !!collectiveId,
    staleTime: 30 * 1000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!collectiveId) return

    const channel = supabase
      .channel(`chat:${collectiveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `collective_id=eq.${collectiveId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessageWithSender

          // Skip messages that belong to a staff channel (they have a channel_id)
          if ((newMsg as unknown as Record<string, unknown>).channel_id) return

          // Fetch full message with profile join outside of setQueryData to avoid race conditions
          const { data } = await supabase
            .from('chat_messages')
            .select(`
              *,
              profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)
            `)
            .eq('id', newMsg.id)
            .single()

          if (!data) return

          // Resolve reply_message if needed
          if ((data as Record<string, unknown>).reply_to_id) {
            const { data: reply } = await supabase
              .from('chat_messages')
              .select('id, content, user_id')
              .eq('id', (data as Record<string, unknown>).reply_to_id as string)
              .single();
            (data as Record<string, unknown>).reply_message = reply ?? null
          } else {
            (data as Record<string, unknown>).reply_message = null
          }

          const fullMsg = data as unknown as ChatMessageWithSender

          queryClient.setQueryData(
            ['chat-messages', collectiveId],
            (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
              if (!old) return old

              let firstPage = old.pages[0] ?? []

              // Replace optimistic message from same user with matching content
              const optimisticIdx = firstPage.findIndex(
                (m) =>
                  m._optimistic &&
                  m.user_id === fullMsg.user_id &&
                  m.content === fullMsg.content,
              )

              if (optimisticIdx !== -1) {
                firstPage = [...firstPage]
                firstPage[optimisticIdx] = {
                  ...fullMsg,
                  _optimistic: false,
                  _optimisticId: undefined,
                  _confirmed: true,
                } as ChatMessageWithSender
              } else if (!firstPage.some((m) => m.id === fullMsg.id)) {
                // New message from someone else - prepend
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
          filter: `collective_id=eq.${collectiveId}`,
        },
        (payload) => {
          // Skip channel messages
          if ((payload.new as Record<string, unknown>).channel_id) return

          const { profiles: _profiles, reply_message: _reply, ...columnUpdates } = payload.new as Record<string, unknown>
          const becameDeleted = (payload.new as Record<string, unknown>).is_deleted === true
          const targetId = payload.new.id
          queryClient.setQueryData(
            ['chat-messages', collectiveId],
            (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
              if (!old) return old
              if (becameDeleted) {
                // Soft-delete arrived via realtime: remove from local cache so it
                // disappears from the thread (no "Message removed" placeholder).
                // Also clear reply_message references that pointed at this id.
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
      // Subscribe with automatic reconnect instead of bare .subscribe()
    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [collectiveId, queryClient, user?.id])

  return query
}

/* ------------------------------------------------------------------ */
/*  Send message (with optimistic update)                              */
/* ------------------------------------------------------------------ */

const MAX_MESSAGE_LENGTH = 4000
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 5

export function useSendMessage() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const sendTimestamps = useRef<number[]>([])

  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!user) throw new Error('Not authenticated')

      // Client-side rate limiting
      const now = Date.now()
      sendTimestamps.current = sendTimestamps.current.filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS,
      )
      if (sendTimestamps.current.length >= RATE_LIMIT_MAX) {
        throw new Error('Slow down! You\'re sending messages too quickly.')
      }
      sendTimestamps.current.push(now)

      const isHtml = input.messageType === 'html'
      if (!isHtml && input.content && input.content.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`)
      }

      const { error, data } = await supabase
        .from('chat_messages')
        .insert({
          collective_id: input.collectiveId,
          user_id: user.id,
          content: isHtml ? (input.content ?? null) : (input.content?.slice(0, MAX_MESSAGE_LENGTH) ?? null),
          image_url: input.imageUrl ?? null,
          voice_url: input.voiceUrl ?? null,
          video_url: input.videoUrl ?? null,
          reply_to_id: input.replyToId ?? null,
          message_type: input.messageType ?? 'text',
          poll_id: input.pollId ?? null,
          announcement_id: input.announcementId ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    // Optimistic update - show message immediately
    onMutate: async (input) => {
      if (!user) return

      await queryClient.cancelQueries({ queryKey: ['chat-messages', input.collectiveId] })

      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimisticMessage: ChatMessageWithSender = {
        id: optimisticId,
        collective_id: input.collectiveId,
        channel_id: null,
        user_id: user.id,
        content: input.content ?? null,
        image_url: input.imageUrl ?? null,
        voice_url: input.voiceUrl ?? null,
        video_url: input.videoUrl ?? null,
        reply_to_id: input.replyToId ?? null,
        is_pinned: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_type: (input.messageType ?? 'text') as ChatMessageWithSender['message_type'],
        poll_id: input.pollId ?? null,
        announcement_id: input.announcementId ?? null,
        profiles: {
          id: user.id,
          display_name: profile?.display_name ?? 'You',
          avatar_url: profile?.avatar_url ?? null,
        },
        reply_message: null,
        _optimistic: true,
        _optimisticId: optimisticId,
      }

      queryClient.setQueryData(
        ['chat-messages', input.collectiveId],
        (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
          if (!old) return old
          const firstPage = [optimisticMessage, ...(old.pages[0] ?? [])]
          return { ...old, pages: [firstPage, ...old.pages.slice(1)] }
        },
      )

      return { optimisticId }
    },
    onSuccess: async (data, input) => {
      // Update read receipt
      if (user) {
        const { error: receiptError } = await supabase
          .from('chat_read_receipts')
          .upsert({
            collective_id: input.collectiveId,
            user_id: user.id,
            last_read_at: new Date().toISOString(),
          }, { onConflict: 'collective_id,user_id' })
        if (receiptError) console.error('[chat] Failed to update read receipt:', receiptError)

        // Send push notification to other members (fire-and-forget, non-blocking)
        const senderName = profile?.display_name ?? 'Someone'
        const messageType = input.messageType ?? 'text'

        // Determine notification type and body
        let pushType = 'chat_messages'
        let pushBody = input.content?.slice(0, 200) ?? ''
        const pushTitle = senderName

        if (input.replyToId) {
          pushType = 'chat_reply'
          pushBody = `Replied: ${pushBody || 'a message'}`
        } else if (messageType === 'image' || input.imageUrl) {
          pushType = 'chat_image'
          pushBody = 'Sent a photo'
        } else if (messageType === 'voice' || input.voiceUrl) {
          pushBody = 'Sent a voice message'
        } else if (messageType === 'video' || input.videoUrl) {
          pushBody = 'Sent a video'
        } else if (messageType === 'poll') {
          pushType = 'chat_poll'
          pushBody = 'Created a poll'
        } else if (messageType === 'announcement') {
          pushType = 'chat_announcement'
          pushBody = 'Posted an announcement'
        }

        // Fetch members and send push (background, non-blocking)
        supabase
          .from('collective_members')
          .select('user_id')
          .eq('collective_id', input.collectiveId)
          .eq('status', 'active')
          .then(({ data: members }) => {
            const recipientIds = (members ?? [])
              .map((m: { user_id: string }) => m.user_id)
              .filter((id: string) => id !== user.id)

            if (recipientIds.length > 0) {
              supabase.functions.invoke('send-push', {
                body: {
                  userIds: recipientIds,
                  title: pushTitle,
                  body: pushBody,
                  data: {
                    type: pushType,
                    collective_id: input.collectiveId,
                  },
                },
              })
            }
          })
      }
    },
    onError: (_err, input, context) => {
      // Remove optimistic message on error
      if (context?.optimisticId) {
        queryClient.setQueryData(
          ['chat-messages', input.collectiveId],
          (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) =>
                page.filter((m) => m._optimisticId !== context.optimisticId),
              ),
            }
          },
        )
      }
    },
    onSettled: (_data, _err, input) => {
      // Sender just read the latest message - reset their unread count
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Edit message                                                       */
/* ------------------------------------------------------------------ */

export function useEditMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content, collectiveId }: { messageId: string; content: string; collectiveId: string }) => {
      if (content.length > MAX_MESSAGE_LENGTH) throw new Error('Message too long')
      const { error } = await supabase
        .from('chat_messages')
        .update({ content })
        .eq('id', messageId)
      if (error) throw error
      return collectiveId
    },
    onMutate: async ({ messageId, content, collectiveId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-messages', collectiveId] })
      const previous = queryClient.getQueryData(['chat-messages', collectiveId])
      queryClient.setQueryData(
        ['chat-messages', collectiveId],
        (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
          if (!old) return old
          return { ...old, pages: old.pages.map(page => page.map(msg => msg.id === messageId ? { ...msg, content } : msg)) }
        },
      )
      return { previous }
    },
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['chat-messages', collectiveId], context.previous)
    },
    onSettled: (collectiveId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Delete message (soft delete - moderator)                           */
/* ------------------------------------------------------------------ */

export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, collectiveId }: { messageId: string; collectiveId: string }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_deleted: true })
        .eq('id', messageId)
      if (error) throw error
      return collectiveId
    },
    onMutate: async ({ messageId, collectiveId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-messages', collectiveId] })
      const previous = queryClient.getQueryData(['chat-messages', collectiveId])
      queryClient.setQueryData(
        ['chat-messages', collectiveId],
        (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
          if (!old) return old
          // Optimistic delete: remove the message from local cache entirely so
          // it disappears from the thread (no "Message removed" placeholder).
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
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['chat-messages', collectiveId], context.previous)
    },
    onSettled: (collectiveId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Pin / unpin message (moderator)                                    */
/* ------------------------------------------------------------------ */

export function usePinMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, collectiveId, pinned }: { messageId: string; collectiveId: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_pinned: pinned })
        .eq('id', messageId)
      if (error) throw error
      return collectiveId
    },
    onMutate: async ({ messageId, collectiveId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-messages', collectiveId] })
      const previous = queryClient.getQueryData(['chat-messages', collectiveId])
      queryClient.setQueryData(
        ['chat-messages', collectiveId],
        (old: { pages: ChatMessageWithSender[][]; pageParams: (string | null)[] } | undefined) => {
          if (!old) return old
          return { ...old, pages: old.pages.map(page => page.map(msg => msg.id === messageId ? { ...msg, is_pinned: pinned } : msg)) }
        },
      )
      return { previous }
    },
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['chat-messages', collectiveId], context.previous)
    },
    onSettled: (collectiveId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Pinned messages                                                    */
/* ------------------------------------------------------------------ */

export function usePinnedMessages(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['pinned-messages', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)
        `)
        .eq('collective_id', collectiveId)
        .eq('is_pinned', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!collectiveId,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Read receipts                                                      */
/* ------------------------------------------------------------------ */

export function useMarkChatRead(collectiveId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useCallback(async () => {
    if (!user || !collectiveId) return
    const { error } = await supabase
      .from('chat_read_receipts')
      .upsert({
        collective_id: collectiveId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'collective_id,user_id' })
    if (error) {
      console.error('[chat] Failed to mark chat read:', error)
      return
    }
    // Invalidate unread counts so the tab badge updates immediately
    queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
  }, [user, collectiveId, queryClient])
}

/* ------------------------------------------------------------------ */
/*  Unread count per collective                                        */
/* ------------------------------------------------------------------ */

export function useUnreadCounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['unread-counts', user?.id],
    queryFn: async () => {
      if (!user) return {}

      const { data: memberships } = await supabase
        .from('collective_members')
        .select('collective_id')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (!memberships?.length) return {}

      const { data: receipts } = await supabase
        .from('chat_read_receipts')
        .select('collective_id, last_read_at')
        .eq('user_id', user.id)

      const receiptMap = new Map(receipts?.map((r) => [r.collective_id, r.last_read_at]) ?? [])

      // Run all count queries in parallel instead of sequentially
      const results = await Promise.all(
        memberships.map(async (m) => {
          const lastRead = receiptMap.get(m.collective_id)
          let query = supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('collective_id', m.collective_id)
            .is('channel_id', null)
            .eq('is_deleted', false)
            .neq('user_id', user.id)

          if (lastRead) {
            query = query.gt('created_at', lastRead)
          }

          const { count } = await query
          return [m.collective_id, count ?? 0] as const
        }),
      )

      return Object.fromEntries(results)
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Member roles for chat badges                                       */
/* ------------------------------------------------------------------ */

export function useCollectiveMemberRoles(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-member-roles', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const { data, error } = await supabase
        .from('collective_members')
        .select('user_id, role')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')
        .in('role', ['leader', 'co_leader', 'assist_leader'])
      if (error) throw error
      const map = new Map<string, string>()
      for (const m of data ?? []) {
        const label = m.role === 'leader' ? 'Leader' : m.role === 'co_leader' ? 'Co-Leader' : 'Assistant Leader'
        map.set(m.user_id, label)
      }
      return map
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Polls                                                              */
/* ------------------------------------------------------------------ */

export function useCreatePoll() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const sendMessage = useSendMessage()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      question,
      options,
      allowMultiple = false,
      anonymous = false,
      closesAt,
    }: {
      collectiveId: string
      question: string
      options: string[]
      allowMultiple?: boolean
      anonymous?: boolean
      closesAt?: string
    }) => {
      if (!user) throw new Error('Not authenticated')

      const pollOptions = options.map((text, i) => ({
        id: `opt-${Date.now()}-${i}`,
        text,
      }))

      const { data: poll, error } = await supabase
        .from('chat_polls')
        .insert({
          collective_id: collectiveId,
          created_by: user.id,
          question,
          options: pollOptions,
          allow_multiple: allowMultiple,
          anonymous,
          closes_at: closesAt ?? null,
        })
        .select()
        .single()

      if (error) throw error

      // Send a poll message in the chat
      await sendMessage.mutateAsync({
        collectiveId,
        content: question,
        messageType: 'poll',
        pollId: (poll as unknown as { id: string }).id,
      })

      return poll
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['chat-polls', input.collectiveId] })
    },
  })
}

export function usePollVote() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ pollId, optionId, collectiveId }: { pollId: string; optionId: string; collectiveId: string }) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('poll-vote', {
          pollId,
          userId: user.id,
          optionIds: [optionId],
          allowMultiple: true,
        })
        return { pollId, collectiveId }
      }

      const { error } = await supabase
        .from('chat_poll_votes')
        .upsert({
          poll_id: pollId,
          user_id: user.id,
          option_id: optionId,
        }, { onConflict: 'poll_id,user_id,option_id' })

      if (error) throw error
      return { pollId, collectiveId }
    },
    onMutate: async ({ pollId, optionId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-poll', pollId] })
      const previous = queryClient.getQueryData<ChatPoll>(['chat-poll', pollId])
      queryClient.setQueryData<ChatPoll>(['chat-poll', pollId], (old) => {
        if (!old) return old
        const counts = { ...(old._vote_counts ?? {}) }
        counts[optionId] = (counts[optionId] ?? 0) + 1
        const userVotes = [...(old._user_votes ?? []), optionId]
        return { ...old, _vote_counts: counts, _user_votes: userVotes, _total_votes: (old._total_votes ?? 0) + (old._user_votes?.length ? 0 : 1) }
      })
      return { previous }
    },
    onError: (_err, { pollId }, context) => {
      if (!isOffline && context?.previous) queryClient.setQueryData(['chat-poll', pollId], context.previous)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Vote saved offline - will sync when back online')
    },
    onSettled: (result) => {
      if (isOffline) return
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['chat-poll', result.pollId] })
        queryClient.invalidateQueries({ queryKey: ['chat-polls', result.collectiveId] })
      }
    },
  })
}

export function useRemovePollVote() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pollId, optionId, collectiveId }: { pollId: string; optionId: string; collectiveId: string }) => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('chat_poll_votes')
        .delete()
        .eq('poll_id', pollId)
        .eq('user_id', user.id)
        .eq('option_id', optionId)

      if (error) throw error
      return { pollId, collectiveId }
    },
    onMutate: async ({ pollId, optionId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-poll', pollId] })
      const previous = queryClient.getQueryData<ChatPoll>(['chat-poll', pollId])
      queryClient.setQueryData<ChatPoll>(['chat-poll', pollId], (old) => {
        if (!old) return old
        const counts = { ...(old._vote_counts ?? {}) }
        counts[optionId] = Math.max(0, (counts[optionId] ?? 0) - 1)
        const userVotes = (old._user_votes ?? []).filter((v) => v !== optionId)
        return { ...old, _vote_counts: counts, _user_votes: userVotes, _total_votes: Math.max(0, (old._total_votes ?? 0) - (userVotes.length === 0 ? 1 : 0)) }
      })
      return { previous }
    },
    onError: (_err, { pollId }, context) => {
      if (context?.previous) queryClient.setQueryData(['chat-poll', pollId], context.previous)
    },
    onSettled: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['chat-poll', result.pollId] })
        queryClient.invalidateQueries({ queryKey: ['chat-polls', result.collectiveId] })
      }
    },
  })
}

export function usePollDetail(pollId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['chat-poll', pollId],
    queryFn: async () => {
      if (!pollId) throw new Error('No poll ID')

      const { data: poll, error } = await supabase
        .from('chat_polls')
        .select(`
          *,
          profiles!chat_polls_created_by_fkey(id, display_name, avatar_url)
        `)
        .eq('id', pollId)
        .single()

      if (error) throw error

      // Get vote counts
      const { data: votes } = await supabase
        .from('chat_poll_votes')
        .select('option_id, user_id')
        .eq('poll_id', pollId)

      const voteCounts: Record<string, number> = {}
      const userVotes: string[] = []
      const totalVoters = new Set<string>()

      for (const v of (votes ?? [])) {
        voteCounts[v.option_id] = (voteCounts[v.option_id] ?? 0) + 1
        totalVoters.add(v.user_id)
        if (v.user_id === user?.id) {
          userVotes.push(v.option_id)
        }
      }

      return {
        ...poll,
        _vote_counts: voteCounts,
        _total_votes: totalVoters.size,
        _user_votes: userVotes,
      } as unknown as ChatPoll
    },
    enabled: !!pollId,
    staleTime: 10 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Announcements                                                      */
/* ------------------------------------------------------------------ */

export function useCreateAnnouncement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const sendMessage = useSendMessage()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      type,
      title,
      body,
      metadata = {},
      expiresAt,
    }: {
      collectiveId: string
      type: 'announcement' | 'event_invite' | 'rsvp' | 'checklist'
      title: string
      body?: string
      metadata?: Record<string, Json | undefined>
      expiresAt?: string
    }) => {
      if (!user) throw new Error('Not authenticated')

      const { data: announcement, error } = await supabase
        .from('chat_announcements')
        .insert({
          collective_id: collectiveId,
          created_by: user.id,
          type,
          title,
          body: body ?? null,
          metadata: metadata ?? {},
          expires_at: expiresAt ?? null,
        })
        .select()
        .single()

      if (error) throw error

      // Send an announcement message in the chat
      await sendMessage.mutateAsync({
        collectiveId,
        content: title,
        messageType: 'announcement',
        announcementId: announcement.id,
      })

      return announcement
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['chat-announcements', input.collectiveId] })
    },
  })
}

export function useAnnouncementDetail(announcementId: string | undefined) {
  return useQuery({
    queryKey: ['chat-announcement', announcementId],
    queryFn: async () => {
      if (!announcementId) throw new Error('No announcement ID')

      const { data, error } = await supabase
        .from('chat_announcements')
        .select(`
          *,
          profiles!chat_announcements_created_by_fkey(id, display_name, avatar_url)
        `)
        .eq('id', announcementId)
        .single()

      if (error) throw error

      // Get responses with profile (for the horizontal-scroll avatar strip
      // on the announcement event-invite card - 1.8.4 item 10).
      const { data: responses } = await supabase
        .from('chat_announcement_responses')
        .select('*, profiles(id, display_name, avatar_url)')
        .eq('announcement_id', announcementId)

      return { ...data, responses: responses ?? [] } as unknown as ChatAnnouncement
    },
    enabled: !!announcementId,
    staleTime: 15 * 1000,
  })
}

export function useRespondToAnnouncement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({
      announcementId,
      response,
    }: {
      announcementId: string
      response: string
    }) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('announcement-response', {
          announcementId,
          userId: user.id,
          response,
        })
        return
      }

      // Remove existing response first (single-choice)
      const { error: deleteError } = await supabase
        .from('chat_announcement_responses')
        .delete()
        .eq('announcement_id', announcementId)
        .eq('user_id', user.id)
      if (deleteError) throw deleteError

      const { error } = await supabase
        .from('chat_announcement_responses')
        .insert({
          announcement_id: announcementId,
          user_id: user.id,
          response,
        })

      if (error) throw error
    },
    onMutate: async ({ announcementId, response }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-announcement', announcementId] })
      const previous = queryClient.getQueryData<ChatAnnouncement>(['chat-announcement', announcementId])
      queryClient.setQueryData<ChatAnnouncement>(['chat-announcement', announcementId], (old) => {
        if (!old) return old
        const filtered = (old.responses ?? []).filter((r) => r.user_id !== user!.id)
        return {
          ...old,
          responses: [...filtered, {
            id: `optimistic-${Date.now()}`,
            announcement_id: announcementId,
            user_id: user!.id,
            response,
            created_at: new Date().toISOString(),
          }],
        }
      })
      return { previous }
    },
    onError: (_err, { announcementId }, context) => {
      if (!isOffline && context?.previous) queryClient.setQueryData(['chat-announcement', announcementId], context.previous)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Response saved offline - will sync when back online')
    },
    onSettled: (_, __, { announcementId }) => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['chat-announcement', announcementId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Broadcast notifications (leader feature)                           */
/* ------------------------------------------------------------------ */

export function useBroadcastLog(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['broadcast-log', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')

      const { data, error } = await supabase
        .from('chat_broadcast_log')
        .select(`
          *,
          profiles!chat_broadcast_log_sent_by_fkey(id, display_name, avatar_url)
        `)
        .eq('collective_id', collectiveId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return (data ?? []) as unknown as BroadcastLogEntry[]
    },
    enabled: !!collectiveId,
    staleTime: 30 * 1000,
  })
}

export function useSendBroadcastNotification() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      title,
      body,
      type = 'push_notification',
      metadata = {},
    }: {
      collectiveId: string
      title: string
      body: string
      type?: string
      metadata?: Record<string, Json | undefined>
    }) => {
      if (!user) throw new Error('Not authenticated')

      // Send push notification to all collective members except the sender
      // Fetch members first so we can exclude self
      const { data: members } = await supabase
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')
      const recipientIds = (members ?? [])
        .map((m: { user_id: string }) => m.user_id)
        .filter((id: string) => id !== user.id)

      const { data: pushResult } = recipientIds.length > 0
        ? await supabase.functions.invoke('send-push', {
            body: {
              userIds: recipientIds,
              title,
              body,
              data: {
                type: 'chat_announcement',
                collective_id: collectiveId,
              },
            },
          })
        : { data: { sent: 0 } }

      // Create in-app notification rows so users see it in their feed
      if (recipientIds.length > 0) {
        await supabase.from('notifications').insert(
          recipientIds.map((uid: string) => ({
            user_id: uid,
            type: 'chat_announcement',
            title,
            body,
            data: { collective_id: collectiveId },
          })),
        )
      }

      // Log the broadcast for dedup visibility
      const { error } = await supabase
        .from('chat_broadcast_log')
        .insert({
          collective_id: collectiveId,
          sent_by: user.id,
          type,
          title,
          body,
          metadata,
          recipient_count: pushResult?.sent ?? 0,
        })

      if (error) throw error
      return pushResult
    },
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['broadcast-log', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Upload chat image                                                  */
/* ------------------------------------------------------------------ */

export function useUploadChatImage(collectiveId: string) {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated')
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${collectiveId}/${user.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { data: signedData, error: signError } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(path, 60 * 60 * 24 * 7)
      if (signError) throw signError

      return signedData.signedUrl
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Chat export (leader)                                               */
/* ------------------------------------------------------------------ */

export async function exportChatLog(
  collectiveId: string,
  startDate: string,
  endDate: string,
) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('content, created_at, profiles!chat_messages_user_id_fkey(display_name)')
    .eq('collective_id', collectiveId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  if (error) throw error

  const header = 'Timestamp,Sender,Message\n'
  const rows = (data ?? []).map((m) => {
    const name = (m.profiles as { display_name: string | null } | null)?.display_name ?? 'Unknown'
    const time = new Date(m.created_at!).toLocaleString()
    const content = (m.content ?? '').replace(/"/g, '""')
    return `"${time}","${name}","${content}"`
  }).join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
