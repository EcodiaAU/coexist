import {
  Image,
  Camera,
  X,
  Loader2,
  AlertCircle,
  MapPin,
  Check,
} from 'lucide-react'
import { ACTIVITY_TYPE_OPTIONS } from '@/hooks/use-events'
import type { EventFormFields, ActivityType, EventExtras } from '@/hooks/use-event-form'
import { useLocationSync } from '@/hooks/use-location-sync'
import {
  Input,
  Dropdown,
  DatePicker,
  Toggle,
  Button,
  MapView,
  UploadProgress,
} from '@/components'
import type { MapCenter } from '@/components'
import { PlaceAutocomplete } from '@/components/place-autocomplete'
import type { PlaceResult } from '@/components/place-autocomplete'
import { CoverImageFocalPointPicker } from '@/components/cover-image-focal-point-picker'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Props shared by all field components                               */
/* ------------------------------------------------------------------ */

interface FieldProps {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
  disabled?: boolean
}

/* ------------------------------------------------------------------ */
/*  Basics: title, activity type, description                          */
/* ------------------------------------------------------------------ */

export function BasicsFields({ fields, onChange, disabled }: FieldProps) {
  return (
    <>
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#0" data-eos-v="2"
        label="Event Title"
        placeholder="e.g. Byron Bay Dune Planting Day"
        value={fields.title}
        onChange={(e) => onChange({ title: e.target.value })}
        required
        disabled={disabled}
      />
      <Dropdown data-eos-id="src/pages/events/components/event-form-fields.tsx#1"
        label="Activity Type"
        placeholder="Select activity type"
        value={fields.activity_type || undefined}
        onChange={(v) => onChange({ activity_type: v as ActivityType })}
        options={ACTIVITY_TYPE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        disabled={disabled}
      />
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#2"
        type="textarea"
        label="Description"
        placeholder="Tell people what this event is about..."
        value={fields.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={4}
        disabled={disabled}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Date & Time: start + end pickers                                   */
/* ------------------------------------------------------------------ */

interface DateTimeFieldsProps extends FieldProps {
  /** Disallow dates before this (create mode uses `new Date()`) */
  minStart?: Date
}

export function DateTimeFields({
  fields,
  onChange,
  minStart,
}: DateTimeFieldsProps) {
  // Floating-local time (Tate 2026-05-25 + 2026-05-26): events have no
  // timezone. Whatever wall-clock Jess types is exactly what every
  // viewer sees, regardless of device tz. DatePicker is UTC-locked
  // internally - we just hand it Date objects whose UTC value encodes
  // the wall-clock (created via wallClockToUtcIso / wallClockNow from
  // @/lib/date-format).
  return (
    <>
      <DatePicker data-eos-id="src/pages/events/components/event-form-fields.tsx#3"
        label="Start Date & Time"
        value={fields.date_start}
        onChange={(d) => onChange({ date_start: d })}
        mode="datetime"
        min={minStart}
      />
      <DatePicker data-eos-id="src/pages/events/components/event-form-fields.tsx#4"
        label="End Date & Time"
        value={fields.date_end}
        onChange={(d) => onChange({ date_end: d })}
        mode="datetime"
        min={fields.date_start ?? minStart}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Location: address + map                                            */
/* ------------------------------------------------------------------ */

export function LocationFields({ fields, onChange }: FieldProps) {
  const sync = useLocationSync({
    address: fields.address,
    lat: fields.location_lat,
    lng: fields.location_lng,
    onChange: (updates) => {
      const partial: Partial<EventFormFields> = {}
      if (updates.address !== undefined) partial.address = updates.address
      if (updates.lat !== undefined) partial.location_lat = updates.lat
      if (updates.lng !== undefined) partial.location_lng = updates.lng
      onChange(partial)
    },
  })

  const handlePlaceSelect = (_value: string, place: PlaceResult | null) => {
    if (place) {
      sync.onAddressSelected(place.short_name, { lat: place.lat, lng: place.lng })
    } else {
      onChange({ address: _value })
      sync.onAddressTyped(_value)
    }
  }

  return (
    <>
      <PlaceAutocomplete data-eos-id="src/pages/events/components/event-form-fields.tsx#5"
        label="Address"
        placeholder="Search for an address..."
        value={fields.address}
        onChange={handlePlaceSelect}
      />

      <LocationSyncStatusBar data-eos-id="src/pages/events/components/event-form-fields.tsx#6"
        status={sync.status}
        addressIsBlank={fields.address.trim().length === 0}
      />

      <MapView data-eos-id="src/pages/events/components/event-form-fields.tsx#7"
        center={
          fields.location_lat != null && fields.location_lng != null
            ? { lat: fields.location_lat, lng: fields.location_lng }
            : { lat: -25.0, lng: 134.0 }
        }
        zoom={fields.location_lat != null && fields.location_lng != null ? 17 : 4}
        draggable
        onDragEnd={(pos: MapCenter) => sync.onPinDragged(pos)}
        aria-label="Drag the pin to set event location"
        className="aspect-[16/10] rounded-sm shadow-sm"
      />

      <PendingReverseAddressPrompt data-eos-id="src/pages/events/components/event-form-fields.tsx#8"
        pending={sync.pendingReverseAddress}
        onAccept={sync.acceptPendingReverse}
        onDismiss={sync.dismissPendingReverse}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Live-sync status hint shown beneath the address field             */
/* ------------------------------------------------------------------ */

function LocationSyncStatusBar({
  status,
  addressIsBlank,
}: {
  status: 'idle' | 'searching' | 'no-result' | 'synced'
  addressIsBlank: boolean
}) {
  if (addressIsBlank && status === 'idle') return null
  if (status === 'idle') return null

  if (status === 'searching') {
    return (
      <p data-eos-id="src/pages/events/components/event-form-fields.tsx#9" className="-mt-2 text-xs text-neutral-500 flex items-center gap-1.5">
        <Loader2 data-eos-id="src/pages/events/components/event-form-fields.tsx#10" size={12} className="animate-spin shrink-0" />
        Looking up location...
      </p>
    )
  }
  if (status === 'no-result') {
    return (
      <p data-eos-id="src/pages/events/components/event-form-fields.tsx#11" className="-mt-2 text-xs text-bark-600 flex items-center gap-1.5">
        <AlertCircle data-eos-id="src/pages/events/components/event-form-fields.tsx#12" size={12} className="shrink-0" />
        Couldn't find this address - drag the pin to set the exact spot.
      </p>
    )
  }
  // synced
  return (
    <p data-eos-id="src/pages/events/components/event-form-fields.tsx#13" className="-mt-2 text-xs text-moss-600 flex items-center gap-1.5">
      <MapPin data-eos-id="src/pages/events/components/event-form-fields.tsx#14" size={12} className="shrink-0" />
      Pin synced to address.
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Pending reverse-geocode prompt (preserves user-typed venue names)  */
/* ------------------------------------------------------------------ */

function PendingReverseAddressPrompt({
  pending,
  onAccept,
  onDismiss,
}: {
  pending: string | null
  onAccept: () => void
  onDismiss: () => void
}) {
  if (!pending) return null
  return (
    <div data-eos-id="src/pages/events/components/event-form-fields.tsx#15" className="rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex items-start gap-2.5">
      <MapPin data-eos-id="src/pages/events/components/event-form-fields.tsx#16" size={14} className="text-neutral-500 mt-0.5 shrink-0" />
      <div data-eos-id="src/pages/events/components/event-form-fields.tsx#17" className="flex-1 min-w-0">
        <p data-eos-id="src/pages/events/components/event-form-fields.tsx#18" className="text-xs text-neutral-600">
          Pin moved to <span data-eos-id="src/pages/events/components/event-form-fields.tsx#19" className="font-medium text-neutral-800">{pending}</span>
        </p>
        <p data-eos-id="src/pages/events/components/event-form-fields.tsx#20" className="text-[11px] text-neutral-500 mt-0.5">
          Update the address to match? (Your venue name will be replaced.)
        </p>
        <div data-eos-id="src/pages/events/components/event-form-fields.tsx#21" className="flex gap-2 mt-2">
          <button data-eos-id="src/pages/events/components/event-form-fields.tsx#22"
            type="button"
            onClick={onAccept}
            className="text-xs font-medium text-moss-700 hover:text-moss-800 flex items-center gap-1"
          >
            <Check data-eos-id="src/pages/events/components/event-form-fields.tsx#23" size={12} /> Update address
          </button>
          <button data-eos-id="src/pages/events/components/event-form-fields.tsx#24"
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
          >
            Keep my address
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Details: capacity + public toggle                                  */
/* ------------------------------------------------------------------ */

export function DetailsFields({ fields, onChange, disabled }: FieldProps) {
  return (
    <>
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#25"
        label="Capacity"
        placeholder="Max participants (leave empty for unlimited)"
        value={fields.capacity}
        onChange={(e) => onChange({ capacity: e.target.value })}
        disabled={disabled}
      />
      <Toggle data-eos-id="src/pages/events/components/event-form-fields.tsx#26"
        label="Public Event"
        description="Anyone can discover and register for this event"
        checked={fields.is_public}
        onChange={(v) => onChange({ is_public: v })}
        disabled={disabled}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Extras: meeting point / preparation / accessibility / partner      */
/* ------------------------------------------------------------------ */

export function ExtrasFields({
  extras,
  onChange,
  disabled,
}: {
  extras: EventExtras
  onChange: (updates: Partial<EventExtras>) => void
  disabled?: boolean
}) {
  return (
    <div data-eos-id="src/pages/events/components/event-form-fields.tsx#27" className="space-y-4">
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#28"
        label="Meeting Point"
        placeholder="e.g. North end of the carpark, near the rotunda"
        value={extras.meeting_point}
        onChange={(e) => onChange({ meeting_point: e.target.value })}
        disabled={disabled}
      />
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#29"
        type="textarea"
        label="What to bring"
        placeholder="Water, gloves, sturdy shoes..."
        rows={2}
        value={extras.what_to_bring}
        onChange={(e) => onChange({ what_to_bring: e.target.value })}
        disabled={disabled}
      />
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#30"
        type="textarea"
        label="What to wear"
        placeholder="Long sleeves, sun hat, closed-toe shoes..."
        rows={2}
        value={extras.what_to_wear}
        onChange={(e) => onChange({ what_to_wear: e.target.value })}
        disabled={disabled}
      />
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#31"
        label="Terrain"
        placeholder="e.g. uneven coastal track with steep sections"
        value={extras.terrain}
        onChange={(e) => onChange({ terrain: e.target.value })}
        disabled={disabled}
      />
      <Dropdown data-eos-id="src/pages/events/components/event-form-fields.tsx#32"
        label="Difficulty"
        value={extras.difficulty}
        onChange={(v) => onChange({ difficulty: v as EventExtras['difficulty'] })}
        options={[
          { value: 'easy', label: 'Easy' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'challenging', label: 'Challenging' },
        ]}
        disabled={disabled}
      />
      <Toggle data-eos-id="src/pages/events/components/event-form-fields.tsx#33"
        label="Wheelchair accessible"
        description="The venue and route are wheelchair accessible"
        checked={extras.wheelchair_access}
        onChange={(v) => onChange({ wheelchair_access: v })}
        disabled={disabled}
      />
      <Input data-eos-id="src/pages/events/components/event-form-fields.tsx#34"
        label="Partner organisation"
        placeholder="e.g. Landcare NSW (leave blank if none)"
        value={extras.partner_name}
        onChange={(e) => onChange({ partner_name: e.target.value })}
        disabled={disabled}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cover Image (edit-style: simple preview + upload button)           */
/* ------------------------------------------------------------------ */

interface CoverImageFieldsProps {
  coverImageUrl: string
  onUpload: () => void
  onRemove: () => void
  uploading: boolean
  cameraLoading: boolean
  uploadProgress: number | null
  uploadError: string | null
  disabled?: boolean
  /** Focal point x percent (0-100). Defaults to 50. */
  positionX?: number
  /** Focal point y percent (0-100). Defaults to 50. */
  positionY?: number
  /** Fired when admin moves the focal point. */
  onPositionChange?: (x: number, y: number) => void
}

export function CoverImageFields({
  coverImageUrl,
  onUpload,
  onRemove,
  uploading,
  cameraLoading,
  uploadProgress,
  uploadError,
  disabled,
  positionX = 50,
  positionY = 50,
  onPositionChange,
}: CoverImageFieldsProps) {
  return (
    <>
      {coverImageUrl ? (
        <div data-eos-id="src/pages/events/components/event-form-fields.tsx#35" className="space-y-3">
          <div data-eos-id="src/pages/events/components/event-form-fields.tsx#36" className="relative rounded-sm overflow-hidden">
            <img data-eos-src="dynamic" data-eos-src-label="Cover image url" data-eos-id="src/pages/events/components/event-form-fields.tsx#37"
              src={coverImageUrl}
              alt="Cover preview"
              className="w-full object-cover"
              style={{
                aspectRatio: '16/9',
                ...coverImagePositionStyle(positionX, positionY),
              }}
            />
            {!disabled && (
              <button data-eos-id="src/pages/events/components/event-form-fields.tsx#38"
                type="button"
                onClick={onRemove}
                className="absolute top-2 right-2 min-w-11 min-h-11 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
                aria-label="Remove cover image"
              >
                <X data-eos-id="src/pages/events/components/event-form-fields.tsx#39" size={16} />
              </button>
            )}
          </div>
          {onPositionChange && (
            <CoverImageFocalPointPicker data-eos-id="src/pages/events/components/event-form-fields.tsx#40"
              imageUrl={coverImageUrl}
              x={positionX}
              y={positionY}
              onChange={onPositionChange}
              disabled={disabled}
            />
          )}
        </div>
      ) : (
        <button data-eos-id="src/pages/events/components/event-form-fields.tsx#41"
          type="button"
          onClick={onUpload}
          disabled={disabled || cameraLoading || uploading}
          className={cn(
            'w-full min-h-11 py-12 rounded-sm border-2 border-dashed border-primary-200 hover:border-primary-400',
            'cursor-pointer select-none',
            'active:scale-[0.97] transition-transform duration-150',
            'flex flex-col items-center justify-center',
            'text-neutral-500 hover:text-neutral-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Upload cover image"
        >
          <Image data-eos-id="src/pages/events/components/event-form-fields.tsx#42" size={32} />
          <p data-eos-id="src/pages/events/components/event-form-fields.tsx#43" className="text-sm font-medium mt-2">Tap to upload a cover photo</p>
        </button>
      )}
      {!disabled && (
        <>
          <UploadProgress data-eos-id="src/pages/events/components/event-form-fields.tsx#44"
            progress={uploadProgress}
            uploading={uploading}
            error={uploadError}
            variant="bar"
          />
          {!coverImageUrl && (
            <Button data-eos-id="src/pages/events/components/event-form-fields.tsx#45"
              variant="secondary"
              size="sm"
              icon={<Camera data-eos-id="src/pages/events/components/event-form-fields.tsx#46" size={14} />}
              onClick={onUpload}
              disabled={cameraLoading || uploading}
            >
              Choose Photo
            </Button>
          )}
        </>
      )}
    </>
  )
}
