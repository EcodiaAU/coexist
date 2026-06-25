import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '@/components/toast'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Hash,
  Check,
  Users,
  UserCheck,
  UserPlus,
  ChevronRight,
  Phone,
  AlertTriangle,
  Accessibility,
  BookOpen,
  ClipboardList,
  Clock,
  Sparkles,
  RotateCcw,
  WifiOff,
  RefreshCw,
  QrCode,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Mail,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  useEventDetail,
  useEventAttendees,
  useEventImpact,
  useEventWalkIns,
  useDeleteWalkIn,
  useCheckIn,
  useUncheckIn,
  usePromoteFromWaitlist,
  formatEventDate,
  type EventWalkIn,
} from '@/hooks/use-events'
import { useOffline } from '@/hooks/use-offline'
import { usePendingSync } from '@/hooks/use-pending-sync'
import { triggerManualSync } from '@/lib/offline-sync'
import { isCheckInOpenForLeader, localDateIn } from '@/lib/date-format'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import { useAuth } from '@/hooks/use-auth'
import type { AttendeeWithStatus } from '@/hooks/use-events'
import {
  Page,
  Header,
  Button,
  Avatar,
  Skeleton,
  EmptyState,
  ConfirmationSheet,
  BottomSheet,
  SegmentedControl,
} from '@/components'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { ProfileModal } from '@/components/profile-modal'
import { EmergencyContacts } from '@/components/emergency-contacts'
import { SearchBar } from '@/components/search-bar'
import { cn } from '@/lib/cn'
import { attendeeName } from '@/lib/attendee-name'
import { FitText } from '@/components/fit-text'
import { supabase } from '@/lib/supabase'
import { WalkInSheet } from '@/components/walk-in-sheet'
import { useQueryClient } from '@tanstack/react-query'

/* ------------------------------------------------------------------ */
/*  Check-in Code Display Component                                    */
/* ------------------------------------------------------------------ */

function CheckInCodeDisplay({ checkInCode, title }: { checkInCode: string | null; title: string }) {
  return (
    <div className="flex flex-col items-center py-6">
      <p className="text-sm font-medium text-neutral-900 mb-2 text-center">
        {title}
      </p>
      <p className="text-caption text-neutral-500 mb-4">
        Tell your attendees this code to check in
      </p>
      <div className="px-5 py-5 rounded-md bg-white shadow-md">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500 text-center mb-2">Check-in code</p>
        <p className="text-5xl font-heading font-bold text-neutral-900 tracking-[0.4em] text-center">
          {checkInCode ?? '---'}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Attendee Row                                                       */
/* ------------------------------------------------------------------ */

function AttendeeRow({
  attendee,
  onCheckIn,
  onUncheck,
  onPromote,
  onViewDetails,
  isPending,
  isUnchecking,
  isPromoting,
  checkInOpen,
}: {
  attendee: AttendeeWithStatus
  onCheckIn: () => void
  onUncheck: () => void
  onPromote?: () => void
  onViewDetails: () => void
  isPending: boolean
  isUnchecking: boolean
  isPromoting?: boolean
  checkInOpen: boolean
}) {
  const isCheckedIn = attendee.status === 'attended'
  const isWaitlisted = attendee.status === 'waitlisted'
  const hasEmergencyInfo = !!(attendee.profiles?.emergency_contact_name || attendee.profiles?.accessibility_requirements)

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 cursor-pointer rounded-sm mb-2',
        'transition-colors duration-200',
        isCheckedIn
          ? 'bg-white ring-1 ring-success-300/60 shadow-sm border-l-4 border-l-success-400'
          : isWaitlisted
            ? 'bg-white ring-1 ring-bark-300/60 shadow-sm border-l-4 border-l-warning-400'
            : 'bg-white ring-1 ring-neutral-200/60 shadow-sm',
        'active:scale-[0.98] active:shadow-none',
      )}
      onClick={onViewDetails}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${attendeeName(attendee.profiles, 'attendee')}`}
    >
      <Avatar
        src={attendee.profiles?.avatar_url ?? undefined}
        name={attendeeName(attendee.profiles)}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* First + Last, shrunk to fit (never truncated) so leaders can tell
              apart people who share a first name. */}
          <span className="flex-1 min-w-0">
            <FitText className="font-medium text-neutral-900" max={14} min={10}>
              {attendeeName(attendee.profiles, 'Unknown User')}
            </FitText>
          </span>
          {hasEmergencyInfo && (
            <AlertTriangle size={12} className="text-warning-500 shrink-0" aria-label="Has safety info" />
          )}
        </div>
        <p className={cn(
          'text-caption font-medium',
          isCheckedIn ? 'text-success-600' : isWaitlisted ? 'text-bark-600' : 'text-neutral-500',
        )}>
          {isCheckedIn
            ? `Checked in ${attendee.checked_in_at ? new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(attendee.checked_in_at)) : ''}`
            : isWaitlisted
              ? 'Waitlisted'
              : 'Registered'}
        </p>
      </div>

      {isCheckedIn ? (
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full bg-success-500 text-white shadow-sm"
            aria-label="Checked in"
          >
            <Check size={18} strokeWidth={2.5} />
          </span>
          {checkInOpen && (
            <button
              type="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onUncheck() }}
              disabled={isUnchecking}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full',
                'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100',
                'transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              aria-label={`Uncheck ${attendeeName(attendee.profiles, 'attendee')}`}
              title="Uncheck (mark as not attended)"
            >
              <RotateCcw size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ) : isWaitlisted && onPromote ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<UserPlus size={14} />}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onPromote() }}
          loading={isPromoting}
        >
          Promote
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          icon={<UserCheck size={14} />}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCheckIn() }}
          loading={isPending}
          disabled={!checkInOpen}
          title={checkInOpen ? undefined : 'Check-in is closed for this event'}
        >
          Check In
        </Button>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Attendee Safety Details Sheet                                       */
/* ------------------------------------------------------------------ */

function AttendeeSafetySheet({
  attendee,
  open,
  onClose,
}: {
  attendee: AttendeeWithStatus | null
  open: boolean
  onClose: () => void
}) {
  if (!attendee?.profiles) return null

  const p = attendee.profiles

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.55]}>
      <div className="px-5 py-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar
            src={p.avatar_url ?? undefined}
            name={attendeeName(p)}
            size="lg"
          />
          <div>
            <p className="font-heading text-lg font-bold text-neutral-900">
              {attendeeName(p, 'Unknown User')}
            </p>
            {(p.age || p.gender) && (
              <p className="text-sm text-neutral-500">
                {[p.age && `Age ${p.age}`, p.gender].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Phone */}
        {p.phone && (
          <div className="flex items-start gap-3 p-3 rounded-sm bg-neutral-50">
            <Phone size={16} className="text-primary-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider">Phone</p>
              <a href={`tel:${p.phone}`} className="text-sm font-medium text-neutral-900 underline">
                {p.phone}
              </a>
            </div>
          </div>
        )}

        {/* Accessibility */}
        {p.accessibility_requirements && (
          <div className="flex items-start gap-3 p-3 rounded-sm bg-sky-50">
            <Accessibility size={16} className="text-sky-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">Accessibility Needs</p>
              <p className="text-sm text-neutral-900 mt-0.5">{p.accessibility_requirements}</p>
            </div>
          </div>
        )}

        {/* Emergency contact */}
        <div className="p-3 rounded-sm bg-warning-50 border border-warning-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-warning-600" />
            <p className="text-xs font-semibold text-warning-700 uppercase tracking-wider">
              Emergency Contact
            </p>
          </div>
          {p.emergency_contact_name ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-neutral-900">
                {p.emergency_contact_name}
                {p.emergency_contact_relationship && (
                  <span className="text-neutral-500 font-normal"> ({p.emergency_contact_relationship})</span>
                )}
              </p>
              {p.emergency_contact_phone && (
                <a
                  href={`tel:${p.emergency_contact_phone}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-warning-700 underline"
                >
                  <Phone size={14} />
                  {p.emergency_contact_phone}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-warning-600 italic">No emergency contact provided</p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function EventDayPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { profile } = useAuth()
  const { toast } = useToast()

  const { data: event, isLoading: eventLoading } = useEventDetail(eventId)
  const { data: attendees, isLoading: attendeesLoading } = useEventAttendees(eventId)
  // Existence of an event_impact row is the canonical "impact logged" signal -
  // it closes the post-event check-in backfill window (matches the BE triggers
  // in 20260520000000_post_event_checkin_backfill.sql).
  const { data: existingImpact } = useEventImpact(eventId)
  const impactLogged = !!existingImpact
  const { isAssistLeader, isLoading: roleLoading } = useCollectiveRole(event?.collective_id)
  // GLOBAL staff who can manage ANY event's attendees, matching the backend
  // is_admin_or_staff() set (national_leader/manager/admin). 'leader' is a
  // COLLECTIVE-scoped role, not global - a collective's own leaders reach
  // their event via isAssistLeader (useCollectiveRole above), so they keep
  // access to their own events without seeing every other collective's.
  const isStaff = profile?.role === 'national_leader' || profile?.role === 'manager' || profile?.role === 'admin'

  const queryClient = useQueryClient()
  const checkIn = useCheckIn()
  const uncheckIn = useUncheckIn()
  const { data: walkIns = [] } = useEventWalkIns(eventId)
  const deleteWalkIn = useDeleteWalkIn()
  const [deletingWalkInId, setDeletingWalkInId] = useState<string | null>(null)
  const [walkInToDelete, setWalkInToDelete] = useState<EventWalkIn | null>(null)
  // bulkCheckIn removed with the "Mark all present" footer button
  const promote = usePromoteFromWaitlist()

  // Mid-event offline visibility - leaders need to know whether actions are
  // queued vs synced. Origin: Tate verbatim 17:11 AEST 9 May 2026.
  const { isOffline } = useOffline()
  const { count: pendingCount } = usePendingSync()
  const [syncing, setSyncing] = useState(false)
  const handleManualSync = useCallback(async () => {
    setSyncing(true)
    try {
      await triggerManualSync()
    } finally {
      setSyncing(false)
    }
  }, [])

  const eventTz =
    (event as { timezone?: string | null } | undefined)?.timezone ??
    (event as { collectives?: { timezone?: string | null } | null } | undefined)?.collectives?.timezone ??
    'Australia/Sydney'

  // Check-in window (post-event backfill, 2026-05-20). Leaders/admins can check
  // attendees in on the event day AND afterwards until impact is logged - this
  // covers lost-wifi and partner-org sign-in sheets transcribed later. Future
  // check-in stays blocked (the 2026-05-09 wrong-day fix).
  const checkInOpen = isCheckInOpenForLeader(event?.date_start, eventTz, impactLogged)
  const eventDay = event?.date_start ? localDateIn(eventTz, event.date_start) : null
  const today = localDateIn(eventTz)
  const isFutureEvent = !!eventDay && eventDay > today
  const isPastEvent = !!eventDay && eventDay < today
  const checkInClosedMessage = 'Check-in opens on the day of the event'
  // The 2026-05-20 "Check-in is closed - impact has been logged" message
  // was retired 2026-06-01: leaders now have full post-event authority
  // for late corrections (see migration 20260601000000).


  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [showQr, setShowQr] = useState(false)
  // showBulkConfirm removed
  const [checkingInUserId, setCheckingInUserId] = useState<string | null>(null)
  const [uncheckingUserId, setUncheckingUserId] = useState<string | null>(null)
  const [uncheckTarget, setUncheckTarget] = useState<AttendeeWithStatus | null>(null)
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null)
  const [selectedAttendee, setSelectedAttendee] = useState<AttendeeWithStatus | null>(null)
  const [activeTab, setActiveTab] = useState<'attendees' | 'contacts'>('attendees')
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  // --- Walk-in sheet (Item 11) ---
  // The "all-members search" UX moved INTO WalkInSheet (Tate spec 2026-05-18):
  // if a user isn't registered, they're a walk-in - the previous "All Members"
  // sibling tab on this page was redundant.
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null)

  // --- Public check-in toggle (Item 12  -  synced from event data) ---
  const [publicCheckInEnabled, setPublicCheckInEnabled] = useState(false)
  const [togglingPublicCheckIn, setTogglingPublicCheckIn] = useState(false)
  useEffect(() => {
    if (event) {
      setPublicCheckInEnabled((event as unknown as Record<string, unknown>).public_check_in_enabled as boolean ?? false)
    }
  }, [event])

  const filteredAttendees = useMemo(() => {
    if (!attendees) return []
    if (!searchQuery.trim()) return attendees
    const q = searchQuery.toLowerCase()
    return attendees.filter((a) =>
      // match on full name (first + last) + display_name so leaders can search
      // by surname to disambiguate shared first names.
      `${attendeeName(a.profiles, '')} ${a.profiles?.display_name ?? ''}`.toLowerCase().includes(q),
    )
  }, [attendees, searchQuery])

  const stats = useMemo(() => {
    const walkInCount = walkIns.length
    if (!attendees) return { registered: 0, checkedIn: walkInCount, attendedRegistered: 0, waitlisted: 0 }
    const attendedRegistered = attendees.filter((a) => a.status === 'attended').length
    return {
      registered: attendees.filter((a) => a.status === 'registered' || a.status === 'attended').length,
      // attendedRegistered = registered list who showed; checkedIn = total
      // through the gate (registered-attended + walk-ins) matching the
      // canonical attendance definition in coexist_attendance_metrics.
      // The progress bar uses attendedRegistered/registered (registered-list
      // completion); the headline tile uses checkedIn (real attendance).
      attendedRegistered,
      checkedIn: attendedRegistered + walkInCount,
      waitlisted: attendees.filter((a) => a.status === 'waitlisted').length,
    }
  }, [attendees, walkIns])

  const handleCheckIn = useCallback(
    (userId: string) => {
      if (!eventId) return
      if (!checkInOpen) {
        toast.error(checkInClosedMessage)
        return
      }
      setCheckingInUserId(userId)
      checkIn.mutate(
        { eventId, userId },
        {
          onError: (err) => {
            const msg = err instanceof Error ? err.message : 'Check-in failed'
            toast.error(msg)
          },
          onSettled: () => setCheckingInUserId(null),
        },
      )
    },
    [eventId, checkIn, checkInOpen, checkInClosedMessage, toast],
  )

  const handleUncheckRequest = useCallback((attendee: AttendeeWithStatus) => {
    if (!checkInOpen) {
      toast.error(checkInClosedMessage)
      return
    }
    setUncheckTarget(attendee)
  }, [checkInOpen, checkInClosedMessage, toast])

  const handleUncheckConfirm = useCallback(() => {
    if (!eventId || !uncheckTarget) return
    const userId = uncheckTarget.user_id
    const displayName = attendeeName(uncheckTarget.profiles, 'Attendee')
    setUncheckingUserId(userId)
    uncheckIn.mutate(
      { eventId, userId },
      {
        onSuccess: () => toast.success(`${displayName} marked as not attended`),
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Un-check-in failed'
          toast.error(msg)
        },
        onSettled: () => {
          setUncheckingUserId(null)
          setUncheckTarget(null)
        },
      },
    )
  }, [eventId, uncheckTarget, uncheckIn, toast])

  // handleBulkCheckIn / showBulkConfirm removed - the "Mark all present"
  // button isn't used in practice and was crowding the footer row.

  const handlePromote = useCallback(
    (userId: string) => {
      if (!eventId) return
      setPromotingUserId(userId)
      promote.mutate(
        { eventId, userId },
        { onSettled: () => setPromotingUserId(null) },
      )
    },
    [eventId, promote],
  )

  // Add an all-app-member to the event and mark them attended immediately
  const handleAddAndCheckIn = useCallback(
    async (userId: string, displayName: string | null) => {
      if (!eventId) return
      if (!checkInOpen) {
        toast.error(checkInClosedMessage)
        return
      }
      setAddingMemberId(userId)
      try {
        const { error } = await supabase.from('event_registrations').insert({
          event_id: eventId,
          user_id: userId,
          status: 'attended',
          checked_in_at: new Date().toISOString(),
        })
        if (error) {
          if (error.code === '23505') {
            toast.info(`${displayName ?? 'User'} is already registered.`)
          } else {
            toast.error(error.message || 'Failed to add attendee')
          }
        } else {
          toast.success(`Checked in ${displayName ?? 'user'}`)
          // Invalidate attendees query so the new row appears
          queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
        }
      } finally {
        setAddingMemberId(null)
      }
    },
    [eventId, checkInOpen, checkInClosedMessage, toast, queryClient],
  )

  // Toggle the public QR check-in on/off for this event.
  // A BEFORE-UPDATE trigger mints the public_check_in_token server-side when
  // enabled flips true; we need to refetch the event row so the QR component
  // sees the new token. Without the invalidation the UI stays on
  // "Generating QR code..." indefinitely.
  const handleTogglePublicCheckIn = useCallback(async () => {
    if (!eventId) return
    setTogglingPublicCheckIn(true)
    const next = !publicCheckInEnabled
    try {
      const { error } = await supabase
        .from('events')
        .update({ public_check_in_enabled: next })
        .eq('id', eventId)
      if (error) {
        toast.error(error.message || 'Failed to update QR check-in')
      } else {
        setPublicCheckInEnabled(next)
        queryClient.invalidateQueries({ queryKey: ['event', eventId] })
        toast.success(next ? 'Public QR check-in enabled' : 'Public QR check-in disabled')
      }
    } finally {
      setTogglingPublicCheckIn(false)
    }
  }, [eventId, publicCheckInEnabled, queryClient, toast])

  const isLoading = eventLoading || attendeesLoading || roleLoading
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Event Day" back />}>
        <div className="pt-4 space-y-4">
          <Skeleton variant="title" />
          <div className="flex gap-3">
            <Skeleton variant="stat-card" className="flex-1" />
            <Skeleton variant="stat-card" className="flex-1" />
          </div>
          <Skeleton variant="list-item" count={5} />
        </div>
      </Page>
    )
  }
  if (!event) {
    return (
      <Page swipeBack header={<Header title="Event Day" back />}>
        <EmptyState
          illustration="error"
          title="Event not found"
          description="This event could not be loaded."
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  // Role gate: only assist-leaders+ and national staff can access the day-of dashboard
  if (!isAssistLeader && !isStaff) {
    return (
      <Page swipeBack header={<Header title="Event Day" back />}>
        <EmptyState
          illustration="error"
          title="Leader access only"
          description="The event day dashboard is available to event leaders and assist-leaders."
          action={{ label: 'View Event', onClick: () => navigate(`/events/${eventId}`) }}
        />
      </Page>
    )
  }

  return (
    <Page
      swipeBack
      header={<Header title="Event Day" back backDark />}
      footer={
        // Two-button footer (Tate spec 2026-05-18): the "Mark all present"
        // bulk-check-in was removed because it isn't used in practice and
        // its presence pushed the three-button row into overflow on
        // narrower screens. Show Code + Add Walk-In split 50/50.
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<Hash size={16} />}
            onClick={() => setShowQr(true)}
            className="flex-1 ring-1 ring-primary-200/60 whitespace-nowrap"
          >
            Show Code
          </Button>
          {(isAssistLeader || isStaff) && checkInOpen && (
            <Button
              variant="primary"
              icon={<UserPlus size={16} />}
              onClick={() => setShowWalkIn(true)}
              className="flex-1 shadow-md whitespace-nowrap"
            >
              Add Walk-In
            </Button>
          )}
        </div>
      }
    >
      <motion.div variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="pt-4 pb-6">
        {/* Event header */}
        <motion.div variants={fadeUp} className="mb-4">
          <h2 className="font-heading text-lg font-bold text-neutral-900">
            {event.title}
          </h2>
          <p className="text-caption text-neutral-500 mt-0.5">
            {formatEventDate(event.date_start, eventTz)}
          </p>
        </motion.div>

        {/* Mid-event offline / pending-sync status banner. Visible whenever the
            device is offline OR there are queued actions (e.g. signal flicker).
            Tap "Sync now" forces a drain rather than waiting for the periodic
            poll or the next online event. */}
        {(isOffline || pendingCount > 0) && (
          <motion.div variants={fadeUp} className="mb-4">
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
                <RefreshCw size={16} className={cn('shrink-0', syncing && 'animate-spin')} />
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
                  disabled={syncing}
                  className="text-xs font-semibold underline disabled:opacity-50"
                >
                  Sync now
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Check-in window banner (post-event backfill, 2026-05-20). Three states:
            future = locked until the day; past + open = backfill window; past +
            impact logged = closed/final. */}
        {isFutureEvent && (
          <motion.div
            variants={fadeUp}
            className="mb-5 rounded-sm bg-warning-50 border border-warning-200 p-3 flex items-start gap-2"
          >
            <Clock size={16} className="text-warning-600 mt-0.5 shrink-0" />
            <div className="text-sm text-warning-700">
              <p className="font-semibold">Check-in opens day of event</p>
              <p className="text-warning-600 mt-0.5">
                You'll be able to check attendees in (and undo) once the event date arrives.
              </p>
            </div>
          </motion.div>
        )}
        {isPastEvent && (
          <motion.div
            variants={fadeUp}
            className="mb-5 rounded-sm bg-primary-50 border border-primary-200 p-3 flex items-start gap-2"
          >
            <UserCheck size={16} className="text-primary-600 mt-0.5 shrink-0" />
            <div className="text-sm text-primary-700">
              <p className="font-semibold">Post-event check-in is open</p>
              <p className="text-primary-600 mt-0.5">
                Missed someone on the day? Check attendees in, add walk-ins,
                or undo any of it - leaders keep full control after the event.
              </p>
            </div>
          </motion.div>
        )}

        {/* Check-in code banner */}
        {event.check_in_code && (
          <motion.div variants={fadeUp} className="mb-5 rounded-sm bg-white border border-neutral-100 p-4 text-center shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-primary-600 font-semibold mb-1">Today's check-in code</p>
            <p className="text-4xl font-heading font-bold text-primary-700 tracking-[0.3em]">
              {event.check_in_code}
            </p>
          </motion.div>
        )}

        {/* Stats row */}
        <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-sm bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/15 mx-auto mb-1.5">
              <ClipboardList size={16} className="text-sky-600" />
            </div>
            <p className="text-xl font-bold text-sky-700">{stats.registered}</p>
            <p className="text-caption font-medium text-sky-600">Registered</p>
          </div>
          <div className="rounded-sm bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success-500/15 mx-auto mb-1.5">
              <UserCheck size={16} className="text-success-600" />
            </div>
            <p className="text-xl font-bold text-success-700">{stats.checkedIn}</p>
            <p className="text-caption font-medium text-success-600">Checked In</p>
          </div>
          <div className="rounded-sm bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-bark-500/15 mx-auto mb-1.5">
              <Clock size={16} className="text-bark-600" />
            </div>
            <p className="text-xl font-bold text-bark-700">{stats.waitlisted}</p>
            <p className="text-caption font-medium text-bark-600">Waitlisted</p>
          </div>
        </motion.div>

        {/* Live count bar */}
        {stats.registered > 0 && (
          <motion.div variants={fadeUp} className="mb-5 rounded-sm bg-white ring-1 ring-primary-100 p-3 shadow-sm">
            <div className="flex items-center justify-between text-caption mb-2">
              <span className="text-neutral-500 font-medium flex items-center gap-1.5">
                <Sparkles size={13} className="text-success-500" />
                Check-in progress
              </span>
              <span className="font-bold text-neutral-900">
                {stats.attendedRegistered}/{stats.registered}
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-success-500"
                initial={{ width: 0 }}
                animate={{ width: `${stats.registered > 0 ? (stats.attendedRegistered / stats.registered) * 100 : 0}%` }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            {stats.attendedRegistered === stats.registered && stats.registered > 0 && (
              <p className="text-caption font-semibold text-success-600 mt-1.5 text-center">All attendees checked in!</p>
            )}
          </motion.div>
        )}

        {/* Tab switcher */}
        <motion.div variants={fadeUp} className="mb-4">
          <SegmentedControl
            segments={[
              { id: 'attendees' as const, label: 'Attendees', icon: <Users size={15} /> },
              { id: 'contacts' as const, label: 'Contacts', icon: <BookOpen size={15} /> },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            aria-label="View attendees or contacts"
          />
        </motion.div>

        {activeTab === 'attendees' ? (
          <>
            {/* Search registered attendees */}
            <motion.div variants={fadeUp} className="mb-3">
              <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search attendees..." compact />
            </motion.div>

            {/* Registered attendee list */}
            <motion.div variants={fadeUp}>
              {filteredAttendees.length === 0 ? (
                <EmptyState
                  illustration="search"
                  title="No attendees found"
                  description={searchQuery ? 'Try a different search' : 'No one has registered yet'}
                />
              ) : (
                <div className="space-y-0">
                  {filteredAttendees.map((attendee) => (
                    <AttendeeRow
                      key={attendee.user_id}
                      attendee={attendee}
                      onCheckIn={() => handleCheckIn(attendee.user_id)}
                      onUncheck={() => handleUncheckRequest(attendee)}
                      onPromote={attendee.status === 'waitlisted' ? () => handlePromote(attendee.user_id) : undefined}
                      onViewDetails={() => setSelectedAttendee(attendee)}
                      isPending={checkingInUserId === attendee.user_id}
                      isUnchecking={uncheckingUserId === attendee.user_id}
                      isPromoting={promotingUserId === attendee.user_id}
                      checkInOpen={checkInOpen}
                    />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Walk-ins section - leader-recorded attendees that aren't in
                event_registrations. Tate P0 2026-06-01: leaders need to
                undo post-event walk-ins. Empty state collapses cleanly. */}
            {walkIns.length > 0 && (
              <motion.div variants={fadeUp} className="mt-6">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-neutral-700">
                    Walk-ins
                  </h3>
                  <span className="text-xs text-neutral-500">{walkIns.length}</span>
                </div>
                <div className="space-y-2">
                  {walkIns.map((w) => {
                    const fullName = [w.first_name, w.last_name].filter(Boolean).join(' ')
                    const contact = w.email || w.phone || 'No contact'
                    const isLeaderAdded = w.created_via === 'leader_adhoc'
                    return (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 p-3 rounded-sm bg-white ring-1 ring-neutral-100 shadow-sm"
                      >
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-50 text-primary-700 shrink-0">
                          <UserPlus size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {fullName || 'Unnamed walk-in'}
                          </p>
                          <p className="text-xs text-neutral-500 truncate flex items-center gap-1">
                            <Mail size={11} className="shrink-0" />
                            {contact}
                            {isLeaderAdded && (
                              <span className="ml-1 text-[10px] uppercase tracking-wider text-neutral-400">
                                leader added
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWalkInToDelete(w)}
                          disabled={deletingWalkInId === w.id}
                          className={cn(
                            'min-w-11 min-h-11 w-11 h-11 flex items-center justify-center rounded-full',
                            'text-neutral-400 hover:text-error hover:bg-error-50',
                            'transition-colors duration-150 cursor-pointer select-none',
                            'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error',
                          )}
                          aria-label={`Remove walk-in ${fullName || 'unnamed'}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* Post-event action */}
            <motion.div variants={fadeUp} className="mt-6">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate(`/events/${eventId}/impact`)}
                icon={<ChevronRight size={16} />}
              >
                Log Impact Data
              </Button>
            </motion.div>
          </>
        ) : (
          <motion.div
            variants={fadeUp}
            initial={shouldReduceMotion ? false : 'hidden'}
            animate="visible"
          >
            <EmergencyContacts eventState={event.collectives?.state} />
          </motion.div>
        )}
      </motion.div>

      {/* QR Code + public check-in bottom sheet */}
      <BottomSheet
        open={showQr}
        onClose={() => setShowQr(false)}
        snapPoints={[0.75]}
      >
        <div className="px-5 pb-6 space-y-5">
          {/* Existing 3-digit code display */}
          <CheckInCodeDisplay checkInCode={event.check_in_code} title={event.title} />

          {/* Divider */}
          <div className="border-t border-neutral-100" />

          {/* Public QR check-in toggle */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleTogglePublicCheckIn}
              disabled={togglingPublicCheckIn}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-sm transition-colors duration-150',
                publicCheckInEnabled
                  ? 'bg-success-50 ring-1 ring-success-200'
                  : 'bg-neutral-50 ring-1 ring-neutral-200',
                'disabled:opacity-60',
              )}
            >
              <div className="flex items-center gap-2">
                <QrCode size={18} className={publicCheckInEnabled ? 'text-success-600' : 'text-neutral-500'} />
                <div className="text-left">
                  <p className={cn('text-sm font-semibold', publicCheckInEnabled ? 'text-success-700' : 'text-neutral-700')}>
                    Public QR check-in
                  </p>
                  <p className="text-xs text-neutral-500">
                    {publicCheckInEnabled ? 'Scan to check in without the app' : 'Enable so anyone can scan and check in'}
                  </p>
                </div>
              </div>
              {publicCheckInEnabled ? (
                <ToggleRight size={24} className="text-success-500 shrink-0" />
              ) : (
                <ToggleLeft size={24} className="text-neutral-400 shrink-0" />
              )}
            </button>

            {/* QR code (shown only when enabled and token is minted) */}
            {publicCheckInEnabled && (event as unknown as Record<string, unknown>).public_check_in_token ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="p-3 rounded-md bg-white shadow-md ring-1 ring-neutral-100">
                  <QRCodeSVG
                    value={`https://app.coexistaus.org/check-in/${(event as unknown as Record<string, unknown>).public_check_in_token}`}
                    size={200}
                    level="M"
                  />
                </div>
                <p className="text-xs text-neutral-500 text-center">
                  Scan this QR code to check in without the app
                </p>
              </div>
            ) : publicCheckInEnabled ? (
              <p className="text-xs text-neutral-400 text-center italic">
                Generating QR code...
              </p>
            ) : null}
          </div>
        </div>
      </BottomSheet>

      {/* Bulk "Mark all present" sheet removed - the trigger is gone. */}

      {/* Un-check-in confirmation */}
      <ConfirmationSheet
        open={!!uncheckTarget}
        onClose={() => setUncheckTarget(null)}
        onConfirm={handleUncheckConfirm}
        title="Uncheck this attendee?"
        description={`Are you sure? This will mark ${attendeeName(uncheckTarget?.profiles, 'this attendee')} as not attended.`}
        confirmLabel="Uncheck"
        variant="warning"
      />

      {/* Walk-in delete confirmation (Tate P0 2026-06-01) */}
      <ConfirmationSheet
        open={!!walkInToDelete}
        onClose={() => setWalkInToDelete(null)}
        onConfirm={() => {
          if (!eventId || !walkInToDelete) return
          const w = walkInToDelete
          const displayName = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'walk-in'
          setDeletingWalkInId(w.id)
          deleteWalkIn.mutate(
            { eventId, walkInId: w.id },
            {
              onSuccess: () => toast.success(`${displayName} removed`),
              onError: (err) => {
                const msg = err instanceof Error ? err.message : 'Failed to remove walk-in'
                toast.error(msg)
              },
              onSettled: () => {
                setDeletingWalkInId(null)
                setWalkInToDelete(null)
              },
            },
          )
        }}
        title="Remove this walk-in?"
        description={`This will delete ${[walkInToDelete?.first_name, walkInToDelete?.last_name].filter(Boolean).join(' ') || 'this walk-in'} from the event. Their impact will not be counted.`}
        confirmLabel="Remove"
        variant="danger"
      />

      {/* Attendee safety details */}
      <AttendeeSafetySheet
        attendee={selectedAttendee}
        open={!!selectedAttendee}
        onClose={() => setSelectedAttendee(null)}
      />

      {/* Profile modal */}
      <ProfileModal userId={profileUserId} open={!!profileUserId} onClose={() => setProfileUserId(null)} />

      {/* Walk-in sheet (Item 11)  -  ad-hoc attendee form for leaders.
          Now also hosts the "search existing users" path (Tate spec 2026-05-18). */}
      {eventId && (
        <WalkInSheet
          eventId={eventId}
          open={showWalkIn}
          onClose={() => setShowWalkIn(false)}
          onSuccess={() => {
            // Attendee list re-queries via useEventAttendees invalidation
          }}
          onAddExistingUser={handleAddAndCheckIn}
        />
      )}
    </Page>
  )
}
