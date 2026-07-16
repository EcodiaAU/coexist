import {
  Fragment,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Lock, Camera, MessageSquareHeart, Tent } from 'lucide-react'
import { ChatBubble, PollCard, AnnouncementCard, CarpoolCard } from '@/components/chat-bubble'
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
import { useCarpool, useCarpoolSeats, useCarpoolBreakout, useSaveSeat, useCancelSeat } from '@/hooks/use-carpool'
import { useEventPhotos } from '@/hooks/use-event-photos'
import { useSignedChatImage } from '@/hooks/use-signed-chat-image'
import { SaveSeatSheet } from '@/components/save-seat-sheet'
import type { Tables, Json } from '@/types/database.types'

type EventRegistration = Tables<'event_registrations'>

/** Union message type used throughout the chat room */
export type AnyMessage = ChatMessageWithSender | ChannelMessageWithSender

/* ------------------------------------------------------------------ */
/*  ChatTextOrImageBubble - resolves chat_messages.image_path to a    */
/*  short-lived signed URL on demand (chat-images bucket is private). */
/*  Falls back to image_url for legacy / external links.              */
/*  Hook is called at component scope so each rendered message gets   */
/*  its own React-Query subscription.                                 */
/* ------------------------------------------------------------------ */

function ChatTextOrImageBubble({
  msg,
  sent,
  roleBadge,
  isContinuation,
  onAvatarTap,
  onSenderTap,
  onLongPress,
  onReplyTap,
  onSwipeReply,
  replyTo,
}: {
  msg: AnyMessage
  sent: boolean
  roleBadge?: string
  isContinuation: boolean
  onAvatarTap: (userId: string) => void
  onSenderTap: (userId: string) => void
  onLongPress: () => void
  onReplyTap: (parentId: string) => void
  onSwipeReply?: () => void
  replyTo?: { message: string; senderName: string; parentId: string }
}) {
  const imagePath = (msg as { image_path?: string | null }).image_path
  const signed = useSignedChatImage(imagePath ?? null)
  const photo = imagePath ? signed.url : (msg.image_url ?? undefined)
  return (
    <ChatBubble data-eos-id="src/pages/chat/chat-message-list.tsx#0" data-eos-v="2"
      message={msg.content ?? ''}
      sent={sent}
      timestamp={new Date(msg.created_at!)}
      senderName={msg.profiles?.display_name ?? undefined}
      senderAvatar={msg.profiles?.avatar_url ?? undefined}
      senderId={msg.user_id ?? undefined}
      photo={photo}
      roleBadge={roleBadge}
      skipAnimation={msg._confirmed}
      isContinuation={isContinuation}
      onAvatarTap={onAvatarTap}
      onSenderTap={onSenderTap}
      onLongPress={onLongPress}
      onReplyTap={onReplyTap}
      onSwipeReply={onSwipeReply}
      replyTo={replyTo}
    />
  )
}

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
    <PollCard data-eos-id="src/pages/chat/chat-message-list.tsx#1"
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
    <AnnouncementCard data-eos-id="src/pages/chat/chat-message-list.tsx#2"
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
/*  Inline Event Photos widget                                          */
/* ------------------------------------------------------------------ */

function InlineEventPhotos({
  eventId,
  sent,
}: {
  eventId: string
  sent: boolean
}) {
  const navigate = useNavigate()
  const { data: photos = [] } = useEventPhotos(eventId)
  const { data: event } = useEventDetail(eventId)
  const previewCount = 4
  const preview = photos.slice(0, previewCount)
  const more = Math.max(0, photos.length - previewCount)
  const uploaderCount = new Set(photos.map((p) => p.uploaded_by)).size
  return (
    <motion.div data-eos-id="src/pages/chat/chat-message-list.tsx#3"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'w-full max-w-[88%] min-w-0 rounded-md overflow-hidden bg-neutral-50 border border-neutral-200 shadow-sm',
        sent ? 'ml-auto' : 'mr-auto',
      )}
    >
      <div data-eos-id="src/pages/chat/chat-message-list.tsx#4" className="p-4">
        <div data-eos-id="src/pages/chat/chat-message-list.tsx#5" className="flex items-center gap-2 mb-2">
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#6" className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-600">
            <Camera data-eos-id="src/pages/chat/chat-message-list.tsx#7" size={16} strokeWidth={2.4} />
          </div>
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#8" className="flex-1 min-w-0">
            <p data-eos-id="src/pages/chat/chat-message-list.tsx#9" className="text-[10px] font-extrabold uppercase tracking-wider text-primary-600">Photo album</p>
            <p data-eos-id="src/pages/chat/chat-message-list.tsx#10" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 leading-tight line-clamp-1">
              {event?.title ?? 'Event'}
            </p>
          </div>
        </div>
        {photos.length === 0 ? (
          <p data-eos-id="src/pages/chat/chat-message-list.tsx#11" className="text-xs text-neutral-500 mb-3">No photos yet - be the first to share.</p>
        ) : (
          <p data-eos-id="src/pages/chat/chat-message-list.tsx#12" className="text-xs text-neutral-500 mb-3">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'} from {uploaderCount} {uploaderCount === 1 ? 'person' : 'people'}
          </p>
        )}
        {preview.length > 0 && (
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#13" className="grid grid-cols-4 gap-0.5 rounded-sm overflow-hidden mb-3">
            {preview.map((p, i) => (
              <div data-eos-id="src/pages/chat/chat-message-list.tsx#14" key={p.id} className="relative aspect-square bg-neutral-100">
                {p.url && (
                  <img data-eos-src="dynamic" data-eos-src-label="Url" data-eos-id="src/pages/chat/chat-message-list.tsx#15"
                    src={p.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                {i === preview.length - 1 && more > 0 && (
                  <div data-eos-id="src/pages/chat/chat-message-list.tsx#16" className="absolute inset-0 bg-black/55 flex items-center justify-center">
                    <span data-eos-id="src/pages/chat/chat-message-list.tsx#17" className="text-white font-heading font-bold text-base">+{more}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button data-eos-id="src/pages/chat/chat-message-list.tsx#18"
          type="button"
          onClick={() => navigate(`/events/${eventId}?tab=photos`)}
          className="w-full rounded-sm bg-primary-600 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-primary-700 shadow-sm"
        >
          {photos.length === 0 ? 'Add the first photo' : 'Open album & add yours'}
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline Event Survey Renderer                                       */
/* ------------------------------------------------------------------ */

function InlineEventSurvey({
  eventId,
  sent,
}: {
  eventId: string
  sent: boolean
}) {
  const navigate = useNavigate()
  const { data: event } = useEventDetail(eventId)
  return (
    <motion.div data-eos-id="src/pages/chat/chat-message-list.tsx#19"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'w-full max-w-[88%] min-w-0 rounded-md overflow-hidden bg-neutral-50 border border-neutral-200 shadow-sm',
        sent ? 'ml-auto' : 'mr-auto',
      )}
    >
      <div data-eos-id="src/pages/chat/chat-message-list.tsx#20" className="p-4">
        <div data-eos-id="src/pages/chat/chat-message-list.tsx#21" className="flex items-center gap-2 mb-2">
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#22" className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-600">
            <MessageSquareHeart data-eos-id="src/pages/chat/chat-message-list.tsx#23" size={16} strokeWidth={2.4} />
          </div>
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#24" className="flex-1 min-w-0">
            <p data-eos-id="src/pages/chat/chat-message-list.tsx#25" className="text-[10px] font-extrabold uppercase tracking-wider text-primary-600">Feedback</p>
            <p data-eos-id="src/pages/chat/chat-message-list.tsx#26" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 leading-tight line-clamp-1">
              {event?.title ?? 'Event'}
            </p>
          </div>
        </div>
        <p data-eos-id="src/pages/chat/chat-message-list.tsx#27" className="text-xs text-neutral-500 mb-3">
          How was it? Quick check-in helps the leaders learn what worked - takes 30 seconds.
        </p>
        <button data-eos-id="src/pages/chat/chat-message-list.tsx#28"
          type="button"
          onClick={() => navigate(`/events/${eventId}/survey`)}
          className="w-full rounded-sm bg-primary-600 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-primary-700 shadow-sm"
        >
          Share feedback
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline Carpool Renderer                                            */
/* ------------------------------------------------------------------ */

function InlineCarpool({
  carpoolId,
  sent,
}: {
  carpoolId: string
  sent: boolean
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: carpool } = useCarpool(carpoolId)
  const { data: seats = [] } = useCarpoolSeats(carpoolId)
  const { data: breakout } = useCarpoolBreakout(carpoolId)
  const saveSeat = useSaveSeat()
  const cancelSeat = useCancelSeat()
  const [saveSheetOpen, setSaveSheetOpen] = useState(false)

  const eventId = carpool?.event_id
  const { data: eventDetail } = useEventDetail(eventId)

  if (!carpool) return null

  const confirmedSeats = seats.filter((s) => s.status === 'confirmed')
  const viewerSeat = confirmedSeats.find((s) => s.passenger_id === user?.id)
  const viewerHasSeat = !!viewerSeat
  const viewerIsDriver = carpool.driver_id === user?.id

  const confirmedPassengers = confirmedSeats.map((s) => ({
    id: s.id,
    passenger_id: s.passenger_id,
    display_name: s.passenger?.display_name ?? null,
    avatar_url: s.passenger?.avatar_url ?? null,
  }))

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

  const handleSaveSeatSubmit = (data: { pickup_address_text: string }) => {
    saveSeat.mutate(
      {
        carpool_id: carpoolId,
        pickup_address_text: data.pickup_address_text,
      },
      {
        onSuccess: () => setSaveSheetOpen(false),
      },
    )
  }

  const handleCancelSeat = () => {
    if (!viewerSeat) return
    cancelSeat.mutate({ seat_id: viewerSeat.id, carpool_id: carpoolId })
  }

  return (
    <>
      <CarpoolCard data-eos-id="src/pages/chat/chat-message-list.tsx#29"
        status={carpool.status}
        creatorName={carpool.driver?.display_name ?? undefined}
        departurePointText={carpool.departure_point_text}
        departureTime={carpool.departure_time}
        seatsTotal={carpool.seats_total}
        confirmedPassengers={confirmedPassengers}
        notes={carpool.notes}
        eventDetails={eventDetails}
        eventTitle={eventDetail?.title ?? null}
        eventId={eventId ?? null}
        viewerHasSeat={viewerHasSeat}
        viewerIsDriver={viewerIsDriver}
        sent={sent}
        onSaveSeat={() => setSaveSheetOpen(true)}
        onCancelSeat={handleCancelSeat}
        onViewEvent={(evId) => navigate(`/events/${evId}`)}
        breakoutChannelId={breakout?.channel_id ?? null}
        onOpenChat={breakout?.channel_id ? () => navigate(`/chat/channel/${breakout.channel_id}`) : undefined}
      />
      <SaveSeatSheet data-eos-id="src/pages/chat/chat-message-list.tsx#30"
        open={saveSheetOpen}
        onClose={() => setSaveSheetOpen(false)}
        onSubmit={handleSaveSeatSubmit}
        loading={saveSeat.isPending}
        driverName={carpool.driver?.display_name ?? null}
        eventTitle={eventDetail?.title ?? null}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessageListProps {
  /** 'collective' or 'channel' */
  isCollective: boolean
  isChannel: boolean
  /** Channel subtype (e.g. 'campout', 'staff_collective') when isChannel */
  channelType?: string
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
  /**
   * Callback when a message is swipe-right-replied (1.8.6 feature 1).
   * Fires past the SWIPE_REPLY_FIRE_PX threshold inside ChatBubble; parent
   * promotes the message into reply state (replyTo) without opening the
   * full actions sheet.
   */
  onMessageSwipeReply: (msg: AnyMessage) => void
  /** Callback when an avatar/sender name is tapped */
  onProfileTap: (userId: string) => void
  /** Refs provided by the parent for scroll management */
  scrollContainerRef: RefObject<HTMLDivElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  /** Whether to show the scroll-down button (parent manages this state) */
  onScrollChange: (showScrollDown: boolean) => void
  /**
   * Room identity key (channelId or collectiveId). When this changes, the
   * component is rendering a different conversation and must reset its
   * initial-scroll guard so the new room opens at the latest message.
   * Without this, navigating between chats while the component stays
   * mounted leaves `initialScrollDone.current = true` from the previous
   * room and the new room renders scrolled to the top.
   */
  roomKey: string | undefined
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatMessageList({
  isCollective,
  isChannel,
  channelType,
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
  onMessageSwipeReply,
  onProfileTap,
  scrollContainerRef,
  messagesEndRef,
  onScrollChange,
  roomKey,
}: ChatMessageListProps) {
  const { user } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const initialScrollDone = useRef(false)
  const lastRoomKeyRef = useRef(roomKey)

  // Reset initial-scroll guard when the room changes. Without this, the
  // useRef value persists across navigations (component stays mounted with
  // different props) and the new room opens scrolled to the top because
  // initialScrollDone.current = true from the previous conversation.
  if (lastRoomKeyRef.current !== roomKey) {
    initialScrollDone.current = false
    lastRoomKeyRef.current = roomKey
  }

  /**
   * Reply quote tap → scroll to parent message + briefly highlight it.
   * Tracks the highlighted parent id; cleared on a timeout so the ring
   * fades when navigation settles. Insta-DM thread browsing pattern.
   */
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleReplyTap = useCallback(
    (parentId: string) => {
      const container = scrollContainerRef.current
      if (!container) return
      const target = container.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(parentId)}"]`,
      )
      if (!target) {
        // Parent message likely lives in an older page. Fetch more history
        // and surface a toast - cheaper than full thread expansion in v1.
        if (hasNextPage && !isFetchingNextPage) fetchNextPage()
        return
      }
      target.scrollIntoView({
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
        block: 'center',
      })
      setHighlightedId(parentId)
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 1600)
    },
    [scrollContainerRef, hasNextPage, isFetchingNextPage, fetchNextPage, shouldReduceMotion],
  )

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  // Reset scroll on message count change (first load)
  const roomKeyRef = useRef(allMessages.length)

  /* ---- Scroll: instant on first load + persistent keep-at-bottom while user
   *      is anchored to the bottom.
   *
   * Three classes of late-arriving content grow the chat AFTER first paint:
   *  - Avatar / bubble image decodes  (~200-800ms on cellular)
   *  - Inline widget data fetches     (poll detail, announcement, carpool,
   *                                    event-photos - each its own useQuery)
   *  - Cascading widget renders       (event-photos -> useEventDetail ->
   *                                    useEventPhotos -> 4 thumbnail decodes)
   *
   * A fixed-duration "settle window" (the v50 1500ms timeout) can't cover
   * the slow tail of cascading widget loads on poor cellular - the user opens
   * the chat, lands at "the bottom" of the rendered-so-far content, then a
   * widget below pops in 2-3 seconds later and they're no longer at the
   * actual bottom.
   *
   * Fix: keep the ResizeObserver alive for the lifetime of the room, but gate
   * re-pin on "is the user still near the bottom?" instead of a time bound.
   *   - During the initial-load window: always re-pin on resize (force the
   *     first paint to land at bottom regardless of growth phase).
   *   - After the initial window: re-pin only when the user is still anchored
   *     near the bottom. The moment they scroll up to read history, auto-pin
   *     disables. The moment they scroll back to the bottom, the next resize
   *     re-enables it.
   *
   * Also disable scroll-smooth on the container during the pin so the browser
   * doesn't animate each pin and land mid-animation when the next reflow
   * fires.
   */
  useLayoutEffect(() => {
    const c = scrollContainerRef.current
    if (!c) return

    const NEAR_BOTTOM_PX = isCollective ? 200 : 300

    const originalScrollBehavior = c.style.scrollBehavior
    c.style.scrollBehavior = 'auto'

    const pin = () => {
      c.scrollTop = c.scrollHeight
    }

    const isUserNearBottom = () =>
      c.scrollHeight - c.scrollTop - c.clientHeight < NEAR_BOTTOM_PX

    // Initial paint - may be a no-op on first mount when allMessages is still
    // empty (container has no content yet), but the MutationObserver below
    // catches the first message inserts and re-pins.
    pin()

    let pendingRaf = 0
    const schedulePin = () => {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = requestAnimationFrame(() => {
        if (!initialScrollDone.current || isUserNearBottom()) {
          pin()
        }
      })
    }

    const resizeObserver = new ResizeObserver(schedulePin)
    resizeObserver.observe(c)
    const observeAllChildren = () => {
      c.querySelectorAll('[data-message-id]').forEach((el) =>
        resizeObserver.observe(el),
      )
    }
    observeAllChildren()

    // New message divs (realtime arrival, pagination, optimistic send) need
    // to be added to the resize-observer set AND trigger a re-pin pass - the
    // insertion itself is exactly the kind of growth we want to anchor
    // through. subtree:true also catches widget rerenders inside an existing
    // bubble whose container child gets replaced.
    const mutationObserver = new MutationObserver(() => {
      observeAllChildren()
      schedulePin()
    })
    mutationObserver.observe(c, { childList: true, subtree: true })

    // Close the initial-load window after 1500ms. Past this point schedulePin
    // gates on isUserNearBottom() so a widget popping in 3-5s later (slow
    // cellular) keeps the user anchored only if they were already at the
    // bottom; if they've scrolled up to read history, the pin is skipped and
    // we don't yank them.
    const initialWindowTimer = setTimeout(() => {
      if (isUserNearBottom()) pin()
      initialScrollDone.current = true
      c.style.scrollBehavior = originalScrollBehavior
    }, 1500)

    return () => {
      clearTimeout(initialWindowTimer)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      cancelAnimationFrame(pendingRaf)
      c.style.scrollBehavior = originalScrollBehavior
    }
  }, [scrollContainerRef, roomKey, isCollective])

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

  /* ---- Render message item ----
   *
   * 1.8.5 item 9 (chat polish): `isContinuation` flags messages that
   * follow another message from the same sender within the grouping
   * window. Continuation messages hide the avatar + sender-name row, and
   * the parent wrapper tightens vertical padding. Caller is responsible
   * for computing `isContinuation` against the previous *visible* message
   * in the same date-group (deleted messages are filtered before this
   * call so the lookup matches what's rendered).
   */
  const CONTINUATION_WINDOW_MS = 5 * 60 * 1000

  const renderMessage = (msg: AnyMessage, isSent: boolean, isContinuation: boolean) => {
    const isDeleted = msg.is_deleted
    const messageType = msg.message_type ?? 'text'
    const msgCollectiveId = msg.collective_id ?? effectiveCollectiveId
    const roleBadge = isCollective && msg.user_id ? memberRoles.get(msg.user_id) : undefined

    if (isDeleted) {
      // Deleted messages disappear entirely - no placeholder, no "Message removed".
      // Defense-in-depth: query, realtime UPDATE handler, and optimistic delete all
      // remove deleted messages from cache, but if one slips through it renders nothing.
      return null
    }

    if (messageType === 'poll' && msg.poll_id) {
      return <InlinePoll data-eos-id="src/pages/chat/chat-message-list.tsx#31" pollId={msg.poll_id} collectiveId={msgCollectiveId} sent={isSent} />
    }

    if (messageType === 'announcement' && msg.announcement_id) {
      return <InlineAnnouncement data-eos-id="src/pages/chat/chat-message-list.tsx#32" announcementId={msg.announcement_id} sent={isSent} />
    }

    // TODO: regen types after migration applied - `carpool` message_type
    // and `carpool_id` column are not yet present in database.types.ts.
    const carpoolMessageType = (msg as unknown as { message_type?: string }).message_type
    const carpoolId = (msg as unknown as { carpool_id?: string | null }).carpool_id
    if (carpoolMessageType === 'carpool' && carpoolId) {
      return <InlineCarpool data-eos-id="src/pages/chat/chat-message-list.tsx#33" carpoolId={carpoolId} sent={isSent} />
    }

    // event_photos widget: renders the album preview + Open album CTA.
    const eventPhotosEventId = (msg as unknown as { event_photos_event_id?: string | null }).event_photos_event_id
    if (messageType === 'event_photos' && eventPhotosEventId) {
      return <InlineEventPhotos data-eos-id="src/pages/chat/chat-message-list.tsx#34" eventId={eventPhotosEventId} sent={isSent} />
    }

    // event_survey widget: post-event feedback prompt, deep-links to /survey.
    const eventSurveyEventId = (msg as unknown as { event_survey_event_id?: string | null }).event_survey_event_id
    if (messageType === 'event_survey' && eventSurveyEventId) {
      return <InlineEventSurvey data-eos-id="src/pages/chat/chat-message-list.tsx#35" eventId={eventSurveyEventId} sent={isSent} />
    }

    if (messageType === 'system') {
      return (
        <div data-eos-id="src/pages/chat/chat-message-list.tsx#36" className="flex justify-center py-3">
          <p data-eos-id="src/pages/chat/chat-message-list.tsx#37" data-eos-var="msg.content" data-eos-var-label="Content" data-eos-var-scope="prop" className="text-xs text-neutral-500 italic font-medium bg-neutral-50 px-4 py-2 rounded-full ring-1 ring-neutral-100">
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

    // Swipe-reply (1.8.6 feature 1) is enabled for any non-optimistic,
    // non-deleted message. System messages take an early return below so
    // swipe never wires up to them. Defence-in-depth guard.
    const swipeReplyEnabled = !msg._optimistic && !msg.is_deleted

    if (messageType === 'html') {
      return (
        <>
          <HtmlChatBubble data-eos-id="src/pages/chat/chat-message-list.tsx#38"
            htmlContent={msg.content ?? ''}
            sent={isSent}
            timestamp={new Date(msg.created_at!)}
            senderName={msg.profiles?.display_name ?? undefined}
            senderAvatar={msg.profiles?.avatar_url ?? undefined}
            senderId={msg.user_id ?? undefined}
            roleBadge={roleBadge}
            skipAnimation={msg._confirmed}
            isContinuation={isContinuation}
            onAvatarTap={(userId) => onProfileTap(userId)}
            onSenderTap={(userId) => onProfileTap(userId)}
            onLongPress={() => onMessageLongPress(msg)}
            onSwipeReply={swipeReplyEnabled ? () => onMessageSwipeReply(msg) : undefined}
          />
          {reactionsEnabled && (
            <MessageReactions data-eos-id="src/pages/chat/chat-message-list.tsx#39"
              messageId={msg.id}
              collectiveId={msgCollectiveId!}
              sent={isSent}
            />
          )}
        </>
      )
    }

    // Default: text / image
    const replyTo = msg.reply_message
      ? {
          message: msg.reply_message.content ?? '',
          senderName: allMessages.find((m) => m.id === msg.reply_message!.id)?.profiles?.display_name ?? 'Someone',
          parentId: msg.reply_message.id,
        }
      : undefined
    const bubble = (
      <ChatTextOrImageBubble data-eos-id="src/pages/chat/chat-message-list.tsx#40"
        msg={msg}
        sent={isSent}
        roleBadge={roleBadge}
        isContinuation={isContinuation}
        onAvatarTap={onProfileTap}
        onSenderTap={onProfileTap}
        onLongPress={() => onMessageLongPress(msg)}
        onReplyTap={handleReplyTap}
        onSwipeReply={swipeReplyEnabled ? () => onMessageSwipeReply(msg) : undefined}
        replyTo={replyTo}
      />
    )

    if (isCollective) {
      return (
        <div data-eos-id="src/pages/chat/chat-message-list.tsx#41"
          role="button"
          tabIndex={0}
          aria-label={`Message options for ${msg.profiles?.display_name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onMessageLongPress(msg)
          }}
        >
          {bubble}
          {(msg as unknown as { updated_at?: string }).updated_at && (msg as unknown as { updated_at?: string }).updated_at !== msg.created_at && (
            <p data-eos-id="src/pages/chat/chat-message-list.tsx#42" className={cn(
              'text-[11px] text-neutral-400 mt-0.5',
              isSent ? 'text-right pr-2' : 'pl-10',
            )}>
              (edited)
            </p>
          )}
          {reactionsEnabled && (
            <MessageReactions data-eos-id="src/pages/chat/chat-message-list.tsx#43"
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
      <div data-eos-id="src/pages/chat/chat-message-list.tsx#44"
        ref={scrollContainerRef}
        onScroll={handleScroll}
        // 1.8.5 item 9: py-2 → py-1 trims top/bottom slack inside the
        // scroll region; the date-separator + first/last message handle
        // their own breathing room.
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth px-3 py-1"
        role="log"
        aria-label={isChannel ? (channelType === 'campout' ? 'Campout chat messages' : 'Staff chat messages') : 'Chat messages'}
        aria-live="polite"
      >
        {showLoading ? (
          <div data-eos-id="src/pages/chat/chat-message-list.tsx#45" className="space-y-4 py-4">
            <Skeleton data-eos-id="src/pages/chat/chat-message-list.tsx#46" variant="list-item" count={8} />
          </div>
        ) : allMessages.length === 0 ? (
          isChannel ? (
            channelType === 'campout' ? (
              <div data-eos-id="src/pages/chat/chat-message-list.tsx#47" className="flex items-center justify-center h-full">
                <div data-eos-id="src/pages/chat/chat-message-list.tsx#48" className="text-center py-12">
                  <div data-eos-id="src/pages/chat/chat-message-list.tsx#49" className="w-14 h-14 rounded-md bg-primary-50 flex items-center justify-center mx-auto mb-4">
                    <Tent data-eos-id="src/pages/chat/chat-message-list.tsx#50" size={24} strokeWidth={2.5} className="text-primary-500" />
                  </div>
                  <p data-eos-id="src/pages/chat/chat-message-list.tsx#51" className="text-base font-bold text-neutral-900">Campout group chat</p>
                  <p data-eos-id="src/pages/chat/chat-message-list.tsx#52" className="text-sm text-neutral-500 mt-1.5">
                    Say hi to everyone coming to this campout
                  </p>
                </div>
              </div>
            ) : (
              <div data-eos-id="src/pages/chat/chat-message-list.tsx#53" className="flex items-center justify-center h-full">
                <div data-eos-id="src/pages/chat/chat-message-list.tsx#54" className="text-center py-12">
                  <div data-eos-id="src/pages/chat/chat-message-list.tsx#55" className="w-14 h-14 rounded-md bg-primary-50 flex items-center justify-center mx-auto mb-4">
                    <Lock data-eos-id="src/pages/chat/chat-message-list.tsx#56" size={24} strokeWidth={2.5} className="text-primary-500" />
                  </div>
                  <p data-eos-id="src/pages/chat/chat-message-list.tsx#57" className="text-base font-bold text-neutral-900">Staff-only chat</p>
                  <p data-eos-id="src/pages/chat/chat-message-list.tsx#58" className="text-sm text-neutral-500 mt-1.5">
                    Messages here are only visible to staff members
                  </p>
                </div>
              </div>
            )
          ) : (
            <EmptyState data-eos-id="src/pages/chat/chat-message-list.tsx#59"
              illustration="empty"
              title="Start the conversation"
              description="Be the first to say hello to your collective!"
            />
          )
        ) : (
          <>
            {/* Load more indicator */}
            {isFetchingNextPage && (
              <div data-eos-id="src/pages/chat/chat-message-list.tsx#60" className="flex justify-center py-3">
                <div data-eos-id="src/pages/chat/chat-message-list.tsx#61" className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
              </div>
            )}

            {messageGroups.map((group) => {
              // 1.8.5 item 9: filter once, then walk pairwise so we can
              // compute `isContinuation` against the previous *visible*
              // message in this date-group. System messages reset the run
              // (an interjected join/leave breaks the visual grouping).
              const visibleMessages = group.messages.filter((msg) => !msg.is_deleted)

              return (
                <Fragment data-eos-id="src/pages/chat/chat-message-list.tsx#62" key={group.date}>
                  {/* Date separator. 1.8.5 item 9: py-5 -> py-3 (40 -> 24px
                      total). Still clearly demarcates the day without
                      eating a third of a phone screen. */}
                  <div data-eos-id="src/pages/chat/chat-message-list.tsx#63" className="flex items-center justify-center py-3">
                    <motion.span data-eos-id="src/pages/chat/chat-message-list.tsx#64" data-eos-var="group.date" data-eos-var-label="Date" data-eos-var-scope="item"
                      initial={isCollective && !shouldReduceMotion ? { opacity: 0, scale: 0.9 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-full bg-white px-4 py-1.5 text-[11px] font-bold text-neutral-500 shadow-sm ring-1 ring-neutral-100"
                    >
                      {dateHeader(group.date)}
                    </motion.span>
                  </div>

                  {/* Messages */}
                  {visibleMessages.map((msg, idx) => {
                    const isSent = msg.user_id === user?.id
                    const isHighlighted = highlightedId === msg.id
                    const prev = idx > 0 ? visibleMessages[idx - 1] : null
                    const prevType = prev?.message_type ?? 'text'
                    // Continuation iff: same sender as previous visible
                    // message in this date-group, neither sender nor
                    // previous is a system message, and within
                    // CONTINUATION_WINDOW_MS of the previous message.
                    const isContinuation =
                      !!prev &&
                      prev.user_id === msg.user_id &&
                      prevType !== 'system' &&
                      (msg.message_type ?? 'text') !== 'system' &&
                      !!msg.created_at &&
                      !!prev.created_at &&
                      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() <
                        CONTINUATION_WINDOW_MS

                    return (
                      <div data-eos-id="src/pages/chat/chat-message-list.tsx#65"
                        key={msg.id}
                        data-message-id={msg.id}
                        className={cn(
                          // 1.8.5 polish (10 May 2026, Group B B1): further
                          // tightening of inter-bubble vertical spacing.
                          // Continuation kept at py-0.5 (4px) - already at
                          // minimum breathing. Sender-change py-1.5 -> py-1
                          // (12 -> 8px, 33% reduction). Bigger compounding
                          // win is Group B B2 (commit 17d2f88) which dropped
                          // the always-visible MessageReactions add-button
                          // row that was pushing layout down ~32px under
                          // every message.
                          'rounded-md transition-shadow duration-300',
                          isContinuation ? 'py-0.5' : 'py-1',
                          isHighlighted && 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white shadow-md',
                        )}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          onMessageLongPress(msg)
                        }}
                      >
                        {renderMessage(msg, isSent, isContinuation)}
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}

            <div data-eos-id="src/pages/chat/chat-message-list.tsx#66" ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator (collective only) */}
      {isCollective && (
        <AnimatePresence data-eos-id="src/pages/chat/chat-message-list.tsx#67">
          {typingText && (
            <motion.div data-eos-id="src/pages/chat/chat-message-list.tsx#68"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 px-4 pb-1.5 bg-white"
            >
              <div data-eos-id="src/pages/chat/chat-message-list.tsx#69" className="flex items-center gap-2">
                <div data-eos-id="src/pages/chat/chat-message-list.tsx#70" className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div data-eos-id="src/pages/chat/chat-message-list.tsx#71"
                      key={i}
                      className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.6s' }}
                    />
                  ))}
                </div>
                <p data-eos-id="src/pages/chat/chat-message-list.tsx#72" className="text-xs text-neutral-500 italic font-medium">{typingText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  )
}
