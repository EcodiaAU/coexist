import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
} from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Search,
    Pin,
    X,
    Reply,
    Pencil,
    ArrowDown,
    ChevronDown,
    Users,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { MessageInput } from '@/components/message-input'
import { MessageActionsSheet } from '@/components/message-actions-sheet'
import { ReportContentSheet } from '@/components/report-content-sheet'
import { BlockUserSheet } from '@/components/block-user-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { UploadProgress } from '@/components/upload-progress'
import { ChatSwitcherDropdown } from '@/components/chat-switcher-dropdown'
import { ProfileModal } from '@/components/profile-modal'
import { OfflineIndicator } from '@/components/offline-indicator'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useCamera } from '@/hooks/use-camera'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useLayout } from '@/hooks/use-layout'
import { useKeyboardOpen } from '@/components/app-shell-context'
import { useCollective } from '@/hooks/use-collective'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import {
    useChatMessages,
    useSendMessage,
    useEditMessage,
    useDeleteMessage,
    usePinMessage,
    usePinnedMessages,
    useMarkChatRead,
    useCollectiveMemberRoles,
    useCreatePoll,
    useCreateAnnouncement,
    useBroadcastLog,
    useSendBroadcastNotification,
    type ChatMessageWithSender,
} from '@/hooks/use-chat'
import {
    useChannelMessages,
    useSendChannelMessage,
    useMarkChannelRead,
    useMyStaffChannels,
    useDeleteChannelMessage,
    usePinChannelMessage,
} from '@/hooks/use-staff-channels'
import { supabase } from '@/lib/supabase'
import { useBlockedUsers } from '@/hooks/use-user-blocks'
import { useInviteCollaborator } from '@/hooks/use-events'
import { useCreateCarpool } from '@/hooks/use-carpool'
import { CreateCarpoolSheet, type CreateCarpoolSubmitData } from '@/components/create-carpool-sheet'
import { useTyping } from '@/hooks/use-typing'
import { useOffline } from '@/hooks/use-offline'
import { useCollectiveMembers } from '@/hooks/use-collective'
import { resolveMentionedUserIds, type MentionCandidate } from '@/components/mention-picker-utils'
import {
    queueOfflineAction,
    saveChatDraft,
    getChatDraft,
    removeChatDraft,
} from '@/lib/offline-sync'
import type { Json } from '@/types/database.types'

import { ChatMessageList, type AnyMessage } from './chat-message-list'
import { ChatSearch } from './chat-search'
import { ChatLeaderPanel } from './chat-leader-panel'
import { fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Chat mode                                                          */
/* ------------------------------------------------------------------ */

type ChatMode = 'collective' | 'channel'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cleanChannelName(name: string): string {
  return name
    .replace(/\bCollective\b\s*/i, '')
    .replace(/\bStaff\b\s*/i, '')
    .trim() || name
}

/* ------------------------------------------------------------------ */
/*  Pinned messages bar (collective mode only)                         */
/* ------------------------------------------------------------------ */

function PinnedMessageBar({
  messages,
  isStaff,
  onUnpin,
}: {
  messages: ChatMessageWithSender[]
  isStaff: boolean
  onUnpin: (messageId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (messages.length === 0) return null
  const latest = messages[0]
  const hasMultiple = messages.length > 1

  return (
    <div className="shrink-0 bg-white border-b border-neutral-100">
      <div className="flex w-full items-center gap-2.5 px-4 py-2.5 min-h-11">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary-50 shrink-0">
          <Pin size={13} className="text-primary-500" />
        </div>
        <p className="text-xs text-neutral-800 truncate flex-1 text-left">
          <span className="font-bold">Pinned: </span>
          {latest.content ?? 'Image'}
        </p>

        {hasMultiple && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-50 active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none"
            aria-label={expanded ? 'Collapse pinned messages' : 'Show all pinned messages'}
          >
            <ChevronDown size={16} className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
            <span className="text-[11px] font-semibold ml-0.5">{messages.length}</span>
          </button>
        )}

        {isStaff && !expanded && (
          <button
            type="button"
            onClick={() => onUnpin(latest.id)}
            className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-300 hover:text-neutral-500 hover:bg-neutral-50 active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none"
            aria-label="Unpin message"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2 space-y-1.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2"
                >
                  <Pin size={10} className="text-neutral-300 shrink-0" />
                  <p className="text-xs text-neutral-700 truncate flex-1">
                    {msg.content ?? 'Image'}
                  </p>
                  <span className="text-[11px] text-neutral-400 shrink-0">
                    {msg.profiles?.display_name}
                  </span>
                  {isStaff && (
                    <button
                      type="button"
                      onClick={() => onUnpin(msg.id)}
                      className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-300 hover:text-error-500 hover:bg-error-50 active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none"
                      aria-label={`Unpin: ${msg.content?.slice(0, 30) ?? 'message'}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


/* ------------------------------------------------------------------ */
/*  Main unified chat room                                             */
/* ------------------------------------------------------------------ */

export default function ChatRoomPage() {
  const { collectiveId: rawCollectiveId, channelId } = useParams<{
    collectiveId?: string
    channelId?: string
  }>()

  const mode: ChatMode = channelId ? 'channel' : 'collective'
  const isChannel = mode === 'channel'
  const isCollective = mode === 'collective'
  const collectiveId = rawCollectiveId

  const { toast } = useToast()
  const { user, isStaff, isAdmin, isSuperAdmin } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const { navMode } = useLayout()
  const keyboardOpen = useKeyboardOpen()
  const hasBottomTabs = navMode === 'bottom-tabs' && !keyboardOpen

  /* ---- Collective-specific hooks ---- */
  const { data: collective } = useCollective(isCollective ? collectiveId : undefined)
  const { isAssistLeader, isCoLeader, isLeader } = useCollectiveRole(isCollective ? collectiveId : undefined)
  const { data: memberRoles = new Map() } = useCollectiveMemberRoles(isCollective ? collectiveId : undefined)
  const { data: pinnedMessages = [] } = usePinnedMessages(isCollective ? collectiveId : undefined)
  const collectiveMarkRead = useMarkChatRead(isCollective ? collectiveId : undefined)
  const collectiveSend = useSendMessage()
  const editMessage = useEditMessage()
  const collectiveDelete = useDeleteMessage()
  const collectivePin = usePinMessage()
  const createPoll = useCreatePoll()
  const createAnnouncement = useCreateAnnouncement()
  const createCarpool = useCreateCarpool()
  const inviteCollaborator = useInviteCollaborator()
  const { typingText, sendTyping, stopTyping } = useTyping(isCollective ? collectiveId : undefined)
  const { isOffline } = useOffline()
  const { data: blockedUsers } = useBlockedUsers()
  // Member roster used to resolve `@DisplayName` strings → user_ids on send.
  const { data: collectiveMembers } = useCollectiveMembers(isCollective ? collectiveId : undefined)
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      (collectiveMembers ?? [])
        .filter((m) => m.profiles?.id && m.profiles?.display_name)
        .map((m) => ({
          user_id: m.profiles!.id,
          display_name: m.profiles!.display_name!,
          avatar_url: m.profiles!.avatar_url ?? null,
        })),
    [collectiveMembers],
  )
  const blockedIds = useMemo(
    () => new Set((blockedUsers ?? []).map((b) => b.blocked_id)),
    [blockedUsers],
  )

  /* ---- Channel-specific hooks ---- */
  const { data: channels } = useMyStaffChannels()
  const channel = isChannel ? channels?.find((c) => c.id === channelId) : undefined
  const channelMarkRead = useMarkChannelRead()
  const channelSend = useSendChannelMessage()
  const channelDelete = useDeleteChannelMessage()
  const channelPin = usePinChannelMessage()

  /* ---- Shared leader check ---- */
  const isLeaderOrAbove = isCollective
    ? (isAssistLeader || isCoLeader || isLeader || isStaff || isAdmin || isSuperAdmin)
    : (isStaff || isAdmin || isSuperAdmin)

  const effectiveCollectiveId = isCollective ? collectiveId : (channel?.collective_id ?? undefined)

  /* ---- Messages ---- */
  const collectiveMessages = useChatMessages(isCollective ? collectiveId : undefined)
  const channelMessages = useChannelMessages(isChannel ? channelId : undefined)

  const isLoading = isCollective ? collectiveMessages.isLoading : channelMessages.isLoading
  const isError = isCollective ? collectiveMessages.isError : channelMessages.isError
  const showLoading = useDelayedLoading(isLoading)
  const hasNextPage = isCollective ? collectiveMessages.hasNextPage : channelMessages.hasNextPage
  const isFetchingNextPage = isCollective ? collectiveMessages.isFetchingNextPage : channelMessages.isFetchingNextPage
  const fetchNextPage = isCollective ? collectiveMessages.fetchNextPage : channelMessages.fetchNextPage

  // Flatten, normalise, and filter blocked users from display
  const allMessages: AnyMessage[] = useMemo(() => {
    let msgs: AnyMessage[]
    if (isCollective) {
      if (!collectiveMessages.data?.pages) return []
      msgs = collectiveMessages.data.pages.flat().reverse()
    } else {
      msgs = channelMessages.messages ?? []
    }
    // Filter out messages from blocked users
    if (blockedIds.size > 0) {
      msgs = msgs.filter((m) => !m.user_id || !blockedIds.has(m.user_id))
    }
    return msgs
  }, [isCollective, collectiveMessages.data, channelMessages.messages, blockedIds])

  // Group by date (used for rendering)
  const messageGroups = useMemo(() => {
    const groups: { date: string; messages: AnyMessage[] }[] = []
    let currentDate = ''
    for (const msg of allMessages) {
      const createdAt = 'created_at' in msg ? msg.created_at : ''
      const d = new Date(createdAt!).toDateString()
      if (d !== currentDate) {
        currentDate = d
        groups.push({ date: createdAt!, messages: [msg] })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }
    return groups
  }, [allMessages])

  /* ---- Broadcast log ---- */
  const broadcastCollectiveId = isLeaderOrAbove ? effectiveCollectiveId : undefined
  const { data: broadcastLog = [] } = useBroadcastLog(broadcastCollectiveId)
  const sendBroadcast = useSendBroadcastNotification()

  /* ---- Camera / upload ---- */
  const { pickFromGallery } = useCamera()
  const chatUpload = useImageUpload({ bucket: 'chat-images' })

  /* ---- Draft (collective only) ---- */
  const savedDraft = isCollective && collectiveId ? getChatDraft(collectiveId) : null

  /* ---- State ---- */
  const [replyTo, setReplyTo] = useState<AnyMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageWithSender | null>(null)
  const [editText, setEditText] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<AnyMessage | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [showPollSheet, setShowPollSheet] = useState(false)
  const [showAnnouncementSheet, setShowAnnouncementSheet] = useState(false)
  const [announcementType, setAnnouncementType] = useState<'announcement' | 'event_invite' | 'rsvp'>('announcement')
  const [showBroadcastSheet, setShowBroadcastSheet] = useState(false)
  const [showCarpoolSheet, setShowCarpoolSheet] = useState(false)
  const [showManageMembers, setShowManageMembers] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false)
  const [showReportSheet, setShowReportSheet] = useState(false)
  const [reportTarget, setReportTarget] = useState<AnyMessage | null>(null)
  const [showBlockSheet, setShowBlockSheet] = useState(false)
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null)

  /* ---- Refs ---- */
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Reset scroll on room switch
  const roomKey = channelId ?? collectiveId

  /* ---- Mark read ---- */
  useEffect(() => {
    if (allMessages.length > 0 && !showScrollDown) {
      if (isCollective) {
        collectiveMarkRead()
      } else if (channelId) {
        channelMarkRead.mutate({ channelId, collectiveId: channel?.collective_id })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, allMessages.length, showScrollDown])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' })
    setShowScrollDown(false)
  }

  /* ---- Send message ---- */
  const handleSend = useCallback(async (text: string) => {
    if (!user) return

    if (isCollective) {
      if (!collectiveId) return
      if (isCollective) stopTyping()

      if (editingMessage) {
        if (isOffline) {
          toast.warning('Cannot edit messages while offline')
          return
        }
        await editMessage.mutateAsync({
          messageId: editingMessage.id,
          content: text,
          collectiveId,
        })
        setEditingMessage(null)
        setEditText('')
        return
      }

      removeChatDraft(collectiveId)

      if (isOffline) {
        queueOfflineAction('chat-message', {
          collectiveId,
          userId: user.id,
          content: text,
          replyToId: replyTo?.id,
        })
        toast.info('Message queued - will send when back online')
        setReplyTo(null)
        return
      }

      try {
        const sentRow = await collectiveSend.mutateAsync({
          collectiveId,
          content: text,
          replyToId: replyTo?.id,
        })
        // Resolve @mentions and fire notifications via SECURITY DEFINER RPC.
        // Best-effort, non-blocking: a failure here doesn't unsend the message.
        const mentionedIds = resolveMentionedUserIds(text, mentionCandidates)
        if (mentionedIds.length > 0 && sentRow?.id) {
          supabase
            .rpc('notify_chat_mentions', {
              p_message_id: sentRow.id,
              p_mentioned_user_ids: mentionedIds,
            })
            .then(({ error }) => {
              if (error) console.warn('[chat] mention RPC failed:', error.message)
            })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Message failed to send'
        toast.error(msg)
      }
      setReplyTo(null)
    } else {
      if (!channelId || !text.trim()) return
      channelSend.mutate({
        channelId,
        collectiveId: channel?.collective_id ?? null,
        content: text.trim(),
        replyToId: replyTo?.id,
      })
      setReplyTo(null)
    }
  }, [user, isCollective, collectiveId, channelId, channel, editingMessage, isOffline, replyTo, stopTyping, editMessage, collectiveSend, channelSend, toast])

  /* ---- Attach image ---- */
  const handleAttach = useCallback(async () => {
    const result = await pickFromGallery()
    if (!result) return
    try {
      const uploaded = await chatUpload.upload(result.blob)
      if (isCollective && collectiveId) {
        await collectiveSend.mutateAsync({
          collectiveId,
          imageUrl: uploaded.url,
          messageType: 'image',
        })
      } else if (channelId) {
        channelSend.mutate({
          channelId,
          collectiveId: channel?.collective_id ?? null,
          content: '',
          imageUrl: uploaded.url,
        })
      }
    } catch {
      toast.error('Failed to upload image')
    }
  }, [isCollective, collectiveId, channelId, channel, pickFromGallery, chatUpload, collectiveSend, channelSend, toast])

  /* ---- Attach HTML ---- */
  /* ---- Message actions ---- */
  const handleMessageLongPress = useCallback((msg: AnyMessage) => {
    if (msg._optimistic || msg.is_deleted) return
    setSelectedMessage(msg)
  }, [])

  const handleReply = useCallback(() => {
    if (selectedMessage) {
      setReplyTo(selectedMessage)
      setSelectedMessage(null)
    }
  }, [selectedMessage])

  const handleEdit = useCallback(() => {
    if (selectedMessage && isCollective) {
      setEditingMessage(selectedMessage as ChatMessageWithSender)
      setEditText(selectedMessage.content ?? '')
      setSelectedMessage(null)
    }
  }, [selectedMessage, isCollective])

  const handleDelete = useCallback(async () => {
    if (!selectedMessage) return
    const target = selectedMessage
    setSelectedMessage(null)
    try {
      if (isCollective && collectiveId) {
        await collectiveDelete.mutateAsync({
          messageId: target.id,
          collectiveId,
        })
      } else if (channelId) {
        await channelDelete.mutateAsync({
          messageId: target.id,
          channelId,
        })
      }
      toast.info('Message deleted')
    } catch {
      toast.error('Failed to delete message')
    }
  }, [selectedMessage, isCollective, collectiveId, channelId, collectiveDelete, channelDelete, toast])

  const handlePin = useCallback(async () => {
    if (!selectedMessage) return
    try {
      if (isCollective && collectiveId) {
        await collectivePin.mutateAsync({
          messageId: selectedMessage.id,
          collectiveId,
          pinned: !selectedMessage.is_pinned,
        })
      } else if (channelId) {
        await channelPin.mutateAsync({
          messageId: selectedMessage.id,
          channelId,
          pinned: !selectedMessage.is_pinned,
        })
      }
      toast.success(selectedMessage.is_pinned ? 'Message unpinned' : 'Message pinned')
    } catch {
      toast.error('Failed to update pin')
    }
    setSelectedMessage(null)
  }, [selectedMessage, isCollective, collectiveId, channelId, collectivePin, channelPin, toast])

  /* ---- Poll creation ---- */
  const handleCreatePoll = async (data: {
    question: string
    options: string[]
    allowMultiple: boolean
    anonymous: boolean
  }) => {
    if (isCollective && collectiveId) {
      setShowPollSheet(false)
      toast.info('Creating poll...')
      createPoll.mutate(
        { collectiveId, ...data },
        {
          onSuccess: () => toast.success('Poll posted!'),
          onError: () => toast.error('Failed to create poll'),
        },
      )
    } else if (channelId && user) {
      setShowPollSheet(false)
      setCreatingPoll(true)
      toast.info('Creating poll...')
      try {
        const pollOptions = data.options.map((text, i) => ({
          id: `opt-${Date.now()}-${i}`,
          text,
        }))
        const { data: poll, error } = await supabase
          .from('chat_polls')
          .insert({
            collective_id: channel?.collective_id || null,
            created_by: user.id,
            question: data.question,
            options: pollOptions,
            allow_multiple: data.allowMultiple,
            anonymous: data.anonymous,
          })
          .select()
          .single()
        if (error) throw error

        await supabase
          .from('chat_messages')
          .insert({
            channel_id: channelId,
            collective_id: channel?.collective_id || null,
            user_id: user.id,
            content: data.question,
            message_type: 'poll',
            poll_id: poll.id,
          })
        toast.success('Poll posted!')
      } catch {
        toast.error('Failed to create poll')
      } finally {
        setCreatingPoll(false)
      }
    }
  }

  /* ---- Announcement creation ---- */
  const handleCreateAnnouncement = async (data: {
    type: 'announcement' | 'event_invite' | 'rsvp'
    title: string
    body?: string
    metadata?: Record<string, unknown>
  }) => {
    if (isCollective && collectiveId) {
      setShowAnnouncementSheet(false)
      toast.info('Posting announcement...')
      createAnnouncement.mutate(
        { collectiveId, ...data, metadata: data.metadata as Record<string, Json | undefined> | undefined },
        {
          onSuccess: () => toast.success('Announcement posted!'),
          onError: () => toast.error('Failed to create announcement'),
        },
      )
    } else if (channelId && user) {
      setShowAnnouncementSheet(false)
      setCreatingAnnouncement(true)
      toast.info('Posting announcement...')
      try {
        const { data: announcement, error } = await supabase
          .from('chat_announcements')
          .insert({
            collective_id: channel?.collective_id || null,
            created_by: user.id,
            type: data.type,
            title: data.title,
            body: data.body ?? null,
            metadata: (data.metadata ?? {}) as Json,
          })
          .select()
          .single()
        if (error) throw error

        await supabase
          .from('chat_messages')
          .insert({
            channel_id: channelId,
            collective_id: channel?.collective_id || null,
            user_id: user.id,
            content: data.title,
            message_type: 'announcement',
            announcement_id: announcement.id,
          })
        toast.success('Announcement posted!')
      } catch {
        toast.error('Failed to create announcement')
      } finally {
        setCreatingAnnouncement(false)
      }
    }
  }

  /* ---- Invite collectives (collective only) ---- */
  const handleInviteCollectives = (data: {
    eventId: string
    collectiveIds: string[]
    message?: string
  }) => {
    if (!collectiveId) return
    const count = data.collectiveIds.length
    toast.info(`Inviting ${count} collective${count !== 1 ? 's' : ''} to collaborate...`)
    Promise.all(
      data.collectiveIds.map((targetId) =>
        inviteCollaborator.mutateAsync({
          eventId: data.eventId,
          collectiveId: targetId,
          hostCollectiveId: collectiveId,
          message: data.message,
        }),
      ),
    )
      .then(() => toast.success(`Collaboration invite${count !== 1 ? 's' : ''} sent!`))
      .catch(() => toast.error('Some invites failed to send'))
  }

  /* ---- Carpool creation (collective only) ---- */
  const handleCreateCarpool = (data: CreateCarpoolSubmitData) => {
    if (!isCollective || !collectiveId) {
      toast.error('Carpools can only be created in a collective chat')
      return
    }
    setShowCarpoolSheet(false)
    toast.info('Posting carpool...')
    createCarpool.mutate(
      {
        collective_id: collectiveId,
        event_id: data.event_id,
        departure_point_text: data.departure_point_text,
        departure_time: data.departure_time,
        seats_total: data.seats_total,
        notes: data.notes,
      },
      {
        onSuccess: () => toast.success('Carpool posted!'),
        // useCreateCarpool already shows an error toast on failure.
      },
    )
  }

  /* ---- Broadcast ---- */
  const handleBroadcast = (data: { title: string; body: string }) => {
    const bcCollectiveId = effectiveCollectiveId
    if (!bcCollectiveId) {
      toast.error('Broadcast notifications require a collective')
      return
    }
    setShowBroadcastSheet(false)
    toast.info('Sending notification...')
    sendBroadcast.mutate(
      { collectiveId: bcCollectiveId, ...data },
      {
        onSuccess: (result) => toast.success(`Notification sent to ${result?.sent ?? 0} members`),
        onError: () => toast.error('Failed to send notification'),
      },
    )
  }

  /* ---- Title ---- */
  const title = isCollective
    ? (collective?.name ?? 'Chat')
    : (channel ? cleanChannelName(channel.name) : 'Staff Chat')

  /* ---- Not found guard ---- */
  if (isChannel && !channelId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 max-h-dvh overflow-hidden relative bg-white" style={{ paddingTop: 'var(--safe-top)' }}>
        <Header title="Staff Chat" back className="!relative !top-0" />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState illustration="empty" title="Channel not found" description="This channel may have been removed." />
        </div>
      </div>
    )
  }

  /* ---- Loading (collective uses Page wrapper) ---- */
  if (isCollective && showLoading) {
    return (
      <Page swipeBack header={<Header title="Chat" back />}>
        <div className="py-4">
          <Skeleton variant="list-item" count={8} />
        </div>
      </Page>
    )
  }

  /* ---- Error state ---- */
  if (isError) {
    return (
      <Page swipeBack header={<Header title="Chat" back />}>
        <EmptyState
          illustration="error"
          title="Couldn't load messages"
          description="Something went wrong loading this chat. Check your connection and try again."
          action={{ label: 'Back to chats', to: '/chat' }}
        />
      </Page>
    )
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 max-h-dvh overflow-hidden relative bg-white"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      {/* Header - shrink-0 keeps it pinned at the top of the flex column */}
      <motion.div
        className="shrink-0"
        variants={isCollective && !shouldReduceMotion ? fadeUp : undefined}
        initial={isCollective ? 'hidden' : undefined}
        animate={isCollective ? 'visible' : undefined}
      >
        <Header
          title={title}
          back
          showTitle
          className="!relative !top-0"
          rightActions={
            <div className="flex items-center gap-1">
              <ChatSwitcherDropdown
                currentCollectiveId={isCollective ? collectiveId : undefined}
                currentChannelId={isChannel ? channelId : undefined}
              />
              {isCollective && isLeaderOrAbove && (
                <button
                  type="button"
                  onClick={() => setShowManageMembers(true)}
                  aria-label="Manage members"
                  className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-500 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                >
                  <Users size={20} />
                </button>
              )}
              <button
                type="button"
                onClick={() => isCollective ? setShowSearch(true) : undefined}
                aria-label="Search messages"
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-500 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Search size={20} />
              </button>
            </div>
          }
        />
      </motion.div>

      {/* Pinned messages (collective only) */}
      {isCollective && (
        <PinnedMessageBar
          messages={pinnedMessages as ChatMessageWithSender[]}
          isStaff={isLeaderOrAbove}
          onUnpin={async (messageId) => {
            try {
              await collectivePin.mutateAsync({ messageId, collectiveId: collectiveId!, pinned: false })
              toast.success('Message unpinned')
            } catch {
              toast.error('Failed to unpin')
            }
          }}
        />
      )}

      {/* Messages area */}
      <ChatMessageList
        isCollective={isCollective}
        isChannel={isChannel}
        messageGroups={messageGroups}
        allMessages={allMessages}
        memberRoles={memberRoles}
        effectiveCollectiveId={effectiveCollectiveId}
        showLoading={showLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        typingText={isCollective ? typingText ?? undefined : undefined}
        onMessageLongPress={handleMessageLongPress}
        onProfileTap={(userId) => setProfileUserId(userId)}
        scrollContainerRef={scrollContainerRef}
        messagesEndRef={messagesEndRef}
        onScrollChange={setShowScrollDown}
      />

      {/* Reply bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 bg-white border-t border-neutral-100 px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary-50">
                <Reply size={14} className="text-primary-500 shrink-0" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-neutral-700">{replyTo.profiles?.display_name ?? 'Unknown'}</p>
                <p className="text-xs text-neutral-500 truncate">{replyTo.content ?? 'Image'}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit bar (collective only) */}
      {isCollective && (
        <AnimatePresence>
          {editingMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 bg-warning-50 border-t border-neutral-100 px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-warning-50">
                  <Pencil size={14} className="text-warning-700 shrink-0" />
                </div>
                <p className="text-xs font-bold text-warning-700 flex-1">Editing message</p>
                <button
                  type="button"
                  onClick={() => { setEditingMessage(null); setEditText('') }}
                  aria-label="Cancel edit"
                  className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            aria-label="Scroll to latest messages"
            className={cn(
              'absolute right-4 z-20 flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-neutral-100 text-neutral-600 hover:bg-neutral-50 active:scale-[0.93] transition-transform duration-150 cursor-pointer select-none',
              hasBottomTabs ? 'bottom-32' : 'bottom-20',
            )}
          >
            <ArrowDown size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Upload progress */}
      {(chatUpload.uploading || chatUpload.error) && (
        <div className="shrink-0 px-4 py-1">
          <UploadProgress
            progress={chatUpload.progress}
            uploading={chatUpload.uploading}
            error={chatUpload.error}
          />
        </div>
      )}

      {/* Offline indicator (collective only) */}
      {isCollective && isOffline && (
        <div className="shrink-0 px-4 py-1.5">
          <OfflineIndicator
            dataUpdatedAt={collectiveMessages.data?.pages?.[0]?.[0]?.created_at ? new Date(collectiveMessages.data.pages[0][0].created_at).getTime() : undefined}
          />
        </div>
      )}

      {/* Message input */}
      <motion.div
        className="shrink-0"
        variants={isCollective && !shouldReduceMotion ? fadeUp : undefined}
        initial={isCollective ? 'hidden' : undefined}
        animate={isCollective ? 'visible' : undefined}
      >
        <MessageInput
          onSend={handleSend}
          onAttach={isOffline ? undefined : handleAttach}
          onTyping={isCollective ? sendTyping : undefined}
          placeholder={
            editingMessage
              ? 'Edit message...'
              : isOffline && isCollective
                ? 'Type a message (will send when online)...'
                : isChannel
                  ? 'Message staff...'
                  : 'Type a message...'
          }
          initialValue={editingMessage ? editText : (savedDraft?.content ?? '')}
          onValueChange={
            isCollective && collectiveId && !editingMessage
              ? (text) => saveChatDraft(collectiveId, text, replyTo?.id)
              : undefined
          }
          disabled={isChannel ? channelSend.isPending : undefined}
          padForTabBar={hasBottomTabs}
          isLeader={isLeaderOrAbove}
          onCreatePoll={() => setShowPollSheet(true)}
          onCreateAnnouncement={() => {
            setAnnouncementType('announcement')
            setShowAnnouncementSheet(true)
          }}
          onCreateCarpool={isCollective ? () => setShowCarpoolSheet(true) : undefined}
          onBroadcastNotification={() => setShowBroadcastSheet(true)}
          mentionCollectiveId={isCollective ? collectiveId : undefined}
          mentionSelfUserId={user?.id}
        />

        {/* Carpool creation sheet (collective only) */}
        {isCollective && (
          <CreateCarpoolSheet
            open={showCarpoolSheet}
            onClose={() => setShowCarpoolSheet(false)}
            onSubmit={handleCreateCarpool}
            loading={createCarpool.isPending}
            collectiveId={collectiveId}
          />
        )}
      </motion.div>

      {/* Message actions sheet */}
      <MessageActionsSheet
        message={selectedMessage}
        isModerator={isLeaderOrAbove}
        isOwnMessage={selectedMessage?.user_id === user?.id}
        onClose={() => setSelectedMessage(null)}
        onReply={handleReply}
        onEdit={isCollective ? handleEdit : undefined}
        onDelete={handleDelete}
        onPin={handlePin}
        onReport={() => {
          setReportTarget(selectedMessage)
          setShowReportSheet(true)
          setSelectedMessage(null)
        }}
        onBlockUser={() => {
          if (selectedMessage?.user_id) {
            const msg = selectedMessage as ChatMessageWithSender
            setBlockTarget({
              id: selectedMessage.user_id,
              name: msg.profiles?.display_name ?? 'this user',
            })
            setShowBlockSheet(true)
          }
          setSelectedMessage(null)
        }}
      />

      {/* Report content sheet */}
      {reportTarget && (
        <ReportContentSheet
          open={showReportSheet}
          onClose={() => { setShowReportSheet(false); setReportTarget(null) }}
          contentId={reportTarget.id}
          contentType="chat_message"
        />
      )}

      {/* Block user sheet */}
      {blockTarget && (
        <BlockUserSheet
          open={showBlockSheet}
          onClose={() => { setShowBlockSheet(false); setBlockTarget(null) }}
          userId={blockTarget.id}
          userName={blockTarget.name}
        />
      )}

      {/* Leader panels: polls, announcements, broadcast, manage members */}
      <ChatLeaderPanel
        isCollective={isCollective}
        isLeaderOrAbove={isLeaderOrAbove}
        collectiveId={collectiveId}
        collectiveName={collective?.name}
        channelName={channel?.name}
        showPollSheet={showPollSheet}
        onClosePollSheet={() => setShowPollSheet(false)}
        onCreatePoll={handleCreatePoll}
        pollLoading={isCollective ? createPoll.isPending : creatingPoll}
        showAnnouncementSheet={showAnnouncementSheet}
        onCloseAnnouncementSheet={() => setShowAnnouncementSheet(false)}
        onCreateAnnouncement={handleCreateAnnouncement}
        onInviteCollectives={isCollective ? handleInviteCollectives : undefined}
        announcementLoading={isCollective ? createAnnouncement.isPending : creatingAnnouncement}
        announcementType={announcementType}
        showBroadcastSheet={showBroadcastSheet}
        onCloseBroadcastSheet={() => setShowBroadcastSheet(false)}
        onBroadcast={handleBroadcast}
        broadcastLoading={sendBroadcast.isPending}
        broadcastLog={broadcastLog}
        showManageMembers={showManageMembers}
        onCloseManageMembers={() => setShowManageMembers(false)}
      />

      {/* Search overlay (collective only) */}
      {isCollective && (
        <AnimatePresence>
          {showSearch && collectiveId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ChatSearch
                collectiveId={collectiveId}
                onClose={() => setShowSearch(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Profile modal */}
      <ProfileModal userId={profileUserId} open={!!profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  )
}
