import {
  Image,
  Camera,
  X,
} from 'lucide-react'
import { ACTIVITY_TYPE_OPTIONS } from '@/hooks/use-events'
import type { EventFormFields, ActivityType } from '@/hooks/use-event-form'
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
      <Input
        label="Event Title"
        placeholder="e.g. Byron Bay Dune Planting Day"
        value={fields.title}
        onChange={(e) => onChange({ title: e.target.value })}
        required
        disabled={disabled}
      />
      <Dropdown
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
      <Input
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
  return (
    <>
      <DatePicker
        label="Start Date & Time"
        value={fields.date_start}
        onChange={(d) => onChange({ date_start: d })}
        mode="datetime"
        min={minStart}
      />
      <DatePicker
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
  const handlePlaceSelect = (_value: string, place: PlaceResult | null) => {
    if (place) {
      onChange({
        address: place.short_name,
        location_lat: place.lat,
        location_lng: place.lng,
      })
    } else {
      onChange({ address: _value })
    }
  }

  return (
    <>
      <PlaceAutocomplete
        label="Address"
        placeholder="Search for an address..."
        value={fields.address}
        onChange={handlePlaceSelect}
      />
      <MapView
        center={
          fields.location_lat != null && fields.location_lng != null
            ? { lat: fields.location_lat, lng: fields.location_lng }
            : { lat: -33.8688, lng: 151.2093 }
        }
        zoom={13}
        draggable
        onDragEnd={(pos: MapCenter) => {
          onChange({ location_lat: pos.lat, location_lng: pos.lng })
        }}
        aria-label="Drag the pin to set event location"
        className="aspect-[16/10] rounded-xl shadow-sm"
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Details: capacity + public toggle                                  */
/* ------------------------------------------------------------------ */

export function DetailsFields({ fields, onChange, disabled }: FieldProps) {
  return (
    <>
      <Input
        label="Capacity"
        placeholder="Max participants (leave empty for unlimited)"
        value={fields.capacity}
        onChange={(e) => onChange({ capacity: e.target.value })}
        disabled={disabled}
      />
      <Toggle
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
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden">
            <img
              src={coverImageUrl}
              alt="Cover preview"
              className="w-full object-cover"
              style={{
                aspectRatio: '16/9',
                ...coverImagePositionStyle(positionX, positionY),
              }}
            />
            {!disabled && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute top-2 right-2 min-w-11 min-h-11 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
                aria-label="Remove cover image"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {onPositionChange && (
            <CoverImageFocalPointPicker
              imageUrl={coverImageUrl}
              x={positionX}
              y={positionY}
              onChange={onPositionChange}
              disabled={disabled}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onUpload}
          disabled={disabled || cameraLoading || uploading}
          className={cn(
            'w-full min-h-11 py-12 rounded-xl border-2 border-dashed border-primary-200 hover:border-primary-400',
            'cursor-pointer select-none',
            'active:scale-[0.97] transition-transform duration-150',
            'flex flex-col items-center justify-center',
            'text-neutral-500 hover:text-neutral-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Upload cover image"
        >
          <Image size={32} />
          <p className="text-sm font-medium mt-2">Tap to upload a cover photo</p>
        </button>
      )}
      {!disabled && (
        <>
          <UploadProgress
            progress={uploadProgress}
            uploading={uploading}
            error={uploadError}
            variant="bar"
          />
          {!coverImageUrl && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Camera size={14} />}
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
