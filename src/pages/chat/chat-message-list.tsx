import {
  Fragment,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { ChatBubble, PollCard, AnnouncementCard } from '@/components/chat-bubble'
import { HtmlChatBubble } from '@/components/html-chat-bubble'
import { MessageReactions } from '@/components/message-reactions'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import {
  usePollDetail,
  usePollVote,
  useRemovePollVote,
  useAnnouncementDetail,
  useRespondToAnnouncement,
  type ChatMessageWithSender,
} from '@/hooks/use-chat'
import type { ChannelMessageWithSender } from '@/hooks/use-staff-channels'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEventDetail, type EventDetailData } from '@/hooks/use-events'
import type { Tables, Json } from '@/types/database.types'

type EventRegistration = Tables<'event_registrations'>

/** Union message type used throughout the chat room */
export type AnyMessage = ChatMessageWithSender | ChannelMessageWithSender

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dateHeader(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}

/* ------------------------------------------------------------------ */
/*  Inline Poll Renderer                                               */
/* ------------------------------------------------------------------ */

function InlinePoll({
  pollId,
  collectiveId,
  sent,
}: {
  pollId: string
  collectiveId?: string | null
  sent: boolean
}) {
  const { data: poll } = usePollDetail(pollId)
  const vote = usePollVote()
  const removeVote = useRemovePollVote()

  if (!poll) return null

  return (
    <PollCard
      question={poll.question}
      options={poll.options}
      voteCounts={poll._vote_counts ?? {}}
      totalVotes={poll._total_votes ?? 0}
      userVotes={poll._user_votes ?? []}
      isClosed={poll.is_closed}
      allowMultiple={poll.allow_multiple}
      anonymous={poll.anonymous}
      creatorName={poll.profiles?.display_name ?? undefined}
      closesAt={poll.closes_at}
      onVote={(optionId) => vote.mutate({ pollId, optionId, collectiveId: poll.collective_id ?? collectiveId ?? '' })}
      onRemoveVote={(optionId) => removeVote.mutate({ pollId, optionId, collectiveId: poll.collective_id ?? collectiveId ?? '' })}
      sent={sent}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Inline Announcement Renderer                                       */
/* ------------------------------------------------------------------ */

function InlineAnnouncement({
  announcementId,
  sent,
}: {
  announcementId: string
  sent: boolean
}) {
  const { data: announcement } = useAnnouncementDetail(announcementId)
  const respond = useRespondToAnnouncement()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const eventId = (announcement?.metadata as Record<string, unknown> | undefined)?.event_id as string | undefined
  const isEventType = announcement?.type === 'event_invite' || announcement?.type === 'rsvp'
  const { data: eventDetail } = useEventDetail(isEventType && eventId ? eventId : undefined)
  const queryClient = useQueryClient()

  if (!announcement) return null

  const userResponse = announcement.responses?.find((r) => r.user_id === user?.id)?.response ?? null

  const handleRespond = async (response: string) => {
    respond.mutate({ announcementId, response })

    if (isEventType && eventId) {
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })

      const prevEvent = queryClient.getQueryData<EventDetailData>(['event', eventId, user?.id])
      if (prevEvent) {
        queryClient.setQueryData<EventDetailData>(['event', eventId, user?.id], (old) => {
          if (!old) return old
          if (response === 'going') {
            const wasRegistered = old.user_registration && old.user_registration.status === 'registered'
            return {
              ...old,
              registration_count: old.registration_count + (wasRegistered ? 0 : 1),
              user_registration: {
                event_id: eventId,
                user_id: user!.id,
                status: 'registered',
                checked_in_at: null,
                registered_at: new Date().toISOString(),
                invited_at: null,
                id: old.user_registration?.id ?? crypto.randomUUID(),
              } as EventRegistration,
            }
          } else if (response === 'not_going') {
            const wasRegistered = old.user_registration && ['registered', 'invited', 'waitlisted'].includes(old.user_registration.status!)
            return {
              ...old,
              registration_count: Math.max(0, old.registration_count - (wasRegistered ? 1 : 0)),
              user_registration: null,
            }
          }
          return old
        })
      }

      try {
        if (response === 'going') {
          const { error } = await supabase
            .from('event_registrations')
            .upsert(
              { event_id: eventId, user_id: user!.id, status: 'registered' as const, registered_at: new Date().toISOString() },
              { onConflict: 'event_id,user_id' },
            )
          if (error) throw error
          toast.success("You're registered!")
        } else if (response === 'not_going') {
          const { error } = await supabase
            .from('event_registrations')
            .update({ status: 'cancelled' as const })
            .eq('event_id', eventId)
            .eq('user_id', user!.id)
          if (error) throw error
          toast.info('RSVP removed')
        } else if (response === 'maybe') {
          try {
            await supabase.rpc('handle_announcement_rsvp', {
              p_event_id: eventId,
              p_response: 'maybe',
            })
          } catch {
            // RPC might not exist yet
          }
          toast.info("We'll remind you closer to the date")
        }
      } catch {
        if (prevEvent) {
          queryClient.setQueryData(['event', eventId, user?.id], prevEvent)
        }
        toast.error('Failed to update your RSVP')
      }

      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
    }
  }

  const eventDetails = eventDetail
    ? {
        coverImageUrl: eventDetail.cover_image_url,
        dateStart: eventDetail.date_start,
        dateEnd: eventDetail.date_end,
        address: eventDetail.address,
        activityType: eventDetail.activity_type,
        collectiveName: eventDetail.collectives?.name,
      }
    : null

  return (
    <AnnouncementCard
      type={announcement.type}
      title={announcement.title}
      body={announcement.body}
      creatorName={announcement.profiles?.display_name ?? undefined}
      metadata={announcement.metadata}
      responses={announcement.responses}
      userResponse={userResponse}
      isActive={announcement.is_active}
      sent={sent}
      onRespond={handleRespond}
      onViewEvent={(evId) => navigate(`/events/${evId}`)}
      eventDetails={eventDetails}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessageListProps {
  /** 'collective' or 'channel' */
  isCollective: boolean
  isChannel: boolean
  /** Messages grouped by date */
  messageGroups: { date: string; messages: AnyMessage[] }[]
  allMessages: AnyMessage[]
  /** Member roles map (collective mode only) */
  memberRoles: Map<string, string | undefined>
  effectiveCollectiveId?: string
  /** Loading states */
  showLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean | undefined
  fetchNextPage: () => void
  /** Typing indicator text (collective mode only) */
  typingText?: string
  /** Callback when a message is long-pressed */
  onMessageLongPress: (msg: AnyMessage) => void
  /** Callback when an avatar/sender name is tapped */
  onProfileTap: (userId: string) => void
  /** Refs provided by the parent for scroll management */
  scrollContainerRef: RefObject<HTMLDivElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  /** Whether to show the scroll-down button (parent manages this state) */
  onScrollChange: (showScrollDown: boolean) => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatMessageList({
  isCollective,
  isChannel,
  messageGroups,
  allMessages,
  memberRoles,
  effectiveCollectiveId,
  showLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  typingText,
  onMessageLongPress,
  onProfileTap,
  scrollContainerRef,
  messagesEndRef,
  onScrollChange,
}: ChatMessageListProps) {
  const { user } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const initialScrollDone = useRef(false)

  // Reset scroll on message count change (first load)
  const roomKeyRef = useRef(allMessages.length)

  /* ---- Scroll: instant on first load ---- */
  useLayoutEffect(() => {
    if (!initialScrollDone.current && allMessages.length > 0) {
      const container = scrollContainerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
        }
        initialScrollDone.current = true
      })
    }
  }, [allMessages.length, scrollContainerRef, messagesEndRef])

  /* ---- Scroll: smooth on new messages ---- */
  useEffect(() => {
    if (initialScrollDone.current) {
      // Only auto-scroll if we're near the bottom already
      const container = scrollContainerRef.current
      if (container) {
        const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
        if (distFromBottom < (isCollective ? 200 : 300)) {
          messagesEndRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' })
        }
      }
    }
  }, [allMessages.length, shouldReduceMotion, scrollContainerRef, messagesEndRef, isCollective])

  /* ---- Scroll tracking ---- */
  const scrollRafId = useRef(0)
  useEffect(() => () => cancelAnimationFrame(scrollRafId.current), [])
  const handleScroll = useCallback(() => {
    if (!initialScrollDone.current) return
    cancelAnimationFrame(scrollRafId.current)
    scrollRafId.current = requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      onScrollChange(distFromBottom > (isCollective ? 200 : 300))

      if (container.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    })
  }, [isCollective, hasNextPage, isFetchingNextPage, fetchNextPage, scrollContainerRef, onScrollChange])

  /** Reset initialScrollDone when the room changes (parent will remount or change props) */
  useEffect(() => {
    if (allMessages.length !== roomKeyRef.current) {
      roomKeyRef.current = allMessages.length
    }
  }, [allMessages.length])

  /* ---- Render message item ---- */
  const renderMessage = (msg: AnyMessage, isSent: boolean) => {
    const isDeleted = msg.is_deleted
    const messageType = msg.message_type ?? 'text'
    const msgCollectiveId = msg.collective_id ?? effectiveCollectiveId
    const roleBadge = isCollective && msg.user_id ? memberRoles.get(msg.user_id) : undefined

    if (isDeleted) {
      return (
        <div className={cn('flex py-1', isSent ? 'justify-end' : 'justify-start')}>
          <p className="text-xs italic text-neutral-400 font-medium px-3.5 py-2.5 rounded-2xl bg-neutral-50 ring-1 ring-neutral-100">
            Message removed
          </p>
        </div>
      )
    }

    if (messageType === 'poll' && msg.poll_id) {
      return <InlinePoll pollId={msg.poll_id} collectiveId={msgCollectiveId} sent={isSent} />
    }

    if (messageType === 'announcement' && msg.announcement_id) {
      return <InlineAnnouncement announcementId={msg.announcement_id} sent={isSent} />
    }

    if (messageType === 'system') {
      return (
        <div className="flex justify-center py-3">
          <p className="text-xs text-neutral-500 italic font-medium bg-neutral-50 px-4 py-2 rounded-full ring-1 ring-neutral-100">
            {msg.content}
          </p>
        </div>
      )
    }

    // Reactions are gated on: collective chat, non-optimistic message,
    // we know the collective id (needed for RLS + realtime filter).
    const reactionsEnabled =
      isCollective &&
      !!msgCollectiveId &&
      !msg._optimistic &&
      !msg.id.startsWith('optimistic-')

    if (messageType === 'html') {
      return (
        <>
          <HtmlChatBubble
            htmlContent={msg.content ?? ''}
            sent={isSent}
            timestamp={new Date(msg.created_at!)}
            senderName={msg.profiles?.display_name ?? undefined}
            senderAvatar={msg.profiles?.avatar_url ?? undefined}
            senderId={msg.user_id ?? undefined}
            roleBadge={roleBadge}
            skipAnimation={msg._confirmed}
            onAvatarTap={(userId) => onProfileTap(userId)}
            onSenderTap={(userId) => onProfileTap(userId)}
            onLongPress={() => onMessageLongPress(msg)}
          />
          {reactionsEnabled && (
            <MessageReactions
              messageId={msg.id}
              collectiveId={msgCollectiveId!}
              sent={isSent}
            />
          )}
        </>
      )
    }

    // Default: text / image
    const bubble = (
      <ChatBubble
        message={msg.content ?? ''}
        sent={isSent}
        timestamp={new Date(msg.created_at!)}
        senderName={msg.profiles?.display_name ?? undefined}
        senderAvatar={msg.profiles?.avatar_url ?? undefined}
        senderId={msg.user_id ?? undefined}
        photo={msg.image_url ?? undefined}
        roleBadge={roleBadge}
        skipAnimation={msg._confirmed}
        onAvatarTap={(userId) => onProfileTap(userId)}
        onSenderTap={(userId) => onProfileTap(userId)}
        onLongPress={() => onMessageLongPress(msg)}
        replyTo={
          msg.reply_message
            ? {
                message: msg.reply_message.content ?? '',
                senderName: allMessages.find((m) => m.id === msg.reply_message!.id)?.profiles?.display_name ?? 'Someone',
              }
            : undefined
        }
      />
    )

    if (isCollective) {
      return (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Message options for ${msg.profiles?.display_name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onMessageLongPress(msg)
          }}
        >
          {bubble}
          {(msg as unknown as { updated_at?: string }).updated_at && (msg as unknown as { updated_at?: string }).updated_at !== msg.created_at && (
            <p className={cn(
              'text-[11px] text-neutral-400 mt-0.5',
              isSent ? 'text-right pr-2' : 'pl-10',
            )}>
              (edited)
            </p>
          )}
          {reactionsEnabled && (
            <MessageReactions
              messageId={msg.id}
              collectiveId={msgCollectiveId!}
              sent={isSent}
            />
          )}
        </div>
      )
    }

    return bubble
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth px-3 py-2"
        role="log"
        aria-label={isChannel ? 'Staff chat messages' : 'Chat messages'}
        aria-live="polite"
      >
        {showLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton variant="list-item" count={8} />
          </div>
        ) : allMessages.length === 0 ? (
          isChannel ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
                  <Lock size={24} strokeWidth={2.5} className="text-primary-500" />
                </div>
                <p className="text-base font-bold text-neutral-900">Staff-only chat</p>
                <p className="text-sm text-neutral-500 mt-1.5">
                  Messages here are only visible to staff members
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              illustration="empty"
              title="Start the conversation"
              description="Be the first to say hello to your collective!"
            />
          )
        ) : (
          <>
            {/* Load more indicator */}
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
              </div>
            )}

            {messageGroups.map((group) => (
              <Fragment key={group.date}>
                {/* Date separator */}
                <div className="flex items-center justify-center py-5">
                  <motion.span
                    initial={isCollective && !shouldReduceMotion ? { opacity: 0, scale: 0.9 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-full bg-white px-4 py-1.5 text-[11px] font-bold text-neutral-500 shadow-sm ring-1 ring-neutral-100"
                  >
                    {dateHeader(group.date)}
                  </motion.span>
                </div>

                {/* Messages */}
                {group.messages.map((msg) => {
                  const isSent = msg.user_id === user?.id

                  return (
                    <div
                      key={msg.id}
                      className="py-1"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        onMessageLongPress(msg)
                      }}
                    >
                      {renderMessage(msg, isSent)}
                    </div>
                  )
                })}
              </Fragment>
            ))}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator (collective only) */}
      {isCollective && (
        <AnimatePresence>
          {typingText && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 px-4 pb-1.5 bg-white"
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.6s' }}
                    />
                  ))}
                </div>
                <p className="text-xs text-neutral-500 italic font-medium">{typingText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  )
}
