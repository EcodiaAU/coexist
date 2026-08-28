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
/*  ChatRow - compact list row                                         */
/* ------------------------------------------------------------------ */

/** A single conversation as a LIST ROW, not a card and not a tile.
 *
 *  History (Tate 2026-08-27): this list started as bordered white cards, became
 *  full-bleed square image tiles (707b8eb1), and is now rows again at roughly
 *  the original height. The format is deliberately NOT the original card: no
 *  per-row box, border or shadow, a rounded-square cover thumbnail instead of a
 *  small avatar, hairline dividers doing the separating, and the unread count
 *  pulled out to the right edge where a messaging list expects it. Imagery is
 *  kept from the tile era, just scaled down to a thumbnail. */
function ChatRow({
  to,
  ariaLabel,
  image,
  imageAlt,
  positionX,
  positionY,
  gradientClass,
  fallbackIcon,
  hasUnread,
  unread,
  locked,
  title,
  meta,
}: {
  to: string
  ariaLabel: string
  image?: string | null
  imageAlt?: string
  positionX?: number | null
  positionY?: number | null
  gradientClass?: string
  fallbackIcon?: ReactNode
  hasUnread?: boolean
  unread?: number
  locked?: boolean
  title: string
  meta?: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
      <Link
        to={to}
        aria-label={ariaLabel}
        className={cn(
          'group flex items-center gap-3.5 py-3 px-1',
          'transition-colors duration-150 active:bg-neutral-50',
        )}
      >
        {/* Cover thumbnail. Rounded square, not a circle: these are places, not
            people, and the square keeps the cover photography readable. */}
        <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg">
          {image ? (
            <OptimizedImage
              src={image}
              alt={imageAlt ?? ''}
              aspectRatio="1/1"
              wrapperClassName="absolute inset-0"
              sizes="52px"
              className="absolute inset-0"
              imgStyle={coverImagePositionStyle(positionX, positionY)}
            />
          ) : (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                gradientClass ?? 'bg-gradient-to-br from-primary-600 to-moss-700',
              )}
              aria-hidden="true"
            >
              {fallbackIcon}
            </div>
          )}
          {locked && (
            <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md bg-black/55">
              <Lock size={9} strokeWidth={2.5} className="text-white" />
            </span>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-[15px] leading-snug',
              hasUnread ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800',
            )}
          >
            {title}
          </p>
          {meta && (
            <div className="mt-0.5 flex items-center gap-2 text-[12px] font-medium text-neutral-500">
              {meta}
            </div>
          )}
        </div>

        {/* Unread, at the right edge where a messaging list puts it */}
        {hasUnread && (
          <span className="ml-1 flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[11px] font-bold tabular-nums text-white">
            {(unread ?? 0) > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </motion.div>
  )
}

/** Dot separator between meta fragments. */
function MetaDot() {
  return <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-300" aria-hidden="true" />
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
  // Campout rows show WHEN the campout is (Tate 2026-08-17) so members can tell
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
    <ChatRow
      to={`/chat/channel/${channel.id}`}
      ariaLabel={channel.name}
      image={channel.cover_image_url}
      positionX={channel.cover_image_position_x}
      positionY={channel.cover_image_position_y}
      gradientClass={config.grad}
      fallbackIcon={<Icon size={22} strokeWidth={1.8} className="text-white/85" />}
      hasUnread={hasUnread}
      unread={unread}
      locked={!isCampout}
      title={cleanChannelName(channel.name)}
      meta={
        <>
          <span className="shrink-0">{config.label}</span>
          <MetaDot />
          {campoutDate ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Calendar size={11} strokeWidth={2} className="shrink-0" />
              {campoutDate}
            </span>
          ) : (
            <span className="truncate">{isCampout ? 'Group chat' : 'Staff only'}</span>
          )}
        </>
      }
    />
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
  const place = collective.region ?? collective.state

  return (
    <ChatRow
      to={`/chat/${collectiveId}`}
      ariaLabel={collective.name}
      image={collective.cover_image_url}
      imageAlt={collective.name}
      gradientClass="bg-gradient-to-br from-primary-600 to-moss-700"
      fallbackIcon={<Leaf size={22} strokeWidth={1.8} className="text-white/85" />}
      hasUnread={hasUnread}
      unread={unread}
      title={collective.name}
      meta={
        <>
          <span className="flex shrink-0 items-center gap-1">
            <Users size={11} strokeWidth={2} className="shrink-0" />
            {collective.member_count}
          </span>
          {place && (
            <>
              <MetaDot />
              <span className="flex min-w-0 items-center gap-1 truncate">
                <MapPin size={11} strokeWidth={2} className="shrink-0" />
                {place}
              </span>
            </>
          )}
        </>
      }
    />
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
  const { isStaff, isAdmin, isSuperAdmin } = useAuth()
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

  // Landing behaviour (Tate 2026-08-19): if the user belongs to MORE THAN ONE
  // chat, stay on the list so they can pick; only auto-open when they belong to
  // exactly one. "Chats" spans both collective chats (myCollectives) and
  // staff/campout channels (staffChannels), so a member of one collective plus
  // one campout counts as two and lands on the list. Runs once per session.
  useEffect(() => {
    if (sessionStorage.getItem(CHAT_REDIRECTED_KEY)) return
    // Wait until BOTH chat sources have resolved - redirecting on a half-loaded
    // count would auto-open a user who is actually in more than one chat.
    if (isLoading || channelsLoading) return

    const collectives = myCollectives ?? []
    const channels = staffChannels ?? []
    const totalChats = collectives.length + channels.length

    // More than one chat -> show the list (do not auto-open). No chats -> the
    // empty state renders; nothing to open.
    if (totalChats !== 1) return

    // Exactly one chat -> open it directly (preserves the prior single-chat UX).
    sessionStorage.setItem(CHAT_REDIRECTED_KEY, '1')
    if (collectives.length === 1) {
      navigate(`/chat/${collectives[0].collective_id}`, { replace: true })
    } else {
      navigate(`/chat/channel/${channels[0].id}`, { replace: true })
    }
  }, [isLoading, channelsLoading, myCollectives, staffChannels, navigate])

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
        <div className="px-4 lg:px-6 pt-14 pb-4 max-w-2xl divide-y divide-neutral-100">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 py-3 px-1">
              <div className="h-[52px] w-[52px] shrink-0 rounded-lg bg-neutral-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/5 rounded bg-neutral-100 animate-pulse" />
                <div className="h-3 w-1/4 rounded bg-neutral-100 animate-pulse" />
              </div>
            </div>
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
    <Page noBackground className="!px-0 bg-white" onRefresh={handleRefresh}>
        <div className="px-4 lg:px-6 max-w-2xl">
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
                    className="divide-y divide-neutral-100"
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
                    className="divide-y divide-neutral-100"
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
                    className="divide-y divide-neutral-100"
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
                    className="divide-y divide-neutral-100"
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
