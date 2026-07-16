import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MessageCircle, Users, ChevronRight, Lock, Globe, MapPin, Leaf, MessagesSquare, Shield, Tent } from 'lucide-react'
import { Page } from '@/components/page'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/cn'
import { useMyCollectives, useCollectives } from '@/hooks/use-collective'
import { useUnreadCounts } from '@/hooks/use-chat'
import { useMyStaffChannels, useChannelUnreadCounts, type StaffChannel } from '@/hooks/use-staff-channels'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useAuth } from '@/hooks/use-auth'
import { COLLECTIVE_ROLE_RANK as ROLE_RANK } from '@/lib/constants'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

const CHAT_REDIRECTED_KEY = 'coexist-chat-redirected'

const CHANNEL_TYPE_CONFIG: Record<string, {
  icon: typeof Globe
  iconBg: string
  badge: string
  label: string
}> = {
  staff_national: {
    icon: Globe,
    iconBg: 'bg-plum-50 text-plum-600',
    badge: 'bg-plum-50 text-plum-700',
    label: 'National',
  },
  staff_state: {
    icon: MapPin,
    iconBg: 'bg-info-50 text-info-600',
    badge: 'bg-info-50 text-info-700',
    label: 'State',
  },
  staff_collective: {
    icon: Users,
    iconBg: 'bg-primary-50 text-primary-600',
    badge: 'bg-primary-50 text-primary-700',
    label: 'Staff',
  },
  campout: {
    icon: Tent,
    iconBg: 'bg-primary-50 text-primary-600',
    badge: 'bg-primary-50 text-primary-700',
    label: 'Campout',
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
/*  Staff channel row                                                  */
/* ------------------------------------------------------------------ */

function StaffChannelRow({ channel, unread }: { channel: StaffChannel; unread: number; index: number }) {
  const shouldReduceMotion = useReducedMotion()
  const hasUnread = unread > 0
  const config = CHANNEL_TYPE_CONFIG[channel.type] ?? CHANNEL_TYPE_CONFIG.staff_collective
  const Icon = config.icon
  // Campout chats are open to ticket holders, not staff-gated, so they skip
  // the lock badge and the "Staff only" caption the staff channels carry.
  const isCampout = channel.type === 'campout'

  return (
    <motion.div data-eos-id="src/pages/chat/index.tsx#0" data-eos-v="2"
      variants={shouldReduceMotion ? undefined : fadeUp}
    >
      <Link data-eos-id="src/pages/chat/index.tsx#1"
        to={`/chat/channel/${channel.id}`}
        className={cn(
          'group relative flex items-center gap-4 rounded-md p-4',
          'bg-white border border-neutral-100 shadow-sm',
          'transition-transform duration-200 active:scale-[0.97]',
          hasUnread && 'ring-2 ring-primary-400/60',
        )}
      >
        {/* Channel type icon */}
        <div data-eos-id="src/pages/chat/index.tsx#2" className="relative flex-shrink-0">
          <div data-eos-id="src/pages/chat/index.tsx#3" className={cn(
            'h-12 w-12 rounded-sm flex items-center justify-center',
            config.iconBg,
          )}>
            <Icon data-eos-id="src/pages/chat/index.tsx#4" size={22} strokeWidth={2} />
          </div>
          {/* Lock badge (staff channels only) */}
          {!isCampout && (
            <div data-eos-id="src/pages/chat/index.tsx#5" className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white flex items-center justify-center shadow-sm ring-1 ring-neutral-100">
              <Lock data-eos-id="src/pages/chat/index.tsx#6" size={10} strokeWidth={2} className="text-neutral-500" />
            </div>
          )}
          {hasUnread && (
            <div data-eos-id="src/pages/chat/index.tsx#7" className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary-500 ring-2 ring-white" />
          )}
        </div>

        {/* Name + label */}
        <div data-eos-id="src/pages/chat/index.tsx#8" className="flex-1 min-w-0">
          <p data-eos-id="src/pages/chat/index.tsx#9" data-eos-var="channel.name" data-eos-var-label="Name" data-eos-var-scope="prop" className={cn(
            'text-[15px] line-clamp-2 leading-snug break-words',
            hasUnread ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800',
          )}>
            {cleanChannelName(channel.name)}
          </p>
          <div data-eos-id="src/pages/chat/index.tsx#10" className="flex items-center gap-2 mt-1">
            <span data-eos-id="src/pages/chat/index.tsx#11" data-eos-var="config.label" data-eos-var-label="Label" data-eos-var-scope="prop" className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', config.badge)}>
              {config.label}
            </span>
            <span data-eos-id="src/pages/chat/index.tsx#12" className="text-[11px] font-medium text-neutral-400">
              {isCampout ? 'Group chat' : 'Staff only'}
            </span>
          </div>
        </div>

        {/* Unread / chevron */}
        <div data-eos-id="src/pages/chat/index.tsx#13" className="flex items-center gap-2 shrink-0">
          {hasUnread ? (
            <span data-eos-id="src/pages/chat/index.tsx#14" className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary-500 px-2 text-xs font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : (
            <ChevronRight data-eos-id="src/pages/chat/index.tsx#15" size={18} strokeWidth={2} className="text-neutral-300 transition-transform duration-150 group-hover:translate-x-0.5" />
          )}
        </div>
      </Link>
    </motion.div>
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
  const shouldReduceMotion = useReducedMotion()
  const hasUnread = unread > 0

  return (
    <motion.div data-eos-id="src/pages/chat/index.tsx#16"
      variants={shouldReduceMotion ? undefined : fadeUp}
    >
      <Link data-eos-id="src/pages/chat/index.tsx#17"
        to={`/chat/${collectiveId}`}
        className={cn(
          'group relative flex items-center gap-4 rounded-md p-4',
          'bg-white border border-neutral-100 shadow-sm',
          'transition-transform duration-200 active:scale-[0.97]',
          hasUnread && 'ring-2 ring-primary-400/60',
        )}
      >
        {/* Collective avatar */}
        <div data-eos-id="src/pages/chat/index.tsx#18" className="relative flex-shrink-0">
          <div data-eos-id="src/pages/chat/index.tsx#19"
            className={cn(
              'h-12 w-12 overflow-hidden rounded-sm',
              hasUnread
                ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-white'
                : 'ring-1 ring-neutral-100',
            )}
          >
            {collective.cover_image_url ? (
              <img data-eos-src="dynamic" data-eos-src-label="Cover image url" data-eos-id="src/pages/chat/index.tsx#20"
                src={collective.cover_image_url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div data-eos-id="src/pages/chat/index.tsx#21" className="flex h-full w-full items-center justify-center bg-primary-50">
                <Leaf data-eos-id="src/pages/chat/index.tsx#22" size={20} strokeWidth={2} className="text-primary-500" />
              </div>
            )}
          </div>
          {hasUnread && (
            <div data-eos-id="src/pages/chat/index.tsx#23" className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary-500 ring-2 ring-white" />
          )}
        </div>

        {/* Name + meta */}
        <div data-eos-id="src/pages/chat/index.tsx#24" className="flex-1 min-w-0">
          <p data-eos-id="src/pages/chat/index.tsx#25" data-eos-var="collective.name" data-eos-var-label="Name" data-eos-var-scope="prop"
            className={cn(
              'text-[15px] line-clamp-2 leading-snug break-words',
              hasUnread ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800',
            )}
          >
            {collective.name}
          </p>
          <div data-eos-id="src/pages/chat/index.tsx#26" className="flex items-center gap-2 mt-1">
            <span data-eos-id="src/pages/chat/index.tsx#27" data-eos-var="collective.member_count" data-eos-var-label="Member count" data-eos-var-scope="prop" className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
              <Users data-eos-id="src/pages/chat/index.tsx#28" size={11} strokeWidth={2} className="shrink-0" />
              {collective.member_count}
            </span>
            {(collective.region || collective.state) && (
              <>
                <span data-eos-id="src/pages/chat/index.tsx#29" className="w-1 h-1 rounded-full bg-neutral-300" />
                <span data-eos-id="src/pages/chat/index.tsx#30" data-eos-var="collective.region" data-eos-var-label="Region" data-eos-var-scope="prop" className="text-[11px] font-medium text-neutral-500 truncate flex items-center gap-1">
                  <MapPin data-eos-id="src/pages/chat/index.tsx#31" size={11} strokeWidth={2} className="shrink-0" />
                  {collective.region ?? collective.state}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Unread / chevron */}
        <div data-eos-id="src/pages/chat/index.tsx#32" className="flex items-center gap-2 shrink-0">
          {hasUnread ? (
            <span data-eos-id="src/pages/chat/index.tsx#33" className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary-500 px-2 text-xs font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : (
            <ChevronRight data-eos-id="src/pages/chat/index.tsx#34" size={18} strokeWidth={2} className="text-neutral-300 transition-transform duration-150 group-hover:translate-x-0.5" />
          )}
        </div>
      </Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section divider                                                    */
/* ------------------------------------------------------------------ */

function SectionDivider({ icon: Icon, label }: { icon: typeof Lock; label: string }) {
  return (
    <div data-eos-id="src/pages/chat/index.tsx#35" className="flex items-center gap-2 px-1 mb-3">
      <Icon data-eos-id="src/pages/chat/index.tsx#36" size={12} strokeWidth={2} className="text-neutral-400" />
      <p data-eos-id="src/pages/chat/index.tsx#37" className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
        {label}
      </p>
      <div data-eos-id="src/pages/chat/index.tsx#38" className="h-px flex-1 bg-neutral-100" />
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
      <Page data-eos-id="src/pages/chat/index.tsx#39" noBackground className="!px-0 bg-white">
        <div data-eos-id="src/pages/chat/index.tsx#40" className="px-4 lg:px-6 pt-14 pb-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div data-eos-id="src/pages/chat/index.tsx#41" key={i} className="rounded-md bg-white border border-neutral-100 p-4 animate-pulse">
              <div data-eos-id="src/pages/chat/index.tsx#42" className="flex items-center gap-4">
                <div data-eos-id="src/pages/chat/index.tsx#43" className="w-12 h-12 rounded-sm bg-neutral-100" />
                <div data-eos-id="src/pages/chat/index.tsx#44" className="flex-1 space-y-2">
                  <div data-eos-id="src/pages/chat/index.tsx#45" className="h-4 bg-neutral-100 rounded w-2/3" />
                  <div data-eos-id="src/pages/chat/index.tsx#46" className="h-3 bg-neutral-100 rounded w-1/3" />
                </div>
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
      <Page data-eos-id="src/pages/chat/index.tsx#47" noBackground className="!px-0 bg-white">
        <div data-eos-id="src/pages/chat/index.tsx#48" className="px-4 lg:px-6 pt-14">
          <EmptyState data-eos-id="src/pages/chat/index.tsx#49"
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
      <Page data-eos-id="src/pages/chat/index.tsx#50" noBackground className="!px-0 bg-white">
        <div data-eos-id="src/pages/chat/index.tsx#51" className="px-4 lg:px-6 pt-14">
          <h1 data-eos-id="src/pages/chat/index.tsx#52" className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-6">
            Chat
          </h1>
          <EmptyState data-eos-id="src/pages/chat/index.tsx#53"
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
    <Page data-eos-id="src/pages/chat/index.tsx#54" noBackground className="!px-0 bg-white">
        <div data-eos-id="src/pages/chat/index.tsx#55" className="px-4 lg:px-6">
            <motion.div data-eos-id="src/pages/chat/index.tsx#56"
              className="pt-14 pb-6 space-y-6"
              variants={shouldReduceMotion ? undefined : stagger}
              initial="hidden"
              animate="visible"
            >

              {/* Campouts section */}
              {hasCampoutChannels && (
                <motion.div data-eos-id="src/pages/chat/index.tsx#57" variants={fadeUp}>
                  <SectionDivider data-eos-id="src/pages/chat/index.tsx#58" icon={Tent} label="Campouts" />
                  <motion.div data-eos-id="src/pages/chat/index.tsx#59"
                    className="space-y-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {campoutChannels.map((channel) => (
                      <StaffChannelRow data-eos-id="src/pages/chat/index.tsx#60"
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
                <motion.div data-eos-id="src/pages/chat/index.tsx#61" variants={fadeUp}>
                  <SectionDivider data-eos-id="src/pages/chat/index.tsx#62" icon={Lock} label="Staff Channels" />
                  <motion.div data-eos-id="src/pages/chat/index.tsx#63"
                    className="space-y-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {otherChannels.map((channel) => (
                      <StaffChannelRow data-eos-id="src/pages/chat/index.tsx#64"
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
                <motion.div data-eos-id="src/pages/chat/index.tsx#65" variants={fadeUp}>
                  <SectionDivider data-eos-id="src/pages/chat/index.tsx#66" icon={MessageCircle} label="Collectives" />
                  <motion.div data-eos-id="src/pages/chat/index.tsx#67"
                    className="space-y-3"
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
                        <CollectiveChatRow data-eos-id="src/pages/chat/index.tsx#68"
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
                <motion.div data-eos-id="src/pages/chat/index.tsx#69" variants={fadeUp}>
                  <SectionDivider data-eos-id="src/pages/chat/index.tsx#70" icon={Shield} label="All Collectives" />
                  <motion.div data-eos-id="src/pages/chat/index.tsx#71"
                    className="space-y-3"
                    variants={shouldReduceMotion ? undefined : stagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {otherCollectives.map((collective) => (
                      <CollectiveChatRow data-eos-id="src/pages/chat/index.tsx#72"
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
