import { useState, useEffect, startTransition } from 'react'
import { Car, ChevronDown, Calendar, Clock, MapPin, Check, Minus, Plus, Users } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'
import { useCollectiveEvents, type EventWithCollective } from '@/hooks/use-events'
import { wallClockToUtcIso, wallClockNow } from '@/lib/date-format'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CreateCarpoolSubmitData {
  event_id: string
  departure_point_text: string
  departure_time: string
  seats_total: number
  notes?: string
}

interface CreateCarpoolSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateCarpoolSubmitData) => void
  loading?: boolean
  /** Current collective ID - needed to fetch its upcoming events */
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

// Floating-local: carpool departure_time lives in the same wall-clock-as-UTC
// frame as event times. Build the datetime-local input value from UTC
// components so the typed/defaulted wall-clock is preserved verbatim; submit
// stamps it back as UTC via wallClockToUtcIso. Using local components here was
// the bug that showed "departing 9:30pm for an 8:30am event".
function toWallClockInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/* ------------------------------------------------------------------ */
/*  Event picker (compact, mirrors create-announcement-sheet)          */
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={cn(
          'w-full rounded-xl px-3.5 py-2.5 text-left text-sm min-h-11 flex items-center gap-2 transition-transform duration-150',
          'active:scale-[0.99] cursor-pointer select-none',
          selectedId
            ? 'bg-success-50 text-success-800 ring-2 ring-success-400'
            : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200',
          dropdownOpen && 'ring-2 ring-success-400 bg-white',
        )}
      >
        <Calendar size={16} className="shrink-0 text-success-500" />
        <span className="flex-1 truncate">
          {isLoading
            ? 'Loading events...'
            : selected
              ? selected.title
              : events.length === 0
                ? 'No upcoming events'
                : 'Select an event...'}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-success-400 transition-transform duration-150',
            dropdownOpen && 'rotate-180',
          )}
        />
      </button>

      {dropdownOpen && events.length > 0 && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl bg-white shadow-lg ring-1 ring-success-200/60 max-h-52 overflow-y-auto overscroll-contain">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => {
                onSelect(event.id)
                setDropdownOpen(false)
              }}
              className={cn(
                'w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-[colors,transform] duration-100 min-h-11',
                'hover:bg-neutral-50 active:bg-neutral-100 active:scale-[0.98] cursor-pointer select-none',
                event.id === selectedId && 'bg-success-50',
                'first:rounded-t-xl last:rounded-b-xl',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">{event.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Calendar size={11} className="text-neutral-400 shrink-0" />
                  <span className="text-[11px] text-neutral-500">
                    {formatEventDate(event.date_start)} at {formatEventTime(event.date_start)}
                  </span>
                </div>
                {event.address && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <MapPin size={11} className="text-neutral-400 shrink-0" />
                    <span className="text-[11px] text-neutral-400 truncate">{event.address}</span>
                  </div>
                )}
              </div>
              {event.id === selectedId && (
                <Check size={16} className="text-success-600 shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Seats stepper                                                      */
/* ------------------------------------------------------------------ */

function SeatsStepper({
  value,
  onChange,
  min = 1,
  max = 8,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease seats"
        className={cn(
          'flex items-center justify-center min-h-11 min-w-11 rounded-xl ring-1 ring-neutral-200 bg-white text-neutral-700',
          'active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none',
          'hover:bg-neutral-50',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Minus size={16} />
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <Users size={14} className="text-neutral-400 shrink-0" />
        <span className="text-sm font-bold text-neutral-900 tabular-nums">
          {value} seat{value !== 1 ? 's' : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase seats"
        className={cn(
          'flex items-center justify-center min-h-11 min-w-11 rounded-xl ring-1 ring-neutral-200 bg-white text-neutral-700',
          'active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none',
          'hover:bg-neutral-50',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main sheet                                                         */
/* ------------------------------------------------------------------ */

export function CreateCarpoolSheet({
  open,
  onClose,
  onSubmit,
  loading,
  collectiveId,
}: CreateCarpoolSheetProps) {
  const [eventId, setEventId] = useState('')
  const [departurePoint, setDeparturePoint] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [seatsTotal, setSeatsTotal] = useState(3)
  const [notes, setNotes] = useState('')

  const { data: upcomingEvents = [], isLoading: eventsLoading } = useCollectiveEvents(
    open ? collectiveId : undefined,
  )

  // Reset on open with a sensible default departure time (event start - 1h, or now + 1h)
  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setEventId('')
      setDeparturePoint('')
      // wall-clock now + 1h, rounded to the hour, in the wall-clock frame
      const inOneHour = new Date(wallClockNow().getTime() + 60 * 60 * 1000)
      inOneHour.setUTCMinutes(0, 0, 0)
      setDepartureTime(toWallClockInputValue(inOneHour))
      setSeatsTotal(3)
      setNotes('')
    })
  }, [open])

  // When user picks an event, pre-fill departure_time to 1h before event start
  useEffect(() => {
    if (!eventId) return
    const ev = upcomingEvents.find((e) => e.id === eventId)
    if (!ev?.date_start) return
    // event start is wall-clock-as-UTC; subtract 1h and keep the wall-clock
    const start = new Date(ev.date_start)
    const oneHourBefore = new Date(start.getTime() - 60 * 60 * 1000)
    startTransition(() => setDepartureTime(toWallClockInputValue(oneHourBefore)))
  }, [eventId, upcomingEvents])

  // Reset on close (after exit animation)
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setEventId('')
        setDeparturePoint('')
        setDepartureTime('')
        setSeatsTotal(3)
        setNotes('')
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // Accept either 'T' or space between date and time (the field is free text
  // and the default is pre-filled with a 'T'). Gating submit on this prevents
  // wallClockToUtcIso - which is strict - from throwing on a malformed entry.
  const DEPARTURE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/

  const canSubmit =
    !!eventId &&
    departurePoint.trim().length > 0 &&
    DEPARTURE_RE.test(departureTime.trim()) &&
    seatsTotal >= 1

  const handleSubmit = () => {
    if (!canSubmit) return
    // Floating-local: stamp the typed wall-clock directly as UTC so departure
    // lives in the same frame as event times (stored 8:30 -> 08:30:00.000Z).
    // Normalise a space separator to 'T' so the strict parser accepts it.
    const wallClock = departureTime.trim().replace(' ', 'T')
    onSubmit({
      event_id: eventId,
      departure_point_text: departurePoint.trim(),
      departure_time: wallClockToUtcIso(wallClock),
      seats_total: seatsTotal,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-4 max-h-[80vh] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-100 text-success-600">
            <Car size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">Offer a carpool</h3>
            <p className="text-xs text-neutral-500">Drive other members to an event</p>
          </div>
        </div>

        {/* Event picker */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-neutral-900 mb-1 block">Event</label>
          <EventPicker
            events={upcomingEvents}
            selectedId={eventId}
            onSelect={setEventId}
            isLoading={eventsLoading}
          />
          {!eventsLoading && upcomingEvents.length === 0 && (
            <p className="text-[11px] text-warning-600 mt-1">
              No upcoming events found. Create an event first, then offer carpools.
            </p>
          )}
        </div>

        {/* Departure point */}
        <div className="mb-3">
          <Input
            label="Departure point"
            value={departurePoint}
            onChange={(e) => setDeparturePoint(e.target.value)}
            placeholder="e.g. Sippy Downs Macca's car park"
            maxLength={200}
            icon={<MapPin size={16} className="text-success-500" />}
          />
          <p className="text-[11px] text-neutral-400 mt-1">
            Visible to all collective members.
          </p>
        </div>

        {/* Departure time */}
        <div className="mb-3">
          <Input
            label="Departure time"
            type="text"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            placeholder="YYYY-MM-DDTHH:mm"
            icon={<Clock size={16} className="text-success-500" />}
          />
          <p className="text-[11px] text-neutral-400 mt-1">
            Format: YYYY-MM-DD HH:mm (24h, event local time).
          </p>
        </div>

        {/* Seats stepper */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-neutral-900 mb-1.5 block">
            Seats available
          </label>
          <SeatsStepper value={seatsTotal} onChange={setSeatsTotal} min={1} max={8} />
        </div>

        {/* Notes */}
        <div className="mb-4">
          <Input
            type="textarea"
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. happy to pick up along the way, kid seat available, etc."
            rows={3}
            maxLength={300}
          />
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          loading={loading}
        >
          Post carpool
        </Button>
      </div>
    </BottomSheet>
  )
}
