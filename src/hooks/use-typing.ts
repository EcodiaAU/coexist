import { useEffect, useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TypingUser {
  userId: string
  displayName: string
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTyping(collectiveId: string | undefined) {
  const { user, profile } = useAuth()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTrackRef = useRef(0)

  // Subscribe to presence for typing indicators
  useEffect(() => {
    if (!collectiveId || !user) return

    const channel = supabase.channel(`typing:${collectiveId}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ displayName: string; isTyping: boolean }>()
        const typers: TypingUser[] = []
        for (const [userId, presences] of Object.entries(state)) {
          if (userId === user.id) continue
          const latest = presences[presences.length - 1]
          if (latest?.isTyping) {
            typers.push({ userId, displayName: latest.displayName })
          }
        }
        setTypingUsers(typers)
      })


    const cleanup = subscribeWithReconnect(channel, {
        onStatusChange: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
          if (status === 'SUBSCRIBED') {
            channel.track({
              displayName: profile?.display_name ?? 'Someone',
              isTyping: false,
            })
          }
        },
      })

    channelRef.current = channel

    return () => {
      cleanup()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [collectiveId, user, profile?.display_name])

  // Send typing indicator (throttled to 1 broadcast per 500ms)
  const sendTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !user) return

    const now = Date.now()
    if (now - lastTrackRef.current < 500) return
    lastTrackRef.current = now

    channel.track({
      displayName: profile?.display_name ?? 'Someone',
      isTyping: true,
    })

    // Auto-stop after 3 seconds
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      channel.track({
        displayName: profile?.display_name ?? 'Someone',
        isTyping: false,
      })
    }, 3000)
  }, [user, profile?.display_name])

  // Stop typing indicator
  const stopTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !user) return

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    channel.track({
      displayName: profile?.display_name ?? 'Someone',
      isTyping: false,
    })
  }, [user, profile?.display_name])

  // Format typing text
  const typingText = formatTypingText(typingUsers)

  return { typingUsers, typingText, sendTyping, stopTyping }
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function formatTypingText(users: TypingUser[]): string | null {
  if (users.length === 0) return null
  if (users.length === 1) return `${users[0].displayName} is typing...`
  if (users.length === 2) return `${users[0].displayName} and ${users[1].displayName} are typing...`
  return `${users[0].displayName} and ${users.length - 1} others are typing...`
}
