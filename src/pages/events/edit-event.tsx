import { useEffect, useCallback, useState, useRef, startTransition } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Save,
    Lock,
    Pencil,
    Ticket,
    Plus,
    Trash2,
    Send,
} from 'lucide-react'
import {
    useEventDetail,
    useUpdateEvent,
} from '@/hooks/use-events'
import { useEventForm } from '@/hooks/use-event-form'
import {
    useEventTicketTypes,
    useSaveTicketTypes,
    type TicketTypeDraft,
} from '@/hooks/use-event-tickets'
import {
    BasicsFields,
    DateTimeFields,
    LocationFields,
    DetailsFields,
    CoverImageFields,
    ExtrasFields,
} from './components/event-form-fields'
import { useActivityTypeDefaults } from '@/hooks/use-activity-defaults'
import { INITIAL_EXTRAS, type EventExtras } from '@/hooks/use-event-form'
import {
    Page,
    Header,
    Button,
    Input,
    Toggle,
    Dropdown,
    Skeleton,
    EmptyState,
} from '@/components'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'
import { parseLocationPoint } from '@/lib/geo'

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function EditEventPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDayOfMode = searchParams.get('mode') === 'day-of'
  const shouldReduceMotion = useReducedMotion()

  const { data: event, isLoading } = useEventDetail(eventId)
  const showLoading = useDelayedLoading(isLoading)
  const updateEvent = useUpdateEvent()
  const { data: activityDefaults } = useActivityTypeDefaults()

  const form = useEventForm({ mode: 'edit' })

  // Ticket state
  const { data: existingTicketTypes } = useEventTicketTypes(eventId)
  const saveTickets = useSaveTicketTypes()
  const [isTicketed, setIsTicketed] = useState(false)
  const [ticketTiers, setTicketTiers] = useState<TicketTypeDraft[]>([])
  const [removedTierIds, setRemovedTierIds] = useState<string[]>([])
  const [checkinWindowMinutes, setCheckinWindowMinutes] = useState(30)
  const ticketsInitialised = useRef(false)

  // Pre-populate from event data
  useEffect(() => {
    if (!event) return
    const pos = parseLocationPoint(event.location_point)
    startTransition(() => {
      form.resetFields({
        title: event.title,
        activity_type: event.activity_type,
        description: event.description ?? '',
        date_start: new Date(event.date_start),
        date_end: event.date_end ? new Date(event.date_end) : null,
        address: event.address ?? '',
        location_lat: pos?.lat ?? null,
        location_lng: pos?.lng ?? null,
        capacity: event.capacity ? String(event.capacity) : '',
        cover_image_url: event.cover_image_url ?? '',
        cover_image_position_x: (event as { cover_image_position_x?: number | null }).cover_image_position_x ?? 50,
        cover_image_position_y: (event as { cover_image_position_y?: number | null }).cover_image_position_y ?? 50,
        is_public: event.is_public ?? true,
        is_external_collaboration: event.is_external_collaboration ?? false,
        external_registration_url: event.external_registration_url ?? '',
        // Floating local time (Tate 2026-05-25): event tz is unused. The
        // wall-clock is the wall-clock for every viewer. These fields stay
        // in the form shape for source-compat but never round-trip.
        timezone: 'UTC',
        timezone_overrides_collective: false,
        extras: {
          ...INITIAL_EXTRAS,
          ...((event as unknown as { event_extras?: Partial<EventExtras> | null }).event_extras ?? {}),
        },
      })
      setIsTicketed(event.is_ticketed ?? false)
      setCheckinWindowMinutes((event as unknown as Record<string, unknown>).checkin_window_minutes as number ?? 30)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  // Pre-populate ticket tiers from existing data (once loaded)
  useEffect(() => {
    if (!existingTicketTypes || ticketsInitialised.current) return
    ticketsInitialised.current = true
    setTicketTiers(
      existingTicketTypes.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? '',
        price_dollars: (t.price_cents / 100).toFixed(2).replace(/\.00$/, ''),
        capacity: t.capacity != null ? String(t.capacity) : '',
        is_active: t.is_active,
        _persisted: true,
      })),
    )
  }, [existingTicketTypes])

  const handleSave = useCallback(async () => {
    if (!eventId) return

    const locationPoint = form.buildLocationPoint()

    if (isDayOfMode) {
      // Day-of mode: only update time and address
      if (!form.fields.date_start) return
      await updateEvent.mutateAsync({
        eventId,
        date_start: form.fields.date_start.toISOString(),
        date_end: form.fields.date_end?.toISOString() ?? null,
        address: form.fields.address || null,
        location_point: locationPoint,
      })
    } else {
      if (!form.isBasicsValid || !form.isDateValid) return
      // If the admin cleared the cover image (or never set one), fall back
      // to the per-activity default so the event isn't naked.
      const fallback = !form.fields.cover_image_url && form.fields.activity_type
        ? activityDefaults?.[form.fields.activity_type]
        : null
      const resolvedCover = form.fields.cover_image_url || fallback?.cover_image_url || null
      const resolvedPosX = form.fields.cover_image_url
        ? form.fields.cover_image_position_x
        : fallback?.cover_image_position_x ?? form.fields.cover_image_position_x
      const resolvedPosY = form.fields.cover_image_url
        ? form.fields.cover_image_position_y
        : fallback?.cover_image_position_y ?? form.fields.cover_image_position_y
      await updateEvent.mutateAsync({
        eventId,
        title: form.fields.title,
        description: form.fields.description || null,
        activity_type: form.fields.activity_type as Exclude<typeof form.fields.activity_type, ''>,
        date_start: form.fields.date_start!.toISOString(),
        date_end: form.fields.date_end?.toISOString() ?? null,
        address: form.fields.address || null,
        location_point: locationPoint,
        capacity: form.parsedCapacity(),
        cover_image_url: resolvedCover,
        cover_image_position_x: resolvedPosX,
        cover_image_position_y: resolvedPosY,
        is_public: form.fields.is_public,
        is_external_collaboration: form.fields.is_external_collaboration,
        external_registration_url: form.fields.external_registration_url || null,
        checkin_window_minutes: checkinWindowMinutes,
        // Floating local time: tz column kept on table but always NULL.
        timezone: null,
        event_extras: form.fields.extras,
      } as Parameters<typeof updateEvent.mutateAsync>[0])

      // Save ticket types
      await saveTickets.mutateAsync({
        eventId,
        tiers: isTicketed ? ticketTiers : [],
        removedIds: removedTierIds,
        isTicketed,
      })
    }

    navigate(`/events/${eventId}`, { replace: true })
  }, [eventId, isDayOfMode, form, updateEvent, saveTickets, isTicketed, ticketTiers, removedTierIds, checkinWindowMinutes, activityDefaults, navigate])

  // Publish a draft event - saves all fields + flips status to published (fork_mp0so5k9_0d2e77)
  const handlePublish = useCallback(async () => {
    if (!eventId || !form.isBasicsValid || !form.isDateValid) return

    const locationPoint = form.buildLocationPoint()

    await updateEvent.mutateAsync({
      eventId,
      title: form.fields.title,
      description: form.fields.description || null,
      activity_type: form.fields.activity_type as Exclude<typeof form.fields.activity_type, ''>,
      date_start: form.fields.date_start!.toISOString(),
      date_end: form.fields.date_end?.toISOString() ?? null,
      address: form.fields.address || null,
      location_point: locationPoint,
      capacity: form.parsedCapacity(),
      cover_image_url: form.fields.cover_image_url || null,
      cover_image_position_x: form.fields.cover_image_position_x,
      cover_image_position_y: form.fields.cover_image_position_y,
      is_public: form.fields.is_public,
      is_external_collaboration: form.fields.is_external_collaboration,
      external_registration_url: form.fields.external_registration_url || null,
      checkin_window_minutes: checkinWindowMinutes,
      timezone: form.fields.timezone_overrides_collective ? form.fields.timezone : null,
      status: 'published',
    })

    await saveTickets.mutateAsync({
      eventId,
      tiers: isTicketed ? ticketTiers : [],
      removedIds: removedTierIds,
      isTicketed,
    })

    navigate(`/events/${eventId}`, { replace: true })
  }, [eventId, form, updateEvent, saveTickets, isTicketed, ticketTiers, removedTierIds, checkinWindowMinutes, activityDefaults, navigate])

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const pageTitle = isDayOfMode ? 'Edit Time & Location' : 'Edit Event'

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title={pageTitle} back />}>
        <div className="pt-4 space-y-4">
          <Skeleton variant="title" />
          <Skeleton variant="text" count={3} />
          <Skeleton variant="card" />
        </div>
      </Page>
    )
  }
  if (!event) {
    return (
      <Page swipeBack header={<Header title={pageTitle} back />}>
        <EmptyState
          illustration="error"
          title="Event not found"
          description="This event may have been removed."
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  const canSave = isDayOfMode
    ? form.fields.date_start !== null
    : form.isBasicsValid && form.isDateValid

  return (
    <Page
      swipeBack
      header={<Header title={pageTitle} back />}
      footer={
        !isDayOfMode && event?.status === 'draft' ? (
          <div className="flex gap-3 w-full">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              icon={<Save size={18} />}
              loading={updateEvent.isPending || saveTickets.isPending}
              disabled={!canSave}
              onClick={handleSave}
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              icon={<Send size={18} />}
              loading={updateEvent.isPending || saveTickets.isPending}
              disabled={!canSave}
              onClick={handlePublish}
            >
              Publish
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Save size={18} />}
            loading={updateEvent.isPending || saveTickets.isPending}
            disabled={!canSave}
            onClick={handleSave}
          >
            Save Changes
          </Button>
        )
      }
    >
      <motion.div
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
        className="pt-4 pb-8 space-y-6"
      >
        {/* Basics */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-neutral-50 border-neutral-200 opacity-60 pointer-events-none'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Lock size={13} className="text-neutral-400" />
                <span className="text-neutral-500">Basics</span>
              </>
            ) : (
              <span className="text-neutral-900">Basics</span>
            )}
          </h3>
          <BasicsFields
            fields={form.fields}
            onChange={form.updateFields}
            disabled={isDayOfMode}
          />
        </motion.div>

        {/* Date & Time  editable in day-of mode */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-moss-50 border-moss-300 ring-2 ring-moss-200'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Pencil size={13} className="text-moss-600" />
                <span className="text-moss-700">Date & Time</span>
              </>
            ) : (
              <span className="text-neutral-900">Date & Time</span>
            )}
          </h3>
          <DateTimeFields
            fields={form.fields}
            onChange={form.updateFields}
          />
        </motion.div>

        {/* Location  editable in day-of mode */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-moss-50 border-moss-300 ring-2 ring-moss-200'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Pencil size={13} className="text-moss-600" />
                <span className="text-moss-700">Location</span>
              </>
            ) : (
              <span className="text-neutral-900">Location</span>
            )}
          </h3>
          <LocationFields
            fields={form.fields}
            onChange={form.updateFields}
          />
        </motion.div>

        {/* Details */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-neutral-50 border-neutral-200 opacity-60 pointer-events-none'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Lock size={13} className="text-neutral-400" />
                <span className="text-neutral-500">Details</span>
              </>
            ) : (
              <span className="text-neutral-900">Details</span>
            )}
          </h3>
          <DetailsFields
            fields={form.fields}
            onChange={form.updateFields}
            disabled={isDayOfMode}
          />
          {!isDayOfMode && (
            <Dropdown
              label="When should check-in open?"
              value={String(checkinWindowMinutes)}
              onChange={(v) => setCheckinWindowMinutes(parseInt(v, 10))}
              options={[
                { value: '0', label: 'At event start time' },
                { value: '30', label: '30 minutes before (default)' },
              ]}
            />
          )}
        </motion.div>

        {/* Extras - meeting point / what to bring / accessibility / partner */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-neutral-50 border-neutral-200 opacity-60 pointer-events-none'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Lock size={13} className="text-neutral-400" />
                <span className="text-neutral-500">Preparation & Access</span>
              </>
            ) : (
              <span className="text-neutral-900">Preparation & Access</span>
            )}
          </h3>
          <ExtrasFields
            extras={form.fields.extras}
            onChange={form.updateExtras}
            disabled={isDayOfMode}
          />
        </motion.div>

        {/* Cover Image */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-3 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-neutral-50 border-neutral-200 opacity-60 pointer-events-none'
            : 'bg-white border-neutral-100',
        )}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {isDayOfMode ? (
              <>
                <Lock size={13} className="text-neutral-400" />
                <span className="text-neutral-500">Cover Image</span>
              </>
            ) : (
              <span className="text-neutral-900">Cover Image</span>
            )}
          </h3>
          <CoverImageFields
            coverImageUrl={form.fields.cover_image_url}
            onUpload={form.handleUploadFromGallery}
            onRemove={form.removeCoverImage}
            uploading={form.uploading}
            cameraLoading={form.cameraLoading}
            uploadProgress={form.uploadProgress}
            uploadError={form.uploadError}
            disabled={isDayOfMode}
            positionX={form.fields.cover_image_position_x}
            positionY={form.fields.cover_image_position_y}
            onPositionChange={form.setCoverImagePosition}
          />
        </motion.div>

        {/* Ticketing */}
        <motion.div variants={fadeUp} className={cn(
          'space-y-4 rounded-2xl p-4 border',
          isDayOfMode
            ? 'bg-neutral-50 border-neutral-200 opacity-60 pointer-events-none'
            : 'bg-white border-neutral-100',
        )}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              {isDayOfMode ? (
                <>
                  <Lock size={13} className="text-neutral-400" />
                  <span className="text-neutral-500">Ticketing</span>
                </>
              ) : (
                <>
                  <Ticket size={13} className="text-primary-600" />
                  <span className="text-neutral-900">Ticketing</span>
                </>
              )}
            </h3>
            {!isDayOfMode && (
              <Toggle
                checked={isTicketed}
                onChange={(checked) => {
                  setIsTicketed(checked)
                  if (checked && ticketTiers.length === 0) {
                    setTicketTiers([{
                      id: crypto.randomUUID(),
                      name: 'General Admission',
                      description: '',
                      price_dollars: '',
                      capacity: '',
                      is_active: true,
                    }])
                  }
                }}
              />
            )}
          </div>

          {!isTicketed && (
            <p className="text-xs text-neutral-400">Free event - no tickets required</p>
          )}

          {isTicketed && !isDayOfMode && (
            <>
              <p className="text-xs text-neutral-400">
                Add ticket tiers with prices and optional capacity limits.
              </p>

              <div className="space-y-3">
                {ticketTiers.map((tier, idx) => (
                  <motion.div
                    key={tier.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="rounded-xl bg-surface-1 border border-neutral-100 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 text-amber-600 text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <Input
                        value={tier.name}
                        onChange={(e) =>
                          setTicketTiers((prev) =>
                            prev.map((t) => (t.id === tier.id ? { ...t, name: e.target.value } : t)),
                          )
                        }
                        placeholder="Tier name (e.g. Early Bird)"
                        compact
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tier._persisted) setRemovedTierIds((prev) => [...prev, tier.id])
                          setTicketTiers((prev) => prev.filter((t) => t.id !== tier.id))
                        }}
                        className="flex items-center justify-center min-w-9 min-h-9 rounded-lg text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer"
                        aria-label="Remove tier"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <Input
                      value={tier.description}
                      onChange={(e) =>
                        setTicketTiers((prev) =>
                          prev.map((t) => (t.id === tier.id ? { ...t, description: e.target.value } : t)),
                        )
                      }
                      placeholder="Description (optional)"
                      compact
                    />

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-neutral-400 mb-0.5 block">Price (AUD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-300">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={tier.price_dollars}
                            onChange={(e) =>
                              setTicketTiers((prev) =>
                                prev.map((t) => (t.id === tier.id ? { ...t, price_dollars: e.target.value } : t)),
                              )
                            }
                            placeholder="0.00"
                            className="w-full h-10 pl-7 pr-3 rounded-lg bg-surface-3 text-[16px] text-neutral-900 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-400"
                          />
                        </div>
                      </div>
                      <div className="w-28">
                        <label className="text-[11px] font-medium text-neutral-400 mb-0.5 block">Capacity</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={tier.capacity}
                          onChange={(e) =>
                            setTicketTiers((prev) =>
                              prev.map((t) => (t.id === tier.id ? { ...t, capacity: e.target.value } : t)),
                            )
                          }
                          placeholder="∞"
                          className="w-full h-10 px-3 rounded-lg bg-surface-3 text-[16px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() =>
                  setTicketTiers((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      name: '',
                      description: '',
                      price_dollars: '',
                      capacity: '',
                      is_active: true,
                    },
                  ])
                }
                className="w-full"
              >
                Add another tier
              </Button>

              <div className="px-3 py-2 rounded-lg bg-amber-50/60 text-amber-700 text-xs">
                Attendees pay via Stripe. Revenue and sales are visible in the admin dashboard.
              </div>
            </>
          )}
        </motion.div>

        {/* External Collaboration */}
        {!isDayOfMode && (
          <motion.div variants={fadeUp} className="space-y-4 rounded-2xl p-4 border bg-white border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">External Collaboration</h3>
            <Toggle
              label="External Collaboration"
              description="This event is managed by an external partner or organisation"
              checked={form.fields.is_external_collaboration}
              onChange={(v) => form.updateFields({
                is_external_collaboration: v,
                ...(!v && { external_registration_url: '' }),
              })}
            />
            {form.fields.is_external_collaboration && (
              <Input
                label="External Registration URL"
                placeholder="https://partner-org.com/register"
                value={form.fields.external_registration_url}
                onChange={(e) => form.updateFields({ external_registration_url: e.target.value })}
              />
            )}
          </motion.div>
        )}
      </motion.div>
    </Page>
  )
}
