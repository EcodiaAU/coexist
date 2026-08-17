import { type ReactNode, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MessageCircle, Users, Lock, Globe, MapPin, Leaf, Shield, Tent, Calendar } from 'lucide-react'
import { Page } from '@/components/page'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'
import { useMyCollectives, useCollectives } from '@/hooks/use-collective'
import { useUnreadCounts } from '@/hooks/use-chat'
import { useMyStaffChannels, useChannelUnreadCounts, type StaffChannel } from '@/hooks/use-staff-channels'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useAuth } from '@/hooks/use-auth'
import { COLLECTIVE_ROLE_RANK as ROLE_RANK } from '@/lib/constants'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { formatDate, formatDateShort, localDateIn } from '@/lib/date-format'

const CHAT_REDIRECTED_KEY = 'coexist-chat-redirected'

const CHANNEL_TYPE_CONFIG: Record<string, {
  icon: typeof Globe
  iconBg: string
  badge: string
  label: string
  /** Full-bleed gradient used as the tile background (staff channels carry no
      cover image, so the tile leads with a colour-coded nature gradient). */
  grad: string
}> = {
  staff_national: {
    icon: Globe,
    iconBg: 'bg-plum-50 text-plum-600',
    badge: 'bg-plum-50 text-plum-700',
    label: 'National',
    grad: 'bg-gradient-to-br from-plum-600 to-plum-800',
  },
  staff_state: {
    icon: MapPin,
    iconBg: 'bg-info-50 text-info-600',
    badge: 'bg-info-50 text-info-700',
    label: 'State',
    grad: 'bg-gradient-to-br from-info-600 to-info-800',
  },
  staff_collective: {
    icon: Users,
    iconBg: 'bg-primary-50 text-primary-600',
    badge: 'bg-primary-50 text-primary-700',
    label: 'Staff',
    grad: 'bg-gradient-to-br from-primary-600 to-primary-800',
  },
  campout: {
    icon: Tent,
    iconBg: 'bg-primary-50 text-primary-600',
    badge: 'bg-primary-50 text-primary-700',
    label: 'Campout',
    grad: 'bg-gradient-to-br from-moss-600 to-moss-800',
  },
}

/** Strip redundant words from channel name for cleaner display */
function cleanChannelName(name: string): string {
  return name
    .replace(/\bCollective\b\s*/i, '')
    .replace(/\bStaff\b\s*/i, '')
    .trim()
    || name
}

/* ------------------------------------------------------------------ */
/*  ChatTile - full-bleed image tile (matches the homepage events cards) */
/* ------------------------------------------------------------------ */

/** A single conversation rendered as a full-bleed tile: cover imagery (or a
    colour-coded nature gradient when the entity carries no image) fills the
    tile, a dark bottom-up gradient keeps text legible, and the title + meta
    sit over the image. This is the same composition as Card.Overlay on the
    homepage events sections, so chat reads as imagery-first, not a UI list. */
function ChatTile({
  to,
  ariaLabel,
  image,
  imageAlt,
  positionX,
  positionY,
  gradientClass,
  watermark,
  hasUnread,
  badge,
  children,
}: {
  to: string
  ariaLabel: string
  image?: string | null
  imageAlt?: string
  positionX?: number | null
  positionY?: number | null
  gradientClass?: string
  watermark?: ReactNode
  hasUnread?: boolean
  badge?: ReactNode
  children: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
      <Link
        to={to}
        aria-label={ariaLabel}
        className={cn(
          'group relative block w-full overflow-hidden rounded-md shadow-sm',
          'aspect-square transition-transform duration-200 active:scale-[0.98]',
          hasUnread && 'ring-2 ring-primary-400',
        )}
      >
        {image ? (
          <OptimizedImage
            src={image}
            alt={imageAlt ?? ''}
            aspectRatio="1/1"
            wrapperClassName="absolute inset-0"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="absolute inset-0"
            imgStyle={coverImagePositionStyle(positionX, positionY)}
          />
        ) : (
          <div className={cn('absolute inset-0', gradientClass ?? 'bg-gradient-to-br from-primary-600 to-moss-700')} aria-hidden="true" />
        )}

        {/* Large low-opacity nature mark for image-less tiles */}
        {!image && watermark && (
          <div className="absolute -right-4 -top-4 text-white/10 pointer-events-none" aria-hidden="true">
            {watermark}
          </div>
        )}

        {/* Legibility gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden="true" />

        {/* Top-right badge slot (unread count / lock) */}
        {badge && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {badge}
          </div>
        )}

        {/* Bottom overlay content (title + meta) */}
        <div className="absolute inset-0 flex flex-col justify-end p-4">
          {children}
        </div>
      </Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Staff channel row                                                  */
/* ------------------------------------------------------------------ */

function StaffChannelRow({ channel, unread }: { channel: StaffChannel; unread: number; index: number }) {
  const hasUnread = unread > 0
  const config = CHANNEL_TYPE_CONFIG[channel.type] ?? CHANNEL_TYPE_CONFIG.staff_collective
  const Icon = config.icon
  // Campout chats are open to ticket holders, not staff-gated, so they skip
  // the lock badge and the "Staff only" caption the staff channels carry.
  const isCampout = channel.type === 'campout'
  // Campout cards show WHEN the campout is (Tate 2026-08-17) so members can tell
  // them apart at a glance. Multi-day campouts render a start-to-end range;
  // single-day render just the day. Dates are the event's stored wall-clock, so
  // they go through the floating-local date-format helpers. Staff/carpool
  // channels carry no event date and render nothing.
  const campoutDate =
    isCampout && channel.date_start
      ? channel.date_end &&
        localDateIn('', channel.date_end) !== localDateIn('', channel.date_start)
        ? `${formatDate(channel.date_start)} - ${formatDateShort(channel.date_end)}`
        : formatDate(channel.date_start)
      : null

  return (
    <ChatTile
      to={`/chat/channel/${channel.id}`}
      ariaLabel={channel.name}
      image={channel.cover_image_url}
      positionX={channel.cover_image_position_x}
      positionY={channel.cover_image_position_y}
      gradientClass={config.grad}
      watermark={<Icon size={132} strokeWidth={1} />}
      hasUnread={hasUnread}
      badge={
        <>
          {!isCampout && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <Lock size={12} strokeWidth={2} className="text-white" />
            </span>
          )}
          {hasUnread && (
            <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-primary-700">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </>
      }
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-white">
          <Icon size={11} strokeWidth={2} />
          {config.label}
        </span>
        <span className="text-[11px] font-medium text-white/75">
          {isCampout ? 'Group chat' : 'Staff only'}
        </span>
      </div>
      <h3 className="font-heading text-lg font-bold text-white leading-tight drop-shadow-sm line-clamp-2">
        {cleanChannelName(channel.name)}
      </h3>
      {campoutDate && (
        <div className="flex items-center gap-1.5 mt-1.5 text-white/85">
          <Calendar size={12} strokeWidth={2} className="shrink-0" />
          <span className="text-xs font-medium">{campoutDate}</span>
        </div>
      )}
    </ChatTile>
  )
}

/* ------------------------------------------------------------------ */
/*  Collective chat row                                                */
/* ------------------------------------------------------------------ */

function CollectiveChatRow({
  collective,
  collectiveId,
  unread,
}: {
  collective: {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    region: string | null
    state: string | null
    member_count: number | null
  }
  collectiveId: string
  unread: number
  index: number
}) {
  const hasUnread = unread > 0

  return (
    <ChatTile
      to={`/chat/${collectiveId}`}
      ariaLabel={collective.name}
      image={collective.cover_image_url}
      imageAlt={collective.name}
      gradientClass="bg-gradient-to-br from-primary-600 to-moss-700"
      watermark={<Leaf size={132} strokeWidth={1} />}
      hasUnread={hasUnread}
      badge={
        hasUnread ? (
          <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-primary-700">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null
      }
    >
      <h3 className="font-heading text-lg font-bold text-white leading-tight drop-shadow-sm line-clamp-2">
        {collective.name}
      </h3>
      <div className="flex items-center gap-3 mt-1.5 text-white/85">
        <span className="flex items-center gap-1 text-xs font-medium">
          <Users size={12} strokeWidth={2} className="shrink-0" />
          {collective.member_count}
        </span>
        {(collective.region || collective.state) && (
          <span className="flex items-center gap-1 text-xs font-medium truncate">
            <MapPin size={12} strokeWidth={2} className="shrink-0" />
            {collective.region ?? collective.state}
          </span>
        )}
      </div>
    </ChatTile>
  )
}

/* ------------------------------------------------------------------ */
/*  Section divider                                                    */
/* ------------------------------------------------------------------ */

function SectionDivider({ icon: Icon, label }: { icon: typeof Lock; label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-3">
      <Icon size={12} strokeWidth={2} className="text-neutral-400" />
      <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
        {label}
      </p>
      <div className="h-px flex-1 bg-neutral-100" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Chat list page                                                     */
/* ------------------------------------------------------------------ */

export default function ChatListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { profile, isStaff, isAdmin, isSuperAdmin } = useAuth()
  const isGlobalStaff = isStaff || isAdmin || isSuperAdmin
  const { data: myCollectives, isLoading, isError } = useMyCollectives()
  const { data: allCollectives } = useCollectives()
  const { data: unreadCounts = {} } = useUnreadCounts()
  const { data: staffChannels, isLoading: channelsLoading, isError: channelsError } = useMyStaffChannels()
  const { data: channelUnreads = {} } = useChannelUnreadCounts()
  const showLoading = useDelayedLoading(isLoading && channelsLoading)

  // For staff/admin: collectives they're NOT already a member of
  const myCollectiveIds = new Set(myCollectives?.map((m) => m.collective_id) ?? [])
  const otherCollectives = isGlobalStaff
    ? (allCollectives ?? []).filter((c) => !myCollectiveIds.has(c.id))
    : []

  // Auto-redirect to primary collective chat (once per session)
  useEffect(() => {
    if (sessionStorage.getItem(CHAT_REDIRECTED_KEY)) return
    if (isLoading || !myCollectives?.length) return

    const myCollectiveIds = new Set(myCollectives.map((m) => m.collective_id))

    // Use user's chosen primary chat if they've set one and still belong to that collective
    const userPrimary = profile?.primary_chat_id
    if (userPrimary && myCollectiveIds.has(userPrimary)) {
      sessionStorage.setItem(CHAT_REDIRECTED_KEY, '1')
      navigate(`/chat/${userPrimary}`, { replace: true })
      return
    }

    // Fallback: pick primary collective by highest role, then earliest join
    const sorted = [...myCollectives].sort((a, b) => {
      const rankA = ROLE_RANK[a.role!] ?? 0
      const rankB = ROLE_RANK[b.role!] ?? 0
      if (rankB !== rankA) return rankB - rankA
      return new Date(a.joined_at!).getTime() - new Date(b.joined_at!).getTime()
    })

    const primaryId = sorted[0]?.collective_id
    if (primaryId) {
      sessionStorage.setItem(CHAT_REDIRECTED_KEY, '1')
      navigate(`/chat/${primaryId}`, { replace: true })
    }
  }, [isLoading, myCollectives, navigate, profile])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-collectives'] }),
      queryClient.invalidateQueries({ queryKey: ['collectives'] }),
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['my-staff-channels'] }),
      queryClient.invalidateQueries({ queryKey: ['channel-unread'] }),
    ])
  }, [queryClient])

  // Campout group chats render in their own section, not under "Staff only".
  // Everything else (staff_* + carpool) keeps its existing placement.
  const campoutChannels = (staffChannels ?? []).filter((c) => c.type === 'campout')
  const otherChannels = (staffChannels ?? []).filter((c) => c.type !== 'campout')
  const hasStaffChannels = otherChannels.length > 0
  const hasCampoutChannels = campoutChannels.length > 0

  if (showLoading) {
    return (
      <Page noBackground className="!px-0 bg-white">
        <div className="px-4 lg:px-6 pt-14 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square rounded-md bg-neutral-100 animate-pulse" />
          ))}
        </div>
      </Page>
    )
  }
  if (isLoading && channelsLoading) return null

  if (isError && channelsError) {
    return (
      <Page noBackground className="!px-0 bg-white">
        <div className="px-4 lg:px-6 pt-14">
          <EmptyState
            illustration="error"
            title="Something went wrong"
            description="We couldn't load your chats. Try again later."
          />
        </div>
      </Page>
    )
  }

  if (!myCollectives?.length && !hasStaffChannels && !hasCampoutChannels && !isGlobalStaff) {
    return (
      <Page noBackground className="!px-0 bg-white">
        <div className="px-4 lg:px-6 pt-14">
          <h1 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-6">
            Chat
          </h1>
          <EmptyState
            illustration="empty"
            title="No group chats yet"
            description="Join a collective to access group chat with other members"
            action={{ label: 'Explore Collectives', to: '/collectives' }}
          />
        </div>
      </Page>
    )
  }

  return (
    <Page noBackground className="!px-0 bg-white">
        <div className="px-4 lg:px-6">
            <motion.div
              className="pt-14 pb-6 space-y-6"
              variants={shouldReduceMotion ? undefined : stagger}
              initial="hidden"
              animate="visible"
            >

              {/* Campouts section */}
              {hasCampoutChannels && (
                <motion.div variants={fadeUp}>
                  <SectionDivider icon={Tent} label="Campouts" />
                  <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {campoutChannels.map((channel) => (
                      <StaffChannelRow
                        key={channel.id}
                        channel={channel}
                        unread={channelUnreads[channel.id] ?? 0}
                        index={0}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Staff Channels section */}
              {hasStaffChannels && (
                <motion.div variants={fadeUp}>
                  <SectionDivider icon={Lock} label="Staff Channels" />
                  <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {otherChannels.map((channel) => (
                      <StaffChannelRow
                        key={channel.id}
                        channel={channel}
                        unread={channelUnreads[channel.id] ?? 0}
                        index={0}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Collective Chats section */}
              {(myCollectives?.length ?? 0) > 0 && (
                <motion.div variants={fadeUp}>
                  <SectionDivider icon={MessageCircle} label="Collectives" />
                  <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {myCollectives!.map((membership) => {
                      const collective = membership.collectives as {
                        id: string
                        name: string
                        slug: string
                        cover_image_url: string | null
                        region: string | null
                        state: string | null
                        member_count: number
                      } | null

                      if (!collective) return null

                      return (
                        <CollectiveChatRow
                          key={membership.collective_id}
                          collective={collective}
                          collectiveId={membership.collective_id}
                          unread={unreadCounts[membership.collective_id] ?? 0}
                          index={0}
                        />
                      )
                    })}
                  </motion.div>
                </motion.div>
              )}

              {/* All Collectives section (staff/admin only) */}
              {isGlobalStaff && otherCollectives.length > 0 && (
                <motion.div variants={fadeUp}>
                  <SectionDivider icon={Shield} label="All Collectives" />
                  <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {otherCollectives.map((collective) => (
                      <CollectiveChatRow
                        key={collective.id}
                        collective={collective}
                        collectiveId={collective.id}
                        unread={0}
                        index={0}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
        </div>
    </Page>
  )
}
