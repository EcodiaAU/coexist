import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Calendar,
    Clock,
    MapPin,
    Users,
    CalendarPlus,
    ChevronRight,
    TreePine,
    Trash2,
    Eye,
    Leaf,
    Sprout,
    Waves,
    CheckCircle2,
    AlertCircle,
    XCircle,
    Mail,
    Hash,
    Copy,
    Ban,
    Send,
    Compass,
    Mountain,
    Accessibility,
    Shirt,
    Backpack,
    Sparkles,
    Zap,
    Pencil,
    ClipboardList,
    Bell,
    Ticket,
    ExternalLink,
    Car,
    WifiOff,
    RefreshCw,
    UserCheck,
    UserPlus,
    Share2,
    Tent,
} from 'lucide-react'
import { EventShareSheet } from '@/components/event-share-sheet'
import { EventPhotosSection } from '@/components/event-photos-section'
import { EventHero, EventHeroOverlay } from './event-hero'
import { EventActions } from './event-actions'
import { EventAttendees } from './event-attendees'
import { AdminAttendeesExport } from './admin-attendees-export'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/hooks/use-auth'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import {
    useEventDetail,
    useEventAttendees,
    useRegisterForEvent,
    useCancelRegistration,
    useCancelEvent,
    useInviteCollective,
    formatEventDate,
    formatEventTime,
    getEventDuration,
    isPastEvent,
    downloadIcsFile,
    getGoogleCalendarUrl,
} from '@/hooks/use-events'
import { useOffline } from '@/hooks/use-offline'
import { usePendingSync } from '@/hooks/use-pending-sync'
import { triggerManualSync } from '@/lib/offline-sync'
import { isEventToday, wallClockNow } from '@/lib/date-format'
import {
    Page,
    Header,
    Button,
    Input,
    EmptyState,
    ConfirmationSheet,
    BottomSheet, StatCard,
    CheckInSheet
} from '@/components'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { attendeeName } from '@/lib/attendee-name'
import { parseLocationPoint } from '@/lib/geo'
import { isEventSoldOut } from '@/lib/event-sold-out'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { IssueTicketSheet } from '@/components/issue-ticket-sheet'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useGeocodeAddress } from '@/hooks/use-geocode-address'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import { useEventTicketTypes, useMyEventTicket, useCreateTicketCheckout, useCancelPendingTicket, useTicketSalesSummary, useEventTickets } from '@/hooks/use-event-tickets'
import { useEventCarpools } from '@/hooks/use-event-carpools'
import { useEventCampoutChannel } from '@/hooks/use-staff-channels'
import { MapView } from '@/components'
import { activityAccent, defaultAccent } from '@/lib/activity-types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Difficulty config                                                  */
/* ------------------------------------------------------------------ */

const difficultyConfig = {
  easy: { label: 'Easy', color: 'text-success-600 bg-success-100', icon: Sparkles },
  moderate: { label: 'Moderate', color: 'text-warning-600 bg-warning-100', icon: Zap },
  challenging: { label: 'Challenging', color: 'text-error-600 bg-error-100', icon: Mountain },
}


/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function EventDetailSkeleton() {
  return (
    <Page swipeBack header={<Header title="" back />}>
      <div>
        {/* Hero shimmer */}
        <div className="relative -mx-4 lg:-mx-6">
          <div className="w-full overflow-hidden animate-pulse" style={{ aspectRatio: '3/4', maxHeight: '56vh' }}>
            <div className="absolute inset-0 bg-neutral-100" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>
        </div>
        <div className="pt-5 space-y-4">
          {/* Info card shimmer */}
          <div className="rounded-md bg-white border border-neutral-100 p-5 space-y-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-neutral-100 rounded w-2/3" />
                <div className="h-3 bg-neutral-50 rounded w-1/3" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-neutral-100 rounded w-3/4" />
                <div className="h-3 bg-neutral-50 rounded w-1/2" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-neutral-100 rounded w-1/2" />
                <div className="h-3 bg-neutral-50 rounded w-3/5" />
              </div>
            </div>
          </div>
          {/* Capacity shimmer */}
          <div className="rounded-md bg-white border border-neutral-100 p-4 space-y-3 animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-1/3" />
            <div className="h-3 bg-neutral-50 rounded-full w-full" />
            <div className="flex -space-x-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-neutral-100 ring-2 ring-white" />
              ))}
            </div>
          </div>
          {/* Description shimmer */}
          <div className="rounded-md bg-white border border-neutral-100 p-4 space-y-2 animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-1/4" />
            <div className="h-3 bg-neutral-50 rounded w-full" />
            <div className="h-3 bg-neutral-50 rounded w-5/6" />
            <div className="h-3 bg-neutral-50 rounded w-2/3" />
          </div>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/*  Info chip                                                          */
/* ------------------------------------------------------------------ */

function InfoChip({
  icon,
  label,
  value,
  accent,
  action,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: typeof defaultAccent
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-start gap-3 py-3.5 group">
      <span
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-sm shrink-0',
          'shadow-sm transition-colors duration-200',
          accent.bg, accent.text, accent.border, 'border',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">{label}</p>
        {/* text-[14px] (was 15px) and the action moves below the value on
            narrow screens. Long addresses on Android (~360dp) wrap to 3-4
            lines when the Directions button stays on the same row. Tate
            verbatim 2026-05-28. Action stays inline on sm+ where the row
            has enough horizontal room. */}
        <div className="flex flex-wrap items-end justify-between gap-2 mt-0.5">
          <p className="text-[14px] font-bold text-neutral-900 break-words leading-snug min-w-0 flex-1">{value}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                'min-h-11 flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm text-[13px] font-bold shrink-0',
                'cursor-pointer select-none active:scale-[0.97] transition-transform duration-150',
                'bg-neutral-100 text-neutral-600 border-neutral-200 border',
                'hover:shadow-sm',
              )}
              aria-label={action.label}
            >
              <Compass size={13} />
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Ticket Sales Section (leaders/admins only)                         */
/* ------------------------------------------------------------------ */

const LIVE_TICKET_STATUSES = ['pending', 'confirmed', 'checked_in']

function TicketSalesSection({
  eventId,
  accent,
  rm,
}: {
  eventId: string
  accent: { bg: string; text: string; border: string; gradient: string; glow: string }
  rm: boolean | null
}) {
  const { data: summary } = useTicketSalesSummary(eventId)
  const { data: tickets } = useEventTickets(eventId)
  const { isManager, isAdmin } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const canManageTickets = isManager || isAdmin

  const [issueOpen, setIssueOpen] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Count live tickets per user so duplicates (same person, >1 active ticket)
  // can be flagged for cleanup. Tate hit this: two live tickets to one event.
  const liveCountByUser = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tickets ?? []) {
      if (LIVE_TICKET_STATUSES.includes(t.status as string)) {
        m.set(t.user_id as string, (m.get(t.user_id as string) ?? 0) + 1)
      }
    }
    return m
  }, [tickets])

  function refreshTickets() {
    queryClient.invalidateQueries({ queryKey: ['admin-event-tickets', eventId] })
    queryClient.invalidateQueries({ queryKey: ['ticket-sales-summary', eventId] })
    queryClient.invalidateQueries({ queryKey: ['event-ticket-types', eventId] })
  }

  async function handleRevoke(ticketId: string, isPaid: boolean, label: string) {
    const verb = isPaid ? 'Refund and remove' : 'Remove'
    if (!window.confirm(`${verb} ${label}'s ticket?${isPaid ? ' This refunds their payment in Stripe.' : ''}`)) return
    setRevokingId(ticketId)
    try {
      const { data, error } = await supabase.functions.invoke('revoke-event-ticket', {
        body: { ticket_id: ticketId },
      })
      const result = (data ?? {}) as { ok?: boolean; action?: string; error?: string }
      if (error || result.error) throw new Error(result.error || error?.message || 'Could not remove the ticket')
      toast.success(result.action === 'refunded' ? 'Ticket refunded and removed' : 'Ticket removed')
      refreshTickets()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the ticket')
    } finally {
      setRevokingId(null)
    }
  }

  if (!summary) return null

  const revenueAud = (summary.totalRevenue / 100).toFixed(2)

  return (
    <motion.div
      variants={rm ? undefined : { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
      className="rounded-md p-4.5 space-y-3 bg-white border border-neutral-100 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-sm flex items-center justify-center', accent.bg)}>
          <Ticket size={14} className={accent.text} />
        </div>
        <h3 className="text-sm font-bold text-neutral-900">Ticket Sales</h3>
        {canManageTickets && (
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            className={cn('ml-auto flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-sm', accent.bg, accent.text)}
          >
            <UserPlus size={13} />
            Issue ticket
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-sm bg-success-50 p-3 text-center">
          <p className="font-heading text-lg font-bold text-success-700">${revenueAud}</p>
          <p className="text-[10px] text-success-500 font-semibold uppercase">Revenue</p>
        </div>
        <div className="rounded-sm bg-primary-50 p-3 text-center">
          <p className="font-heading text-lg font-bold text-primary-700">{summary.totalSold}</p>
          <p className="text-[10px] text-primary-400 font-semibold uppercase">Sold</p>
        </div>
        <div className="rounded-sm bg-moss-50 p-3 text-center">
          <p className="font-heading text-lg font-bold text-moss-700">{summary.totalCheckedIn}</p>
          <p className="text-[10px] text-moss-500 font-semibold uppercase">Checked In</p>
        </div>
      </div>

      {/* Ticket holders */}
      {tickets && tickets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Ticket Holders</p>
          <div className="max-h-[260px] overflow-y-auto space-y-1">
            {tickets.map((t) => {
              const profile = t.profiles as unknown as { display_name: string; first_name: string | null; last_name: string | null; email: string } | null
              const label = attendeeName(profile, profile?.email ?? 'Unknown')
              const isLive = LIVE_TICKET_STATUSES.includes(t.status as string)
              const isDuplicate = isLive && (liveCountByUser.get(t.user_id as string) ?? 0) > 1
              const isPaid = !!(t as { stripe_payment_intent_id?: string | null }).stripe_payment_intent_id && (t.price_cents ?? 0) > 0
              return (
                <div key={t.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-sm hover:bg-neutral-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-800 truncate flex items-center gap-1.5">
                      {label}
                      {isDuplicate && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-warning-100 text-warning-700 uppercase">Dupe</span>
                      )}
                    </p>
                    <p className="text-[10px] text-neutral-400">
                      {(t.event_ticket_types as unknown as { name: string } | null)?.name ?? ''} · ${((t.price_cents ?? 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase',
                    t.status === 'confirmed' ? 'bg-success-100 text-success-700'
                      : t.status === 'checked_in' ? 'bg-moss-100 text-moss-700'
                      : t.status === 'pending' ? 'bg-warning-100 text-warning-700'
                      : 'bg-error-100 text-error-700',
                  )}>
                    {t.status === 'checked_in' ? 'In' : t.status}
                  </span>
                  {canManageTickets && isLive && (
                    <button
                      type="button"
                      disabled={revokingId === t.id}
                      onClick={() => handleRevoke(t.id, isPaid, label)}
                      title={isPaid ? 'Refund and remove ticket' : 'Remove ticket'}
                      className="text-neutral-300 hover:text-error-500 disabled:opacity-40 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {canManageTickets && (
        <IssueTicketSheet
          eventId={eventId}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
          onSuccess={refreshTickets}
        />
      )}
    </motion.div>
  )
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isStaff: isGlobalStaff } = useAuth()
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()

  const { data: event, isLoading, isError } = useEventDetail(id)
  const showLoading = useDelayedLoading(isLoading)
  const { metricLabels, metricByKey } = useImpactMetricDefs()
  const collectiveRole = useCollectiveRole(event?.collective_id)
  const registerMutation = useRegisterForEvent()
  const cancelMutation = useCancelRegistration()
  const cancelEventMutation = useCancelEvent()
  const inviteCollectiveMutation = useInviteCollective()

  // Mid-event offline + sync visibility for PARTICIPANTS. Mirrors the leader
  // banner on event-day.tsx so participants get the same "X queued, syncing..."
  // feedback at the venue. Origin: 1.8.6 feature 4 (Tate verbatim event-day
  // SMS, 10 May 2026 - "everyone can use the event day stuff... and have an
  // off-line sync queue").
  const { isOffline } = useOffline()
  const { count: pendingCount } = usePendingSync()
  const [syncingNow, setSyncingNow] = useState(false)
  const handleManualSync = useCallback(async () => {
    setSyncingNow(true)
    try {
      await triggerManualSync()
    } finally {
      setSyncingNow(false)
    }
  }, [])

  // Live "X of Y here so far" - visible to everyone (participant + leader)
  // when the event is today, surfacing the leader-only event-day stats to
  // participants so they see the room fill up. Same query key as the leader
  // page so both share the cached + offline-replay result.
  // Event's effective timezone for tz-aware day-of checks and time
  // rendering. Override > collective default > Australia/Sydney fallback.
  const eventTz =
    (event as { timezone?: string | null } | undefined)?.timezone ??
    (event as { collectives?: { timezone?: string | null } | null } | undefined)?.collectives?.timezone ??
    'Australia/Sydney'
  const isEventTodayForLive = isEventToday(event?.date_start, eventTz)
  const { data: liveAttendees } = useEventAttendees(isEventTodayForLive ? id : undefined)
  const liveCheckedIn = useMemo(
    () => liveAttendees?.filter((a) => a.status === 'attended').length ?? 0,
    [liveAttendees],
  )
  const liveRegistered = useMemo(
    () => liveAttendees?.filter((a) => a.status === 'registered' || a.status === 'attended').length ?? 0,
    [liveAttendees],
  )

  // Ticketed events
  const isTicketed = event?.is_ticketed ?? false
  // Sold out on an external platform (e.g. Eventbrite): native in-app sales are
  // closed, but the per-event claim link still works (it bypasses capacity).
  const soldOut = isEventSoldOut(event)
  const { data: ticketTypes } = useEventTicketTypes(isTicketed ? id : undefined)
  const { data: myTicket } = useMyEventTicket(isTicketed ? id : undefined)
  const ticketCheckout = useCreateTicketCheckout()
  const cancelPendingTicket = useCancelPendingTicket()

  // Coordination - carpool breakout chats for this event (Worker 3)
  const { data: eventCarpools } = useEventCarpools(id)
  // Campout group chat - RLS exposes it only to confirmed ticket holders + staff
  const { data: campoutChannel } = useEventCampoutChannel(id)
  const [selectedTicketType, setSelectedTicketType] = useState<string | null>(null)

  const [showCancelSheet, setShowCancelSheet] = useState(false)
  const [showCalendarSheet, setShowCalendarSheet] = useState(false)
  const [showQrSheet, setShowQrSheet] = useState(false)
  const [showCancelEventSheet, setShowCancelEventSheet] = useState(false)
  const [showCheckInSheet, setShowCheckInSheet] = useState(false)
  const [showInviteSheet, setShowInviteSheet] = useState(false)
  const [showShareSheet, setShowShareSheet] = useState(false)
  // Transient flag flipped on after registration succeeds. Drives a one-shot
  // burst halo on the CTA + a quick "You're going!" pulse-in. Cleared 700ms
  // later so the registered-state UI settles into its steady look.
  const [registeredJustNow, setRegisteredJustNow] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  // Floating-local: store now as wall-clock-as-UTC ms so we can compare
  // against event.date_start (also wall-clock-as-UTC).
  const [now, setNow] = useState(() => wallClockNow().getTime())
  const [checkInForcedOpen, setCheckInForcedOpen] = useState(false)

  // Re-evaluate active state every 60s so "Check In Now" appears on time
  useEffect(() => {
    const timer = setInterval(() => setNow(wallClockNow().getTime()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // When the page is opened with ?tab=photos (from the Open album chat
  // widget, the post-event push, etc), scroll the photo section into view
  // so the user lands on uploads, not the top of the event page. Clears
  // the param after scroll so back-navigation doesn't keep re-scrolling.
  useEffect(() => {
    if (searchParams.get('tab') !== 'photos') return
    // Wait a tick for the section to render (post-event flag gating).
    const tries: ReturnType<typeof setTimeout>[] = []
    const tryScroll = (attempt: number) => {
      const el = document.getElementById('event-photos-section')
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: attempt === 0 ? 'auto' : 'smooth' })
        // Clear the param so a later back-nav doesn't re-fire this effect.
        const next = new URLSearchParams(searchParams)
        next.delete('tab')
        setSearchParams(next, { replace: true })
        return
      }
      if (attempt < 6) tries.push(setTimeout(() => tryScroll(attempt + 1), 100 * (attempt + 1)))
    }
    tries.push(setTimeout(() => tryScroll(0), 60))
    return () => { for (const t of tries) clearTimeout(t) }
  }, [searchParams, setSearchParams])

  const accent = event ? (activityAccent[event.activity_type] ?? defaultAccent) : defaultAccent

  // Map position: prefer saved location_point; fall back to geocoding the
  // address text so legacy events (created before the location_point RPC fix)
  // still render a pin instead of hiding the map entirely.
  const savedPos = useMemo(() => parseLocationPoint(event?.location_point), [event?.location_point])
  const { data: geocodedPos } = useGeocodeAddress(event?.address, !savedPos)
  const mapPos = savedPos ?? geocodedPos ?? null
  const past = event ? isPastEvent(event) : false
  const isAtCapacity = event?.capacity ? event.registration_count >= event.capacity : false

  // Event is "active" if it started (or starts within the check-in window) and hasn't ended
  const rawCheckinWindow = (event as unknown as Record<string, unknown>)?.checkin_window_minutes as number | null | undefined
  const checkinWindowMinutes = Math.min(rawCheckinWindow ?? 30, 30)
  const isEventActive = useMemo(() => {
    if (checkInForcedOpen) return true
    if (!event) return false
    const start = new Date(event.date_start).getTime()
    const end = event.date_end ? new Date(event.date_end).getTime() : start + 3 * 60 * 60 * 1000
    const earlyWindow = start - checkinWindowMinutes * 60 * 1000
    return now >= earlyWindow && now <= end
  }, [event, now, checkinWindowMinutes, checkInForcedOpen])

  // Calculate when check-in opens (for display to volunteers)
  const checkInOpensAt = useMemo(() => {
    if (!event) return null
    const start = new Date(event.date_start).getTime()
    return new Date(start - checkinWindowMinutes * 60 * 1000)
  }, [event, checkinWindowMinutes])
  const userStatus = event?.user_registration?.status ?? null
  // Only show leader tools if user has a role in THIS event's collective (or is global staff)
  const belongsToCollective = collectiveRole.role !== null
  const isLeaderOrAbove = (belongsToCollective && collectiveRole.isAssistLeader) || isGlobalStaff
  const isStaff = isLeaderOrAbove

  const capacityText = useMemo(() => {
    if (!event) return ''
    if (!event.capacity) return `${event.registration_count} going`
    return `${event.registration_count}/${event.capacity} spots filled`
  }, [event])

  const capacityPercent = useMemo(() => {
    if (!event?.capacity) return 0
    return Math.min(100, (event.registration_count / event.capacity) * 100)
  }, [event])

  const handleRegister = useCallback(() => {
    if (!event) return
    registerMutation.mutate(
      { eventId: event.id, asWaitlist: isAtCapacity },
      {
        onSuccess: () => {
          toast.success(isAtCapacity ? 'Added to waitlist' : "You're registered!")
          // Flag the transient burst animation. Don't fire on waitlist (that
          // path doesn't morph to the "You're going" CTA so the burst would
          // play over the wrong UI).
          if (!isAtCapacity && !shouldReduceMotion) {
            setRegisteredJustNow(true)
            window.setTimeout(() => setRegisteredJustNow(false), 700)
          }
        },
        onError: () => {
          toast.error('Registration failed. Please try again.')
        },
      },
    )
  }, [event, isAtCapacity, registerMutation, toast, shouldReduceMotion])

  const handleCancelConfirm = useCallback(() => {
    if (!event) return
    cancelMutation.mutate(event.id, {
      onSuccess: () => {
        toast.success('Registration cancelled')
      },
      onError: () => {
        toast.error('Failed to cancel registration')
      },
    })
    setShowCancelSheet(false)
  }, [event, cancelMutation, toast])

  // True iff we can build a meaningful directions URL for this event.
  // Used to render the Directions button as visibly disabled (rather than
  // letting it fire and open a broken / blank map) when neither saved
  // coords nor an address are available.
  const hasDirectionsDestination = !!(mapPos || event?.address)

  const handleGetDirections = useCallback(() => {
    if (!event) return

    // Prefer exact lat/lng (saved location_point or geocoded fallback) over
    // address-text geocoding, which can land on a nearby road or wrong side
    // of a building. Only fall back to encoded address when no coords exist.
    // Bail silently if neither - never open a malformed URL.
    const coords = mapPos
    if (!coords && !event.address) return

    // Detect Apple platforms (iOS, iPadOS, macOS) - use Apple Maps where
    // available so deep-links open natively in the Maps app.
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isApple = /iPad|iPhone|iPod|Mac/.test(ua) && !(/Android/.test(ua))

    let url: string
    if (coords) {
      // Coords destination: most precise form on both Maps providers.
      // Drop the address-string overlay (&q=) when using coords on Apple
      // Maps - that param adds a search overlay that can land on the wrong
      // pin instead of using the exact lat,lng we just supplied.
      const dest = `${coords.lat},${coords.lng}`
      if (isApple) {
        url = `https://maps.apple.com/?daddr=${dest}&dirflg=d`
      } else {
        // dir_action=navigate starts navigation immediately on supported
        // clients instead of dropping the user on the route preview.
        url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`
      }
    } else {
      // No coords - fall back to address string. Geocoded by the maps
      // provider on the other end.
      const encoded = encodeURIComponent(event.address as string)
      if (isApple) {
        url = `https://maps.apple.com/?daddr=${encoded}&dirflg=d`
      } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving&dir_action=navigate`
      }
    }

    window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank')
  }, [event, mapPos])

  const handleCancelEvent = useCallback(() => {
    if (!event) return
    cancelEventMutation.mutate(
      { eventId: event.id, reason: cancelReason },
      {
        onSuccess: () => {
          toast.success('Event cancelled')
          setShowCancelEventSheet(false)
        },
        onError: () => toast.error('Failed to cancel event'),
      },
    )
  }, [event, cancelReason, cancelEventMutation, toast])

  const handleDuplicate = useCallback(() => {
    if (!event) return
    // Open the create wizard prefilled from this event. No DB row is
    // inserted until the user confirms - they pick a new date and tweak
    // anything they want before publishing.
    navigate(`/events/create?from=${event.id}`)
  }, [event, navigate])

  const alreadyInvited = event?.has_been_invited ?? false

  const handleOpenInviteSheet = useCallback(() => {
    if (!event) return
    setInviteMessage(alreadyInvited
      ? `Don't miss out! Register now for ${event.title}.`
      : `You're all invited! Tap to view and register.`,
    )
    setShowInviteSheet(true)
  }, [event, alreadyInvited])

  const handleSendInvite = useCallback(() => {
    if (!event?.collective_id) return
    inviteCollectiveMutation.mutate(
      { eventId: event.id, collectiveId: event.collective_id, customMessage: inviteMessage || undefined },
      {
        onSuccess: (data) => {
          toast.success(data?.reminded ? 'Reminder posted to collective chat!' : 'All members invited & notified!')
          setShowInviteSheet(false)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send'),
      },
    )
  }, [event, inviteCollectiveMutation, toast, inviteMessage])

  // Share = open the EventShareSheet (3 Instagram-ready PNGs with app store
  // badges). Replaces the previous bare-URL navigator.share path - per Tate
  // 13:30 AEST 10 May 2026 the URL share is gone, share button now produces
  // a graphic users can post to feed/story.
  const handleShare = useCallback(() => {
    if (!event) return
    setShowShareSheet(true)
  }, [event])

  // CRITICAL: Don't show "not found" while still loading
  if (showLoading || isLoading) return <EventDetailSkeleton />
  // Show "Something went wrong" ONLY when we have no event data at all.
  // If the cached/stale event is present, render it - a background refetch
  // failure shouldn't replace a working page with an error EmptyState.
  // This was the root cause of Winnie's "first visit works, second visit
  // errors" pattern: useEventDetail returned cached data on re-mount and
  // fired a background refetch; if the refetch failed for any reason
  // (iOS WebView network race / JWT expiry / RLS edge), isError flipped
  // true and erased the working page even though stale data was fine.
  if (isError && !event) {
    return (
      <Page swipeBack header={<Header title="Event" back />}>
        <EmptyState
          illustration="error"
          title="Something went wrong"
          description="We couldn't load this event. Check your connection and try again."
          action={{ label: 'Retry', onClick: () => window.location.reload() }}
        />
      </Page>
    )
  }
  if (!event) {
    return (
      <Page swipeBack header={<Header title="Event" back />}>
        <EmptyState
          illustration="error"
          title="Event not found"
          description="This event may have been removed or the link is incorrect."
          action={{ label: 'Browse Events', to: '/events' }}
        />
      </Page>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Registration CTA                                                 */
  /* ---------------------------------------------------------------- */

  function renderCta() {
    if (!event) return null
    if (event.status === 'cancelled') {
      return (
        <div className="flex items-center gap-2.5 px-5 py-3.5 rounded-md bg-error-50 text-error-700 text-sm font-semibold border border-error-200/40">
          <XCircle size={18} />
          This event has been cancelled
        </div>
      )
    }

    if (past) {
      if (userStatus === 'attended') {
        return (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate(`/events/${event.id}/survey`)}
          >
            Share Your Feedback
          </Button>
        )
      }
      return null
    }

    if (userStatus === 'attended') {
      return (
        <div className="flex items-center gap-2.5 px-5 py-3.5 rounded-md bg-success-50 text-success-700 text-sm font-bold border border-success-200/40">
          <CheckCircle2 size={18} />
          You're checked in!
        </div>
      )
    }

    if (userStatus === 'registered') {
      // One primary button.
      //   * Check-in open: tappable, reads "Check In Now"
      //   * Check-in not yet open: disabled, reads "Check-in opens at 9:00 AM"
      //   * Time unknown: disabled, reads "You're registered"
      // Leaders force-open via the warning row at the top of the Leader
      // Actions block, so this button stays disabled for everyone here.
      // checkInOpensAt is derived from event.date_start (wall-clock-as-UTC),
      // so pin UTC to read the wall-clock verbatim. Formatting in eventTz
      // shifted it by the device/collective offset (floating-local bug).
      const checkinTime = checkInOpensAt?.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      })
      const buttonLabel = isEventActive
        ? 'Check In Now'
        : checkinTime
          ? `Check-in opens at ${checkinTime}`
          : "You're registered"

      return (
        <motion.div
          className="space-y-2"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <div className="relative">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              icon={<CheckCircle2 size={18} />}
              disabled={!isEventActive}
              onClick={isEventActive ? () => setShowCheckInSheet(true) : undefined}
              className={cn(
                'bg-gradient-to-r shadow-sm',
                accent.gradient,
                isEventActive && accent.glow,
                !isEventActive && '!opacity-100',
              )}
            >
              {buttonLabel}
            </Button>
            {/* One-shot burst halo fired when transitioning from "Register" to
                this registered CTA. Pure CSS - no framer keyframes - so we
                don't pay reflow cost during the animation. */}
            <AnimatePresence>
              {registeredJustNow && (
                <motion.span
                  key="register-burst"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary-400"
                  style={{ animation: 'registerBurst 600ms ease-out forwards' }}
                  aria-hidden="true"
                />
              )}
            </AnimatePresence>
          </div>
          {/* Share + Cancel row - share is now high-vis next to the
              destructive cancel-registration action so people can post
              about the event from the same place they manage attendance. */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              icon={<Share2 size={14} />}
              onClick={handleShare}
              className="flex-1 text-xs whitespace-nowrap px-2"
            >
              Share Event
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setShowCancelSheet(true)}
              className="flex-1 text-xs whitespace-nowrap px-2"
            >
              Cancel Registration
            </Button>
          </div>
        </motion.div>
      )
    }

    if (userStatus === 'waitlisted') {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-5 py-3.5 rounded-md bg-warning-50 text-warning-700 text-sm font-bold border border-warning-200/40">
            <AlertCircle size={18} />
            You're on the waitlist
          </div>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowCancelSheet(true)}
          >
            Leave Waitlist
          </Button>
        </div>
      )
    }

    if (userStatus === 'invited') {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-5 py-3.5 rounded-md bg-info-50 text-info-700 text-sm font-bold border border-info-200/40">
            <Mail size={18} />
            You've been invited
          </div>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={registerMutation.isPending}
            onClick={() => registerMutation.mutate({ eventId: event.id })}
            className={cn('bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
          >
            Accept & Register
          </Button>
        </div>
      )
    }

    // ── Ticketed events: show ticket selector ──
    if (isTicketed) {
      if (myTicket && (myTicket.status === 'confirmed' || myTicket.status === 'checked_in')) {
        return (
          <div className="space-y-2">
            <div className={cn(
              'flex items-center gap-2.5 px-5 py-3.5 rounded-md text-sm font-bold border',
              accent.bg, accent.text, accent.border,
            )}>
              <CheckCircle2 size={18} />
              <div className="flex-1 min-w-0">
                <p>You have a ticket</p>
                {myTicket.ticket_code && (
                  <p className="text-xs font-mono opacity-70 mt-0.5">{myTicket.ticket_code}</p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => navigate(`/events/${event.id}/ticket-confirmation?ticket_id=${myTicket.id}`)}
            >
              View Ticket
            </Button>
          </div>
        )
      }

      if (myTicket && myTicket.status === 'pending') {
        // Check if the pending ticket is stale (older than 30 min)
        const pendingAge = Date.now() - new Date(myTicket.created_at).getTime()
        const isStale = pendingAge > 30 * 60 * 1000

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-5 py-3.5 rounded-md bg-warning-50 text-warning-700 text-sm font-bold border border-warning-200/40">
              <Clock size={18} />
              {isStale ? 'Your checkout session has expired' : 'Payment pending - complete your checkout'}
            </div>
            <div className="flex gap-2">
              {!isStale && myTicket.stripe_checkout_session_id && (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={async () => {
                    // Try to resume - create a new checkout since Stripe sessions expire
                    try {
                      const result = await ticketCheckout.mutateAsync({
                        eventId: event.id,
                        ticketTypeId: myTicket.ticket_type_id,
                      })
                      if (result.url) window.location.href = result.url
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to resume checkout')
                    }
                  }}
                  loading={ticketCheckout.isPending}
                  className={cn('bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
                >
                  Retry Checkout
                </Button>
              )}
              <Button
                variant="ghost"
                size="md"
                fullWidth={!myTicket.stripe_checkout_session_id || isStale}
                onClick={() => {
                  cancelPendingTicket.mutate({ ticketId: myTicket.id, eventId: event.id })
                }}
                loading={cancelPendingTicket.isPending}
              >
                {isStale ? 'Clear & Try Again' : 'Cancel'}
              </Button>
            </div>
          </div>
        )
      }

      // Sold out (e.g. on Eventbrite): close native sales. Eventbrite buyers
      // still get in via their claim link (it bypasses this entirely), and any
      // already-confirmed/pending holder is handled by the branches above.
      if (soldOut) {
        return (
          <div className="flex items-start gap-2.5 px-5 py-4 rounded-md bg-neutral-50 text-neutral-700 text-sm border border-neutral-200">
            <Ticket size={18} className="mt-0.5 shrink-0 text-neutral-400" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-neutral-900">Sold out</p>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Tickets for this campout have sold out. If the organisers sent you a claim
                link, open it to grab your free app ticket and join the group chat.
              </p>
            </div>
          </div>
        )
      }

      // No ticket - show ticket type selector
      return (
        <div className="space-y-3">
          {(ticketTypes ?? []).map((tt) => {
            const soldOut = tt.remaining !== null && tt.remaining <= 0
            const selected = selectedTicketType === tt.id
            const notOnSale = (tt.sale_start && new Date(tt.sale_start) > new Date()) || (tt.sale_end && new Date(tt.sale_end) < new Date())

            return (
              <button
                key={tt.id}
                type="button"
                disabled={soldOut || !!notOnSale}
                onClick={() => setSelectedTicketType(selected ? null : tt.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-md border text-left transition-all cursor-pointer',
                  selected
                    ? `${accent.border} ${accent.bg}`
                    : 'border-neutral-100 bg-white hover:bg-neutral-50',
                  (soldOut || notOnSale) && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{tt.name}</p>
                  {tt.description && <p className="text-xs text-neutral-500 mt-0.5">{tt.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-neutral-900">
                      {tt.price_cents === 0 ? 'Free' : `$${(tt.price_cents / 100).toFixed(2)}`}
                    </span>
                    {tt.remaining !== null && !soldOut && (
                      <span className="text-[11px] text-neutral-500">{tt.remaining} left</span>
                    )}
                    {soldOut && <span className="text-[11px] font-semibold text-error-500">Sold out</span>}
                    {notOnSale && !soldOut && <span className="text-[11px] text-neutral-500">Not on sale</span>}
                  </div>
                </div>
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 shrink-0 transition-colors',
                  selected ? `${accent.border} ${accent.bg}` : 'border-neutral-200',
                )}>
                  {selected && <div className={cn('w-full h-full rounded-full scale-50', accent.bg)} />}
                </div>
              </button>
            )
          })}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!selectedTicketType}
            loading={ticketCheckout.isPending}
            onClick={async () => {
              if (!selectedTicketType) return
              try {
                const result = await ticketCheckout.mutateAsync({
                  eventId: event.id,
                  ticketTypeId: selectedTicketType,
                })
                // Redirect to Stripe Checkout
                if (result.url) {
                  window.location.href = result.url
                } else if (result.session_id) {
                  const { redirectToCheckout: redir } = await import('@/lib/stripe')
                  await redir(result.session_id)
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to start checkout')
              }
            }}
            className={cn('bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
          >
            {selectedTicketType
              ? `Get Ticket - $${((ticketTypes?.find((t) => t.id === selectedTicketType)?.price_cents ?? 0) / 100).toFixed(2)}`
              : 'Select a ticket'}
          </Button>
        </div>
      )
    }

    // ── External collaboration: show external registration link ──
    if (event.external_registration_url) {
      const extUrl = event.external_registration_url
      return (
        <div className="space-y-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => window.open(extUrl, '_blank', 'noopener,noreferrer')}
            icon={<ExternalLink size={18} />}
            className={cn('bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
          >
            Register on Partner Site
          </Button>
          {/* Also allow in-app registration */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            loading={registerMutation.isPending}
            onClick={handleRegister}
          >
            {isAtCapacity ? 'Join Waitlist' : 'Also Register In-App'}
          </Button>
        </div>
      )
    }

    // ── Free events: regular registration ──
    return (
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={registerMutation.isPending}
        onClick={handleRegister}
        className={cn('bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
      >
        {isAtCapacity ? 'Join Waitlist' : 'Register for Event'}
      </Button>
    )
  }

  return (
    <Page
      swipeBack
      footer={renderCta()}
      noBackground={!!event.cover_image_url}
      stickyOverlay={
        <EventHeroOverlay hasCoverImage={!!event.cover_image_url} onShare={handleShare} />
      }
    >
      <EventHero
        event={event}
        past={past}
        userStatus={userStatus}
        accent={accent}
        onShare={handleShare}
      />

      <motion.div
        className="relative pt-5 pb-8 space-y-4"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ── Mid-event offline / pending-sync banner (participants + leaders) ──
            Visible whenever the device is offline OR there are queued actions.
            Mirrors the leader banner on event-day.tsx so participants get
            the same feedback at the venue. */}
        {(isOffline || pendingCount > 0) && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <div
              className={cn(
                'flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm',
                isOffline
                  ? 'bg-warning-50 text-warning-800 ring-1 ring-warning-200/60'
                  : 'bg-primary-50 text-primary-800 ring-1 ring-primary-200/60',
              )}
              role="status"
              aria-live="polite"
            >
              {isOffline ? (
                <WifiOff size={16} className="shrink-0" />
              ) : (
                <RefreshCw size={16} className={cn('shrink-0', syncingNow && 'animate-spin')} />
              )}
              <div className="flex-1 leading-tight">
                {isOffline ? (
                  <p className="font-medium">
                    Offline - actions saved on device.
                    {pendingCount > 0 && (
                      <span className="ml-1 text-warning-700">
                        {pendingCount} queued
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="font-medium">
                    {pendingCount} action{pendingCount === 1 ? '' : 's'} queued, syncing...
                  </p>
                )}
              </div>
              {!isOffline && pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncingNow}
                  className="text-xs font-semibold underline disabled:opacity-50"
                >
                  Sync now
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Live "X of Y here so far" - visible on event day for everyone.
            Reads from cached event-attendees so it survives flaky network. */}
        {isEventTodayForLive && liveAttendees && liveAttendees.length > 0 && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <div className="flex items-center gap-3 rounded-sm bg-white p-3 shadow-sm border border-success-100">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-success-50">
                <UserCheck size={16} className="text-success-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wider font-semibold text-success-600">Here so far</p>
                <p className="text-sm font-bold text-neutral-900 mt-0.5">
                  {liveCheckedIn} of {liveRegistered}
                  {liveCheckedIn > 0 && liveRegistered > 0 && (
                    <span className="ml-2 text-caption font-normal text-neutral-500">
                      ({Math.round((liveCheckedIn / liveRegistered) * 100)}%)
                    </span>
                  )}
                </p>
              </div>
              <div className="h-2 w-20 rounded-full bg-neutral-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-success-500"
                  initial={{ width: 0 }}
                  animate={{ width: liveRegistered > 0 ? `${(liveCheckedIn / liveRegistered) * 100}%` : '0%' }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Leader quick-actions grid (top-of-page for leaders) ── */}
        {isStaff && !collectiveRole.isLoading && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-sm bg-moss-50 flex items-center justify-center">
                <Sparkles size={11} className="text-moss-600" />
              </div>
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Leader Actions</span>
            </div>
            {/* Leader override: force-open check-in before the window */}
            {!past && !checkInForcedOpen && !isEventActive && event.status !== 'cancelled' && (
              <div className="mb-2.5 flex items-center gap-2 px-3.5 py-2.5 rounded-sm bg-warning-50 border border-warning-200/40">
                <Clock size={14} className="text-warning-600 shrink-0" />
                <p className="text-xs text-warning-700 flex-1">
                  Check-in opens at {checkInOpensAt?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) ?? '-'}
                </p>
                <button
                  type="button"
                  onClick={() => setCheckInForcedOpen(true)}
                  className="text-xs font-bold text-warning-700 underline underline-offset-2 cursor-pointer shrink-0"
                >
                  Open now
                </button>
              </div>
            )}
            {checkInForcedOpen && (
              <div className="mb-2.5 flex items-center gap-2 px-3.5 py-2.5 rounded-sm bg-success-50 border border-success-200/40">
                <CheckCircle2 size={14} className="text-success-600 shrink-0" />
                <p className="text-xs text-success-700">Check-in is open (manual override)</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigate(`/events/${event.id}/day`)}
                className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
              >
                <div className="w-9 h-9 rounded-sm bg-moss-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ClipboardList size={16} className="text-moss-600" />
                </div>
                <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">Event Day</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrSheet(true)}
                className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
              >
                <div className="w-9 h-9 rounded-sm bg-primary-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Hash size={16} className="text-primary-600" />
                </div>
                <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">Check-in Code</span>
              </button>
              {/* Only show Log Impact when impact hasn't been logged yet -
                  otherwise the action is redundant (the logged impact is
                  visible in the Impact Summary section below).
                  2026-05-16 Tate feedback. */}
              {isLeaderOrAbove && !event.impact && (
                <button
                  type="button"
                  onClick={() => navigate(`/events/${event.id}/impact`)}
                  className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                >
                  <div className="w-9 h-9 rounded-sm bg-sprout-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Leaf size={16} className="text-sprout-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">Log Impact</span>
                </button>
              )}
              {isLeaderOrAbove && (
                <button
                  type="button"
                  onClick={() => navigate(`/events/${event.id}/edit`)}
                  className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                >
                  <div className="w-9 h-9 rounded-sm bg-sky-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Pencil size={16} className="text-sky-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">Edit</span>
                </button>
              )}
              {isLeaderOrAbove && (
                <button
                  type="button"
                  onClick={handleDuplicate}
                  className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                >
                  <div className="w-9 h-9 rounded-sm bg-violet-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Copy size={16} className="text-violet-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">Duplicate</span>
                </button>
              )}
              {isLeaderOrAbove && !past && event.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={handleOpenInviteSheet}
                  className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-neutral-100 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                >
                  <div className={cn(
                    'w-9 h-9 rounded-sm flex items-center justify-center group-hover:scale-105 transition-transform',
                    alreadyInvited ? 'bg-sky-50' : 'bg-bark-50',
                  )}>
                    {alreadyInvited ? <Bell size={16} className="text-sky-600" /> : <Send size={16} className="text-bark-600" />}
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-700 leading-tight text-center">{alreadyInvited ? 'Remind' : 'Invite'}</span>
                </button>
              )}
              {isLeaderOrAbove && event.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => setShowCancelEventSheet(true)}
                  className="group flex flex-col items-center gap-1.5 rounded-sm bg-white shadow-sm border border-error-100/60 p-3 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                >
                  <div className="w-9 h-9 rounded-sm bg-error-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Ban size={16} className="text-error-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-error-600 leading-tight text-center">Cancel</span>
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Key info card ── */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="rounded-md p-4.5 space-y-0.5 bg-white border border-neutral-100 shadow-sm"
        >
          <InfoChip
            icon={<Calendar size={17} />}
            label="Date & Time"
            value={`${formatEventDate(event.date_start, eventTz)}${event.date_end ? ` - ${formatEventTime(event.date_end, eventTz)}` : ''}`}
            accent={accent}
          />
          {event.date_end && (
            <InfoChip
              icon={<Clock size={17} />}
              label="Duration"
              value={getEventDuration(event.date_start, event.date_end)}
              accent={accent}
            />
          )}
          {event.address && (
            <InfoChip
              icon={<MapPin size={17} />}
              label="Location"
              value={event.address}
              accent={accent}
              action={{ label: 'Directions', onClick: handleGetDirections }}
            />
          )}
        </motion.div>

        {/* ── Location map ── */}
        {/* Render the map block when we have either saved coords (mapPos) or
            an address. The button is visibly disabled when neither yields a
            usable directions destination so it never fires a malformed URL. */}
        {(mapPos || event.address) && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="relative"
          >
            {mapPos && (
              <MapView
                center={mapPos}
                zoom={15}
                markers={[{ id: event.id, position: mapPos, variant: 'event', label: event.title }]}
                interactive
                aria-label={`${event.title} location`}
                className="aspect-[4/3] sm:aspect-video rounded-md shadow-sm border border-neutral-100"
              />
            )}
            <button
              type="button"
              onClick={handleGetDirections}
              disabled={!hasDirectionsDestination}
              className={cn(
                mapPos ? 'absolute bottom-3 right-3 z-[1000]' : 'mt-1',
                'flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-[13px] font-bold',
                'bg-white text-neutral-700 shadow-md border border-neutral-200',
                hasDirectionsDestination
                  ? 'cursor-pointer select-none active:scale-[0.97] transition-transform duration-150'
                  : 'opacity-50 cursor-not-allowed',
              )}
              aria-label="Get directions"
              aria-disabled={!hasDirectionsDestination}
            >
              <Compass size={14} />
              Directions
            </button>
          </motion.div>
        )}

        {/* ── Description (About this event) ── */}
        {event.description && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-4.5 bg-white border border-neutral-100 shadow-sm"
          >
            <h3 className="text-sm font-bold mb-3 text-neutral-900">About this event</h3>
            <div className="relative">
              <p
                className={cn(
                  'text-[15px] text-neutral-600 leading-relaxed whitespace-pre-line',
                  !descriptionExpanded && 'line-clamp-4',
                )}
              >
                {event.description}
              </p>
              {event.description.length > 200 && !descriptionExpanded && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded(true)}
                  className="min-h-11 flex items-center justify-center text-caption font-bold mt-1.5 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150 text-primary-600"
                >
                  Read more
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Event details pills (what_to_bring, terrain, difficulty, etc.) ── */}
        {(() => {
          // Extended event fields not yet in generated DB types
          const ext = event as unknown as {
            what_to_bring?: string
            what_to_wear?: string
            meeting_point?: string
            terrain?: string
            difficulty?: keyof typeof difficultyConfig
            wheelchair_access?: boolean
          }
          if (!ext.what_to_bring && !ext.what_to_wear && !ext.meeting_point && !ext.terrain && !ext.difficulty && !ext.wheelchair_access) return null
          return (
            <motion.div
              variants={shouldReduceMotion ? undefined : fadeUp}
              className="rounded-md p-4.5 bg-white border border-neutral-100 shadow-sm"
            >
              <h3 className="text-sm font-bold mb-3 text-neutral-900">Good to know</h3>
              <div className="space-y-3">
                {ext.meeting_point && (
                  <div className="flex items-start gap-2.5">
                    <MapPin size={15} className={cn('shrink-0 mt-0.5', accent.text)} />
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">Meeting point</p>
                      <p className="text-sm font-medium text-neutral-700">{ext.meeting_point}</p>
                    </div>
                  </div>
                )}
                {ext.what_to_bring && (
                  <div className="flex items-start gap-2.5">
                    <Backpack size={15} className={cn('shrink-0 mt-0.5', accent.text)} />
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">What to bring</p>
                      <p className="text-sm font-medium text-neutral-700">{ext.what_to_bring}</p>
                    </div>
                  </div>
                )}
                {ext.what_to_wear && (
                  <div className="flex items-start gap-2.5">
                    <Shirt size={15} className={cn('shrink-0 mt-0.5', accent.text)} />
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">What to wear</p>
                      <p className="text-sm font-medium text-neutral-700">{ext.what_to_wear}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {ext.difficulty && (() => {
                    const d = difficultyConfig[ext.difficulty!]
                    if (!d) return null
                    const Icon = d.icon
                    return (
                      <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold', d.color)}>
                        <Icon size={13} />
                        {d.label}
                      </span>
                    )
                  })()}
                  {ext.terrain && (
                    <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold', accent.bg, accent.text)}>
                      <Mountain size={13} />
                      {ext.terrain}
                    </span>
                  )}
                  {ext.wheelchair_access && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold bg-info-100 text-info-700">
                      <Accessibility size={13} />
                      Wheelchair accessible
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })()}

        {/* ── Capacity section (spots filled) ── */}
        <EventAttendees
          event={event}
          accent={accent}
          capacityText={capacityText}
          capacityPercent={capacityPercent}
          fadeUpVariants={shouldReduceMotion ? undefined : fadeUp}
        />

        {/* Admin-only attendees export (Jess: copy/download names + emergency
            contacts to forward externally). Gated to staff+ since it exposes
            PII from every registration. */}
        {isStaff && (
          <AdminAttendeesExport
            eventId={event.id}
            details={{
              title: event.title,
              date_start: event.date_start,
              date_end: event.date_end ?? null,
              address: event.address ?? null,
              activity_type: event.activity_type ?? null,
              collective_name: event.collectives?.name ?? null,
            }}
          />
        )}

        {/* Leader quick-actions are now rendered above the key-info card. */}

        {/* ── Ticket Sales (ticketed events, leader+ only) ── */}
        {isTicketed && isStaff && (
          <TicketSalesSection eventId={event.id} accent={accent} rm={shouldReduceMotion} />
        )}

        {/* ── Post-event: Impact Summary ── */}
        {past && event.impact && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-4.5 space-y-3.5 bg-white border border-neutral-100 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className={cn('w-7 h-7 rounded-sm flex items-center justify-center', accent.bg)}>
                <Leaf size={14} className={accent.text} />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">Impact Summary</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(event.impact.trees_planted ?? 0) > 0 && (
                <StatCard
                  label="Trees Planted"
                  value={event.impact.trees_planted ?? 0}
                  icon={<TreePine size={18} />}
                />
              )}
              {(event.impact.rubbish_kg ?? 0) > 0 && (
                <StatCard
                  label="Litter Removed (kg)"
                  value={event.impact.rubbish_kg ?? 0}
                  icon={<Trash2 size={18} />}
                />
              )}
              {(event.impact.hours_total ?? 0) > 0 && (
                <StatCard
                  label="Est. Vol. Hours"
                  value={event.impact.hours_total ?? 0}
                  icon={<Clock size={18} />}
                />
              )}
              {/* Custom metrics from JSONB */}
              {event.impact.custom_metrics &&
                typeof event.impact.custom_metrics === 'object' &&
                !Array.isArray(event.impact.custom_metrics) &&
                Object.entries(event.impact.custom_metrics as Record<string, unknown>)
                  .filter(([, v]) => (Number(v) || 0) > 0)
                  .map(([key, v]) => (
                    <StatCard
                      key={key}
                      label={metricLabels[key] ?? key.replace(/_/g, ' ')}
                      value={Number(v) || 0}
                      icon={<Sparkles size={18} />}
                    />
                  ))}
            </div>
          </motion.div>
        )}

        {/* ── Action buttons row ──
            Share moved out of here. Two share entry points now:
            (1) high-vis pulse Share button in EventHeroOverlay (page header)
            (2) Share Event paired with Cancel Registration in CTA footer */}
        <EventActions
          past={past}
          fadeUpVariants={shouldReduceMotion ? undefined : fadeUp}
          onCalendarOpen={() => setShowCalendarSheet(true)}
        />

        {/* ── Coordination (carpool breakouts for this event) ── */}
        {eventCarpools && eventCarpools.length > 0 && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-4 bg-white border border-neutral-100 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-sm bg-primary-50 flex items-center justify-center">
                <Car size={11} className="text-primary-600" />
              </div>
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                Coordination
              </span>
            </div>
            <div className="space-y-2">
              {eventCarpools.map((cp) => {
                // departure_time is wall-clock-as-UTC (same frame as event
                // times); pin UTC so it reads verbatim, not device-shifted.
                const departure = new Date(cp.departure_time)
                const departureLabel = departure.toLocaleString([], {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'UTC',
                })
                return (
                  <button
                    key={cp.carpool_id}
                    type="button"
                    onClick={() => navigate(`/chat/channel/${cp.channel_id}`)}
                    className="w-full flex items-center gap-3 min-h-11 p-2 rounded-sm hover:bg-neutral-50 active:scale-[0.98] transition-[opacity,transform] duration-150 text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-sm bg-primary-50 flex items-center justify-center shrink-0">
                      <Car size={15} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">
                        {cp.channel_name || `Carpool from ${cp.departure_point_text}`}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {departureLabel} · {cp.seats_taken}/{cp.seats_total} seats
                      </p>
                    </div>
                    <ChevronRight size={14} className="ml-auto shrink-0 text-neutral-400" />
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ── Campout group chat (confirmed ticket holders + staff) ── */}
        {campoutChannel && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-4 bg-white border border-neutral-100 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-sm bg-primary-50 flex items-center justify-center">
                <Tent size={11} className="text-primary-600" />
              </div>
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                Group chat
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/chat/channel/${campoutChannel.id}`)}
              className="w-full flex items-center gap-3 min-h-11 p-2 rounded-sm hover:bg-neutral-50 active:scale-[0.98] transition-[opacity,transform] duration-150 text-left cursor-pointer"
            >
              <div className="w-9 h-9 rounded-sm bg-primary-50 flex items-center justify-center shrink-0">
                <Tent size={15} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 truncate">
                  {campoutChannel.name}
                </p>
                <p className="text-[11px] text-neutral-500 truncate">
                  Chat with everyone coming to this campout
                </p>
              </div>
              <ChevronRight size={14} className="ml-auto shrink-0 text-neutral-400" />
            </button>
          </motion.div>
        )}

        {/* ── Collaborating collectives ── */}
        {event.collaborators && event.collaborators.length > 0 && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-4 bg-white border border-neutral-100 shadow-sm"
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 mb-2.5">
              Co-hosted with
            </p>
            <div className="space-y-2">
              {event.collaborators.map((collab) => (
                <Link
                  key={collab.id}
                  to={`/collectives/${collab.slug ?? collab.id}`}
                  className="flex items-center gap-3 min-h-11 hover:opacity-80 active:scale-[0.98] transition-[opacity,transform] duration-150"
                >
                  {collab.cover_image_url ? (
                    <img src={collab.cover_image_url} alt={collab.name} loading="lazy" className="w-9 h-9 rounded-sm object-cover shrink-0 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className={cn('w-9 h-9 rounded-sm flex items-center justify-center shrink-0 shadow-sm', accent.bg)}>
                      <Users size={15} className={accent.text} />
                    </div>
                  )}
                  <span className="text-sm font-bold text-neutral-900">{collab.name}</span>
                  <ChevronRight size={14} className="ml-auto shrink-0 text-neutral-400" />
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Post-event: survey prompt ── */}
        {past && userStatus === 'attended' && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="rounded-md p-5 bg-white border border-neutral-100 shadow-sm"
          >
            <p className="text-sm font-bold text-neutral-900">How was the event?</p>
            <p className="text-caption text-neutral-500 mt-1">
              Share your feedback to help us improve future events.
            </p>
            <Button
              variant="primary"
              size="sm"
              className={cn('mt-3 bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
              onClick={() => navigate(`/events/${event.id}/survey`)}
            >
              Give Feedback
            </Button>
          </motion.div>
        )}

        {/* ── Post-event: shared photo album ──
            Visible to collective members; upload available to attendees + leaders. */}
        {past && (belongsToCollective || isLeaderOrAbove) && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <EventPhotosSection
              eventId={event.id}
              eventTitle={event.title}
              eventEndIso={event.date_end ?? event.date_start}
              canUpload={userStatus === 'attended' || isLeaderOrAbove}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Cancel confirmation */}
      <ConfirmationSheet
        open={showCancelSheet}
        onClose={() => setShowCancelSheet(false)}
        onConfirm={handleCancelConfirm}
        title="Cancel Registration?"
        description="You'll lose your spot. If the event is full, you'll need to join the waitlist to re-register."
        confirmLabel="Yes, Cancel"
        variant="warning"
      />

      {/* Check-in code sheet */}
      <BottomSheet
        open={showQrSheet}
        onClose={() => setShowQrSheet(false)}
        snapPoints={[0.4]}
      >
        <div className="flex flex-col items-center py-6">
          <p className="text-[11px] uppercase tracking-wider text-primary-600 font-semibold mb-2">Check-in Code</p>
          {event.check_in_code ? (
            <p className="text-5xl font-heading font-bold text-primary-700 tracking-[0.3em]">
              {event.check_in_code}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">No check-in code generated for this event</p>
          )}
          <p className="text-sm font-medium text-neutral-900 mt-4 text-center">
            {event.title}
          </p>
          <p className="text-caption text-neutral-500 mt-1">
            Share this code with participants to check in
          </p>
        </div>
      </BottomSheet>

      {/* Calendar sheet */}
      <BottomSheet
        open={showCalendarSheet}
        onClose={() => setShowCalendarSheet(false)}
        snapPoints={[0.35]}
      >
        <h3 className="font-heading text-base font-semibold text-neutral-900 mb-4">
          Add to Calendar
        </h3>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              downloadIcsFile(event)
              setShowCalendarSheet(false)
            }}
            className="flex items-center gap-3 w-full min-h-11 px-4 py-3 rounded-sm hover:bg-neutral-50 cursor-pointer select-none text-left active:scale-[0.97] transition-transform duration-150"
          >
            <CalendarPlus size={20} className="text-neutral-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Download .ics file</p>
              <p className="text-caption text-neutral-500">Works with Apple Calendar & others</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              window.open(getGoogleCalendarUrl(event), '_blank')
              setShowCalendarSheet(false)
            }}
            className="flex items-center gap-3 w-full min-h-11 px-4 py-3 rounded-sm hover:bg-neutral-50 cursor-pointer select-none text-left active:scale-[0.97] transition-transform duration-150"
          >
            <Calendar size={20} className="text-neutral-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Google Calendar</p>
              <p className="text-caption text-neutral-500">Opens in your browser</p>
            </div>
          </button>
        </div>
      </BottomSheet>

      {/* Cancel event sheet */}
      <BottomSheet
        open={showCancelEventSheet}
        onClose={() => setShowCancelEventSheet(false)}
        snapPoints={[0.5]}
      >
        <div className="space-y-4">
          <div>
            <h3 className="font-heading text-base font-semibold text-neutral-900">
              Cancel Event
            </h3>
            <p className="text-caption text-neutral-500 mt-1">
              All registered and invited attendees will be notified. This cannot be undone.
            </p>
          </div>
          <Input
            type="textarea"
            label="Cancellation Reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (optional)"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setShowCancelEventSheet(false)}
            >
              Keep Event
            </Button>
            <Button
              variant="primary"
              className="flex-1 bg-error-600 hover:bg-error-700"
              loading={cancelEventMutation.isPending}
              onClick={handleCancelEvent}
            >
              Cancel Event
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Invite / Remind sheet */}
      <BottomSheet
        open={showInviteSheet}
        onClose={() => setShowInviteSheet(false)}
        snapPoints={[0.55]}
      >
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={cn(
                'w-8 h-8 rounded-sm flex items-center justify-center shadow-sm bg-gradient-to-br',
                alreadyInvited ? 'from-moss-500 to-moss-600' : 'from-sprout-500 to-sprout-600',
              )}>
                {alreadyInvited ? <Bell size={15} className="text-white" /> : <Send size={15} className="text-white" />}
              </div>
              <h3 className="font-heading text-base font-semibold text-neutral-900">
                {alreadyInvited ? 'Send Reminder' : 'Invite Collective'}
              </h3>
            </div>
            <p className="text-caption text-neutral-500 mt-1">
              {alreadyInvited
                ? 'This will post a rich event card to the collective chat as a reminder.'
                : 'This will invite all members, send notifications, and post to the collective chat.'}
            </p>
          </div>

          {/* Event preview */}
          <div className="rounded-sm p-3.5 border border-neutral-100">
            <div className="flex items-center gap-3">
              {event?.cover_image_url ? (
                <img src={event.cover_image_url} alt={event.title} loading="lazy" className="w-12 h-12 rounded-sm object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <div className={cn('w-12 h-12 rounded-sm flex items-center justify-center shrink-0', accent.bg)}>
                  <Calendar size={18} className={accent.text} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-neutral-900 line-clamp-2">{event?.title}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {event ? formatEventDate(event.date_start, eventTz) : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Custom message */}
          <Input
            type="textarea"
            label="Message"
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
            placeholder="Add a personalised message..."
            rows={3}
          />

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setShowInviteSheet(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className={cn('flex-1 bg-gradient-to-r shadow-sm', accent.gradient, accent.glow)}
              loading={inviteCollectiveMutation.isPending}
              onClick={handleSendInvite}
              icon={alreadyInvited ? <Bell size={15} /> : <Send size={15} />}
            >
              {alreadyInvited ? 'Send Reminder' : 'Invite All'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Check-in sheet */}
      {event && (
        <CheckInSheet
          open={showCheckInSheet}
          onClose={() => setShowCheckInSheet(false)}
          eventId={event.id}
          eventTitle={event.title}
          collectiveName={event.collectives?.name}
        />
      )}

      {/* Share sheet - 1:1, 4:5, 16:9 Instagram-ready PNGs with app store
          badges. Opened from EventHeroOverlay (high-vis pulse button) and
          from the "Share Event" button paired with Cancel Registration. */}
      {event && (
        <EventShareSheet
          open={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          eventId={event.id}
          title={event.title}
          dateLabel={`${formatEventDate(event.date_start, eventTz)}${event.date_end ? ` - ${formatEventTime(event.date_end, eventTz)}` : ''}`}
          locationLabel={event.address ?? event.collectives?.name ?? 'Location TBA'}
          collectiveName={event.collectives?.name ?? null}
          coverImageUrl={event.cover_image_url ?? null}
        />
      )}
    </Page>
  )
}
