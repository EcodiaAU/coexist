import { useState, useEffect, useMemo, startTransition } from 'react'
import { Megaphone, CalendarPlus, ChevronDown, Users2, Check, MapPin, Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { Avatar } from '@/components/avatar'
import { cn } from '@/lib/cn'
import { useCollectiveEvents, type EventWithCollective } from '@/hooks/use-events'
import { useCollectives } from '@/hooks/use-collective'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CreateAnnouncementSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    type: 'announcement' | 'event_invite' | 'rsvp'
    title: string
    body?: string
    metadata?: Record<string, unknown>
  }) => void
  /** Called when user wants to invite collectives to collaborate on an event */
  onInviteCollectives?: (data: {
    eventId: string
    collectiveIds: string[]
    message?: string
  }) => void
  loading?: boolean
  /** Pre-select the type (e.g. 'event_invite' when opened from that button) */
  defaultType?: 'announcement' | 'event_invite' | 'rsvp'
  /** The current collective's ID - needed to fetch its events */
  collectiveId?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Floating-local: event date_start is wall-clock-as-UTC. Pin UTC so the
// host's wall-clock comes back verbatim instead of being shifted by the
// viewer's device offset.
function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function formatEventTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/* ------------------------------------------------------------------ */
/*  Event Picker Dropdown                                              */
/* ------------------------------------------------------------------ */

function EventPicker({
  events,
  selectedId,
  onSelect,
  isLoading,
}: {
  events: EventWithCollective[]
  selectedId: string
  onSelect: (id: string) => void
  isLoading: boolean
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const selected = events.find((e) => e.id === selectedId)

  return (
    <div data-eos-id="src/components/create-announcement-sheet.tsx#0" className="relative">
      <button data-eos-id="src/components/create-announcement-sheet.tsx#1"
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={cn(
          'w-full rounded-sm px-3.5 py-2.5 text-left text-sm min-h-11 flex items-center gap-2 transition-transform duration-150',
          'active:scale-[0.99] cursor-pointer select-none',
          selectedId
            ? 'bg-primary-50 text-primary-800 ring-2 ring-primary-400'
            : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200',
          dropdownOpen && 'ring-2 ring-primary-400 bg-white',
        )}
      >
        <Calendar data-eos-id="src/components/create-announcement-sheet.tsx#2" size={16} className="shrink-0 text-primary-500" />
        <span data-eos-id="src/components/create-announcement-sheet.tsx#3" data-eos-var="selected.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="flex-1 truncate">
          {isLoading
            ? 'Loading events...'
            : selected
              ? selected.title
              : events.length === 0
                ? 'No upcoming events'
                : 'Select an event...'}
        </span>
        <ChevronDown data-eos-id="src/components/create-announcement-sheet.tsx#4"
          size={16}
          className={cn(
            'shrink-0 text-primary-400 transition-transform duration-150',
            dropdownOpen && 'rotate-180',
          )}
        />
      </button>

      {dropdownOpen && events.length > 0 && (
        <div data-eos-id="src/components/create-announcement-sheet.tsx#5" className="absolute z-30 mt-1.5 w-full rounded-sm bg-white shadow-sm ring-1 ring-primary-200/60 max-h-52 overflow-y-auto overscroll-contain">
          {events.map((event) => (
            <button data-eos-id="src/components/create-announcement-sheet.tsx#6"
              key={event.id}
              type="button"
              onClick={() => {
                onSelect(event.id)
                setDropdownOpen(false)
              }}
              className={cn(
                'w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-[colors,transform] duration-100 min-h-11',
                'hover:bg-neutral-50 active:bg-neutral-100 active:scale-[0.98] cursor-pointer select-none',
                event.id === selectedId && 'bg-primary-50',
                'first:rounded-t-sm last:rounded-b-sm',
              )}
            >
              <div data-eos-id="src/components/create-announcement-sheet.tsx#7" className="flex-1 min-w-0">
                <p data-eos-id="src/components/create-announcement-sheet.tsx#8" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">{event.title}</p>
                <div data-eos-id="src/components/create-announcement-sheet.tsx#9" className="flex items-center gap-1.5 mt-0.5">
                  <Calendar data-eos-id="src/components/create-announcement-sheet.tsx#10" size={11} className="text-neutral-400 shrink-0" />
                  <span data-eos-id="src/components/create-announcement-sheet.tsx#11" data-eos-var="event.date_start,event.date_start" data-eos-var-label="Date start, Date start" data-eos-var-scope="item" className="text-[11px] text-neutral-500">
                    {formatEventDate(event.date_start)} at {formatEventTime(event.date_start)}
                  </span>
                </div>
                {event.address && (
                  <div data-eos-id="src/components/create-announcement-sheet.tsx#12" className="flex items-center gap-1.5 mt-0.5">
                    <MapPin data-eos-id="src/components/create-announcement-sheet.tsx#13" size={11} className="text-neutral-400 shrink-0" />
                    <span data-eos-id="src/components/create-announcement-sheet.tsx#14" data-eos-var="event.address" data-eos-var-label="Address" data-eos-var-scope="item" className="text-[11px] text-neutral-400 truncate">{event.address}</span>
                  </div>
                )}
              </div>
              {event.id === selectedId && (
                <Check data-eos-id="src/components/create-announcement-sheet.tsx#15" size={16} className="text-primary-600 shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Collective Picker (multi-select for collaboration invites)         */
/* ------------------------------------------------------------------ */

function CollectivePicker({
  currentCollectiveId,
  selectedIds,
  onToggle,
}: {
  currentCollectiveId: string
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const { data: allCollectives = [], isLoading } = useCollectives({ includeNational: true })
  const [search, setSearch] = useState('')

  const otherCollectives = useMemo(
    () => allCollectives.filter((c) => c.id !== currentCollectiveId),
    [allCollectives, currentCollectiveId],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return otherCollectives
    const q = search.toLowerCase()
    return otherCollectives.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.region?.toLowerCase().includes(q) ||
        c.state?.toLowerCase().includes(q),
    )
  }, [otherCollectives, search])

  return (
    <div data-eos-id="src/components/create-announcement-sheet.tsx#16">
      {/* Search */}
      <div data-eos-id="src/components/create-announcement-sheet.tsx#17" className="mb-2">
        <SearchBar data-eos-id="src/components/create-announcement-sheet.tsx#18" value={search} onChange={setSearch} placeholder="Search collectives..." compact />
      </div>

      {/* Selected count */}
      {selectedIds.length > 0 && (
        <p data-eos-id="src/components/create-announcement-sheet.tsx#19" className="text-[11px] font-semibold text-primary-600 mb-1.5">
          {selectedIds.length} collective{selectedIds.length !== 1 ? 's' : ''} selected
        </p>
      )}

      {/* List */}
      <div data-eos-id="src/components/create-announcement-sheet.tsx#20" className="max-h-40 overflow-y-auto overscroll-contain rounded-sm ring-1 ring-primary-200/60 bg-white">
        {isLoading ? (
          <div data-eos-id="src/components/create-announcement-sheet.tsx#21" className="px-3.5 py-3 text-xs text-neutral-500">Loading collectives...</div>
        ) : filtered.length === 0 ? (
          <div data-eos-id="src/components/create-announcement-sheet.tsx#22" className="px-3.5 py-3 text-xs text-neutral-500">
            {search ? 'No collectives match your search' : 'No other collectives available'}
          </div>
        ) : (
          filtered.map((collective) => {
            const isSelected = selectedIds.includes(collective.id)
            return (
              <button data-eos-id="src/components/create-announcement-sheet.tsx#23"
                key={collective.id}
                type="button"
                onClick={() => onToggle(collective.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-[colors,transform] duration-100 min-h-11',
                  'hover:bg-neutral-50 active:bg-neutral-100 active:scale-[0.98] cursor-pointer select-none',
                  isSelected && 'bg-primary-50',
                  'first:rounded-t-sm last:rounded-b-sm',
                )}
              >
                <Avatar data-eos-id="src/components/create-announcement-sheet.tsx#24"
                  src={collective.cover_image_url}
                  name={collective.name}
                  size="sm"
                />
                <div data-eos-id="src/components/create-announcement-sheet.tsx#25" className="flex-1 min-w-0">
                  <p data-eos-id="src/components/create-announcement-sheet.tsx#26" data-eos-var="collective.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">{collective.name}</p>
                  {(collective.region || collective.state) && (
                    <p data-eos-id="src/components/create-announcement-sheet.tsx#27" data-eos-var="collective.region" data-eos-var-label="Region" data-eos-var-scope="item" className="text-[11px] text-neutral-400 truncate">
                      {[collective.region, collective.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div data-eos-id="src/components/create-announcement-sheet.tsx#28"
                  className={cn(
                    'flex items-center justify-center h-5 w-5 rounded-md border-2 transition-colors duration-150 shrink-0',
                    isSelected
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-neutral-300 bg-white',
                  )}
                >
                  {isSelected && <Check data-eos-id="src/components/create-announcement-sheet.tsx#29" size={12} className="text-white" />}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Sheet                                                         */
/* ------------------------------------------------------------------ */

export function CreateAnnouncementSheet({
  open,
  onClose,
  onSubmit,
  onInviteCollectives,
  loading,
  defaultType = 'announcement',
  collectiveId,
}: CreateAnnouncementSheetProps) {
  const [type, setType] = useState<'announcement' | 'event_invite' | 'rsvp'>(defaultType)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [eventId, setEventId] = useState('')
  const [inviteCollectiveIds, setInviteCollectiveIds] = useState<string[]>([])
  const [inviteMessage, setInviteMessage] = useState('')

  // Fetch upcoming events for this collective
  const { data: upcomingEvents = [], isLoading: eventsLoading } = useCollectiveEvents(
    open && type === 'event_invite' ? collectiveId : undefined,
  )

  // Reset form when opened with new defaultType
  useEffect(() => {
    if (open) {
      startTransition(() => {
        setType(defaultType)
        setTitle('')
        setBody('')
        setEventId('')
        setInviteCollectiveIds([])
        setInviteMessage('')
      })
    }
  }, [open, defaultType])

  // Auto-fill title when event is selected
  useEffect(() => {
    if (eventId && type === 'event_invite') {
      const event = upcomingEvents.find((e) => e.id === eventId)
      if (event && !title) {
        startTransition(() => setTitle(`Join us: ${event.title}`))
      }
    }
  }, [eventId, type, upcomingEvents, title])

  const canSubmit = title.trim().length > 0 && (type !== 'event_invite' || eventId)

  const handleToggleCollective = (id: string) => {
    setInviteCollectiveIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSubmit = () => {
    if (!canSubmit) return

    // Post the announcement/invite to chat
    onSubmit({
      type,
      title: title.trim(),
      body: body.trim() || undefined,
      metadata: type === 'event_invite' && eventId ? { event_id: eventId } : undefined,
    })

    // If collectives were selected for collaboration, fire that too
    if (type === 'event_invite' && eventId && inviteCollectiveIds.length > 0 && onInviteCollectives) {
      onInviteCollectives({
        eventId,
        collectiveIds: inviteCollectiveIds,
        message: inviteMessage.trim() || undefined,
      })
    }

    // Clear form after a short delay to let the parent mutation fire
    // (if the sheet closes on success, the form resets on next open)
    onClose()
  }

  // Reset form fields when the sheet closes (re-opens fresh)
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setTitle('')
        setBody('')
        setEventId('')
        setInviteCollectiveIds([])
        setInviteMessage('')
      }, 300) // wait for close animation
      return () => clearTimeout(timer)
    }
  }, [open])

  // "Event Invite" already renders RSVP buttons inline (see chat-bubble.tsx),
  // so the standalone "RSVP Request" option was a duplicate path. Keep
  // historical rsvp rows rendering correctly, but stop creating new ones.
  const typeOptions = [
    { value: 'announcement' as const, label: 'Announcement', icon: Megaphone, desc: 'Share news with your collective' },
    { value: 'event_invite' as const, label: 'Event Invite', icon: CalendarPlus, desc: 'Invite members to an event (with RSVP)' },
  ]

  return (
    <BottomSheet data-eos-id="src/components/create-announcement-sheet.tsx#30" open={open} onClose={onClose}>
      <div data-eos-id="src/components/create-announcement-sheet.tsx#31" className="pb-4 max-h-[80vh] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div data-eos-id="src/components/create-announcement-sheet.tsx#32" className="flex items-center gap-2.5 mb-4">
          <div data-eos-id="src/components/create-announcement-sheet.tsx#33" className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent-100 text-accent-600">
            <Megaphone data-eos-id="src/components/create-announcement-sheet.tsx#34" size={20} />
          </div>
          <div data-eos-id="src/components/create-announcement-sheet.tsx#35">
            <h3 data-eos-id="src/components/create-announcement-sheet.tsx#36" className="text-base font-bold text-neutral-900">Create Announcement</h3>
            <p data-eos-id="src/components/create-announcement-sheet.tsx#37" className="text-xs text-neutral-500">Share something with your collective</p>
          </div>
        </div>

        {/* Type selector */}
        <div data-eos-id="src/components/create-announcement-sheet.tsx#38" className="mb-4">
          <label data-eos-id="src/components/create-announcement-sheet.tsx#39" className="text-xs font-semibold text-neutral-900 mb-1.5 block">Type</label>
          <div data-eos-id="src/components/create-announcement-sheet.tsx#40" className="flex gap-2">
            {typeOptions.map((opt) => (
              <button data-eos-id="src/components/create-announcement-sheet.tsx#41"
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  'flex-1 rounded-sm py-2.5 px-2 text-center transition-transform duration-150 min-h-11',
                  'active:scale-[0.98] cursor-pointer select-none',
                  type === opt.value
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-primary-50 text-primary-600 ring-1 ring-primary-200/60',
                )}
              >
                <opt.icon data-eos-id="src/components/create-announcement-sheet.tsx#42" size={16} className="mx-auto mb-0.5" />
                <span data-eos-id="src/components/create-announcement-sheet.tsx#43" data-eos-var="opt.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" className="text-[11px] font-semibold block">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Event picker (for event invites) */}
        {type === 'event_invite' && (
          <div data-eos-id="src/components/create-announcement-sheet.tsx#44" className="mb-3">
            <label data-eos-id="src/components/create-announcement-sheet.tsx#45" className="text-xs font-semibold text-neutral-900 mb-1 block">
              Event
            </label>
            <EventPicker data-eos-id="src/components/create-announcement-sheet.tsx#46"
              events={upcomingEvents}
              selectedId={eventId}
              onSelect={setEventId}
              isLoading={eventsLoading}
            />
            {!eventsLoading && upcomingEvents.length === 0 && (
              <p data-eos-id="src/components/create-announcement-sheet.tsx#47" className="text-[11px] text-warning-600 mt-1">
                No upcoming events found. Create an event first, then invite from here.
              </p>
            )}
          </div>
        )}

        {/* Title */}
        <div data-eos-id="src/components/create-announcement-sheet.tsx#48" className="mb-3">
          <Input data-eos-id="src/components/create-announcement-sheet.tsx#49"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'event_invite' ? 'Come join us at...' : 'Your announcement title'}
            maxLength={150}
          />
        </div>

        {/* Body */}
        <div data-eos-id="src/components/create-announcement-sheet.tsx#50" className="mb-3">
          <Input data-eos-id="src/components/create-announcement-sheet.tsx#51"
            type="textarea"
            label="Details"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add more details..."
            rows={3}
            maxLength={500}
          />
        </div>

        {/* Invite other collectives to collaborate (event invites only) */}
        {type === 'event_invite' && eventId && collectiveId && (
          <div data-eos-id="src/components/create-announcement-sheet.tsx#52" className="mb-4">
            <div data-eos-id="src/components/create-announcement-sheet.tsx#53" className="flex items-center gap-2 mb-1.5">
              <Users2 data-eos-id="src/components/create-announcement-sheet.tsx#54" size={14} className="text-primary-500" />
              <label data-eos-id="src/components/create-announcement-sheet.tsx#55" className="text-xs font-semibold text-neutral-900">
                Invite collectives to collaborate (optional)
              </label>
            </div>
            <p data-eos-id="src/components/create-announcement-sheet.tsx#56" className="text-[11px] text-neutral-500 mb-2">
              Invite other collectives to co-host this event. Their leaders will be notified and can accept the collaboration.
            </p>
            <CollectivePicker data-eos-id="src/components/create-announcement-sheet.tsx#57"
              currentCollectiveId={collectiveId}
              selectedIds={inviteCollectiveIds}
              onToggle={handleToggleCollective}
            />

            {/* Collaboration message */}
            {inviteCollectiveIds.length > 0 && (
              <div data-eos-id="src/components/create-announcement-sheet.tsx#58" className="mt-2.5">
                <Input data-eos-id="src/components/create-announcement-sheet.tsx#59"
                  label="Collaboration Message"
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Hey! Want to join forces on this one?"
                  maxLength={300}
                />
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button data-eos-id="src/components/create-announcement-sheet.tsx#60"
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          loading={loading}
        >
          {type === 'event_invite'
            ? inviteCollectiveIds.length > 0
              ? `Post Invite & Invite ${inviteCollectiveIds.length} Collective${inviteCollectiveIds.length !== 1 ? 's' : ''}`
              : 'Post Event Invite'
            : type === 'rsvp'
              ? 'Post RSVP Request'
              : 'Post Announcement'}
        </Button>
      </div>
    </BottomSheet>
  )
}
