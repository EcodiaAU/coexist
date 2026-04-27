import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '@/components/toast'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Hash,
  Check,
  CheckCheck,
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
} from 'lucide-react'
// QRCodeSVG removed - replaced with 3-digit code display
import {
  useEventDetail,
  useEventAttendees,
  useCheckIn,
  useBulkCheckIn,
  usePromoteFromWaitlist,
  formatEventDate,
} from '@/hooks/use-events'
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
      <div className="px-5 py-5 rounded-2xl bg-white shadow-md">
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
  onPromote,
  onViewDetails,
  isPending,
  isPromoting,
}: {
  attendee: AttendeeWithStatus
  onCheckIn: () => void
  onPromote?: () => void
  onViewDetails: () => void
  isPending: boolean
  isPromoting?: boolean
}) {
  const isCheckedIn = attendee.status === 'attended'
  const isWaitlisted = attendee.status === 'waitlisted'
  const hasEmergencyInfo = !!(attendee.profiles?.emergency_contact_name || attendee.profiles?.accessibility_requirements)

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 cursor-pointer rounded-xl mb-2',
        'transition-colors duration-200',
        isCheckedIn
          ? 'bg-white ring-1 ring-success-300/60 shadow-sm border-l-4 border-l-success-400'
          : isWaitlisted
            ? 'bg-white ring-1 ring-amber-300/60 shadow-sm border-l-4 border-l-warning-400'
            : 'bg-white ring-1 ring-neutral-200/60 shadow-sm',
        'active:scale-[0.98] active:shadow-none',
      )}
      onClick={onViewDetails}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${attendee.profiles?.display_name ?? 'attendee'}`}
    >
      <Avatar
        src={attendee.profiles?.avatar_url ?? undefined}
        name={attendee.profiles?.display_name ?? 'Unknown'}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-neutral-900 truncate">
            {attendee.profiles?.display_name ?? 'Unknown User'}
          </p>
          {hasEmergencyInfo && (
            <AlertTriangle size={12} className="text-warning-500 shrink-0" aria-label="Has safety info" />
          )}
        </div>
        <p className={cn(
          'text-caption font-medium',
          isCheckedIn ? 'text-success-600' : isWaitlisted ? 'text-amber-600' : 'text-neutral-500',
        )}>
          {isCheckedIn
            ? `Checked in ${attendee.checked_in_at ? new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(attendee.checked_in_at)) : ''}`
            : isWaitlisted
              ? 'Waitlisted'
              : 'Registered'}
        </p>
      </div>

      {isCheckedIn ? (
        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-success-500 text-white shadow-sm shadow-success-300/50">
          <Check size={18} strokeWidth={2.5} />
        </span>
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
            name={p.display_name ?? 'Unknown'}
            size="lg"
          />
          <div>
            <p className="font-heading text-lg font-bold text-neutral-900">
              {p.display_name ?? 'Unknown User'}
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
          <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50">
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
          <div className="flex items-start gap-3 p-3 rounded-lg bg-sky-50">
            <Accessibility size={16} className="text-sky-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">Accessibility Needs</p>
              <p className="text-sm text-neutral-900 mt-0.5">{p.accessibility_requirements}</p>
            </div>
          </div>
        )}

        {/* Emergency contact */}
        <div className="p-3 rounded-lg bg-warning-50 border border-warning-200">
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
  const { isAssistLeader, isLoading: roleLoading } = useCollectiveRole(event?.collective_id)
  const isStaff = profile?.role === 'leader' || profile?.role === 'manager' || profile?.role === 'admin'

  const checkIn = useCheckIn()
  const bulkCheckIn = useBulkCheckIn()
  const promote = usePromoteFromWaitlist()


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
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [checkingInUserId, setCheckingInUserId] = useState<string | null>(null)
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null)
  const [selectedAttendee, setSelectedAttendee] = useState<AttendeeWithStatus | null>(null)
  const [activeTab, setActiveTab] = useState<'attendees' | 'contacts'>('attendees')
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  const filteredAttendees = useMemo(() => {
    if (!attendees) return []
    if (!searchQuery.trim()) return attendees
    const q = searchQuery.toLowerCase()
    return attendees.filter((a) =>
      (a.profiles?.display_name ?? '').toLowerCase().includes(q),
    )
  }, [attendees, searchQuery])

  const stats = useMemo(() => {
    if (!attendees) return { registered: 0, checkedIn: 0, waitlisted: 0 }
    return {
      registered: attendees.filter((a) => a.status === 'registered' || a.status === 'attended').length,
      checkedIn: attendees.filter((a) => a.status === 'attended').length,
      waitlisted: attendees.filter((a) => a.status === 'waitlisted').length,
    }
  }, [attendees])

  const handleCheckIn = useCallback(
    (userId: string) => {
      if (!eventId) return
      setCheckingInUserId(userId)
      checkIn.mutate(
        { eventId, userId },
        { onSettled: () => setCheckingInUserId(null) },
      )
    },
    [eventId, checkIn],
  )

  const handleBulkCheckIn = useCallback(() => {
    if (!eventId) return
    bulkCheckIn.mutate(eventId, {
      onSuccess: () => toast.success('All attendees checked in'),
      onError: () => toast.error('Failed to check in attendees'),
    })
    setShowBulkConfirm(false)
  }, [eventId, bulkCheckIn, toast])

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
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<Hash size={16} />}
            onClick={() => setShowQr(true)}
            className="flex-1 ring-1 ring-primary-200/60 text-xs whitespace-nowrap px-2"
          >
            Show Code
          </Button>
          <Button
            variant="primary"
            icon={<CheckCheck size={16} />}
            onClick={() => setShowBulkConfirm(true)}
            className="flex-1 shadow-md shadow-success-300/30 text-xs whitespace-nowrap px-2"
            disabled={stats.checkedIn === stats.registered}
          >
            Mark All Present
          </Button>
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
            {formatEventDate(event.date_start)}
          </p>
        </motion.div>

        {/* Check-in code banner */}
        {event.check_in_code && (
          <motion.div variants={fadeUp} className="mb-5 rounded-xl bg-white border border-neutral-100 p-4 text-center shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-primary-600 font-semibold mb-1">Today's check-in code</p>
            <p className="text-4xl font-heading font-bold text-primary-700 tracking-[0.3em]">
              {event.check_in_code}
            </p>
          </motion.div>
        )}

        {/* Stats row */}
        <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/15 mx-auto mb-1.5">
              <ClipboardList size={16} className="text-sky-600" />
            </div>
            <p className="text-xl font-bold text-sky-700">{stats.registered}</p>
            <p className="text-caption font-medium text-sky-600">Registered</p>
          </div>
          <div className="rounded-xl bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success-500/15 mx-auto mb-1.5">
              <UserCheck size={16} className="text-success-600" />
            </div>
            <p className="text-xl font-bold text-success-700">{stats.checkedIn}</p>
            <p className="text-caption font-medium text-success-600">Checked In</p>
          </div>
          <div className="rounded-xl bg-white border border-neutral-100 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/15 mx-auto mb-1.5">
              <Clock size={16} className="text-amber-600" />
            </div>
            <p className="text-xl font-bold text-amber-700">{stats.waitlisted}</p>
            <p className="text-caption font-medium text-amber-600">Waitlisted</p>
          </div>
        </motion.div>

        {/* Live count bar */}
        {stats.registered > 0 && (
          <motion.div variants={fadeUp} className="mb-5 rounded-xl bg-white ring-1 ring-primary-100 p-3 shadow-sm">
            <div className="flex items-center justify-between text-caption mb-2">
              <span className="text-neutral-500 font-medium flex items-center gap-1.5">
                <Sparkles size={13} className="text-success-500" />
                Check-in progress
              </span>
              <span className="font-bold text-neutral-900">
                {stats.checkedIn}/{stats.registered}
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-success-400 to-success-500"
                initial={{ width: 0 }}
                animate={{ width: `${stats.registered > 0 ? (stats.checkedIn / stats.registered) * 100 : 0}%` }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            {stats.checkedIn === stats.registered && stats.registered > 0 && (
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
            {/* Search */}
            <motion.div variants={fadeUp} className="mb-3">
              <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search attendees..." compact />
            </motion.div>

            {/* Attendee list */}
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
                    onPromote={attendee.status === 'waitlisted' ? () => handlePromote(attendee.user_id) : undefined}
                    onViewDetails={() => setSelectedAttendee(attendee)}
                    isPending={checkingInUserId === attendee.user_id}
                    isPromoting={promotingUserId === attendee.user_id}
                  />
                ))}
              </div>
            )}
            </motion.div>

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

      {/* QR Code bottom sheet */}
      <BottomSheet
        open={showQr}
        onClose={() => setShowQr(false)}
        snapPoints={[0.6]}
      >
        <CheckInCodeDisplay checkInCode={event.check_in_code} title={event.title} />
      </BottomSheet>

      {/* Bulk check-in confirmation */}
      <ConfirmationSheet
        open={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkCheckIn}
        title="Mark All Present?"
        description={`This will check in ${stats.registered - stats.checkedIn} remaining registered attendees.`}
        confirmLabel="Mark All Present"
        variant="warning"
      />

      {/* Attendee safety details */}
      <AttendeeSafetySheet
        attendee={selectedAttendee}
        open={!!selectedAttendee}
        onClose={() => setSelectedAttendee(null)}
      />

      {/* Profile modal */}
      <ProfileModal userId={profileUserId} open={!!profileUserId} onClose={() => setProfileUserId(null)} />
    </Page>
  )
}
