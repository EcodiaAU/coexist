import { useState, useCallback } from 'react'
import { useCamera } from '@/hooks/use-camera'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useToast } from '@/components/toast'
import { wallClockNow, wallClockNextHour } from '@/lib/date-format'
import type { Database } from '@/types/database.types'

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 50
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n)
}

export type ActivityType = Database['public']['Enums']['activity_type']

/* ------------------------------------------------------------------ */
/*  Shared form data shape (fields common to create + edit)            */
/* ------------------------------------------------------------------ */

export interface EventExtras {
  meeting_point: string
  what_to_bring: string
  what_to_wear: string
  terrain: string
  difficulty: 'easy' | 'moderate' | 'challenging'
  wheelchair_access: boolean
  partner_name: string
}

export const INITIAL_EXTRAS: EventExtras = {
  meeting_point: '',
  what_to_bring: '',
  what_to_wear: '',
  terrain: '',
  difficulty: 'easy',
  wheelchair_access: false,
  partner_name: '',
}

export interface EventFormFields {
  title: string
  activity_type: ActivityType | ''
  description: string
  date_start: Date | null
  date_end: Date | null
  address: string
  location_lat: number | null
  location_lng: number | null
  capacity: string
  cover_image_url: string
  cover_image_position_x: number
  cover_image_position_y: number
  is_public: boolean
  is_external_collaboration: boolean
  external_registration_url: string
  /**
   * Legacy field, kept for source-compat with existing consumers. In the
   * floating-local model (Tate 2026-05-25 + 2026-05-26) events have no
   * timezone - the wall-clock is the wall-clock for every viewer. The
   * DatePicker no longer reads this value; it is never persisted as a
   * non-null events.timezone column. Always 'UTC'.
   */
  timezone: string
  /** Legacy field. Always false in the floating-local model. */
  timezone_overrides_collective: boolean
  /** Free-form metadata captured in the wizard - persisted to
   *  events.event_extras jsonb so edit-event can round-trip them. */
  extras: EventExtras
}

export const INITIAL_FORM_FIELDS: EventFormFields = {
  title: '',
  activity_type: '',
  description: '',
  date_start: null,
  date_end: null,
  address: '',
  location_lat: null,
  location_lng: null,
  capacity: '',
  cover_image_url: '',
  cover_image_position_x: 50,
  cover_image_position_y: 50,
  is_public: true,
  is_external_collaboration: false,
  external_registration_url: '',
  timezone: 'UTC',
  timezone_overrides_collective: false,
  extras: INITIAL_EXTRAS,
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseEventFormOptions {
  mode: 'create' | 'edit'
  initial?: Partial<EventFormFields>
}

export function useEventForm({ mode, initial }: UseEventFormOptions) {
  const [fields, setFields] = useState<EventFormFields>(() => ({
    ...INITIAL_FORM_FIELDS,
    // Create mode seeds the start time to the next whole hour (minutes
    // :00) so the native time spinner opens on a round time instead of
    // the current minute (Jess 2026-06-24). Edit mode passes the real
    // event start in `initial`, which overrides this.
    ...(mode === 'create' ? { date_start: wallClockNextHour() } : {}),
    ...initial,
  }))
  const { toast } = useToast()

  const updateFields = useCallback((updates: Partial<EventFormFields>) => {
    setFields((prev) => ({ ...prev, ...updates }))
  }, [])

  const updateExtras = useCallback((updates: Partial<EventExtras>) => {
    setFields((prev) => ({ ...prev, extras: { ...prev.extras, ...updates } }))
  }, [])

  const resetFields = useCallback(
    (values: Partial<EventFormFields>) => {
      setFields({
        ...INITIAL_FORM_FIELDS,
        ...(mode === 'create' ? { date_start: wallClockNextHour() } : {}),
        ...values,
      })
    },
    [mode],
  )

  /* Cover image upload helpers */
  const { capture, pickFromGallery, loading: cameraLoading } = useCamera()
  const {
    upload,
    progress: uploadProgress,
    uploading,
    error: uploadError,
  } = useImageUpload({
    bucket: 'event-images',
    pathPrefix: 'covers',
  })

  const handleUploadFromGallery = useCallback(async () => {
    const result = await pickFromGallery()
    if (!result) return
    try {
      const uploaded = await upload(result.blob)
      // Reset focal point to centre when a new image is uploaded - the old
      // focal point is meaningless against a different image.
      setFields((prev) => ({
        ...prev,
        cover_image_url: uploaded.url,
        cover_image_position_x: 50,
        cover_image_position_y: 50,
      }))
    } catch (err) {
      console.error('[event-form] upload failed:', err)
      const msg = err instanceof Error ? err.message : 'unknown'
      toast.error(`Image upload failed: ${msg}`)
    }
  }, [pickFromGallery, upload, toast])

  const handleUploadFromCamera = useCallback(async () => {
    const result = await capture()
    if (!result) return
    try {
      const uploaded = await upload(result.blob)
      setFields((prev) => ({
        ...prev,
        cover_image_url: uploaded.url,
        cover_image_position_x: 50,
        cover_image_position_y: 50,
      }))
    } catch (err) {
      console.error('[event-form] upload failed:', err)
      const msg = err instanceof Error ? err.message : 'unknown'
      toast.error(`Image upload failed: ${msg}`)
    }
  }, [capture, upload, toast])

  const removeCoverImage = useCallback(() => {
    setFields((prev) => ({
      ...prev,
      cover_image_url: '',
      cover_image_position_x: 50,
      cover_image_position_y: 50,
    }))
  }, [])

  const setCoverImagePosition = useCallback((x: number, y: number) => {
    const clampedX = clampPercent(x)
    const clampedY = clampPercent(y)
    setFields((prev) => ({
      ...prev,
      cover_image_position_x: clampedX,
      cover_image_position_y: clampedY,
    }))
  }, [])

  /* Validation: minimum required fields */
  const isBasicsValid = fields.title.trim().length > 0 && fields.activity_type !== ''
  const isDateValid = fields.date_start !== null
  // Floating-local: fields.date_start is a Date whose UTC encodes the
  // host's typed wall-clock (e.g. Date('2026-05-07T15:00Z') means
  // "3pm 7 May"). Compare against wallClockNow() - a Date whose UTC
  // encodes the viewer's local wall-clock - so "in the past" lines up
  // with what the user's phone says, not with absolute UTC.
  const isDateInPast = fields.date_start !== null && fields.date_start < wallClockNow()
  const hasLocation = fields.address.trim().length > 0 || (fields.location_lat !== null && fields.location_lng !== null)

  /** Build PostGIS-compatible EWKT string from lat/lng.
   *  EWKT (with SRID prefix) is required for PostgREST to implicitly cast
   *  text → geography(Point,4326). Plain WKT silently fails to persist,
   *  which is why edits used to "lose" the pin and snap back to default. */
  const buildLocationPoint = useCallback(() => {
    return fields.location_lat != null && fields.location_lng != null
      ? `SRID=4326;POINT(${fields.location_lng} ${fields.location_lat})`
      : null
  }, [fields.location_lat, fields.location_lng])

  /** Parse capacity string to number | null */
  const parsedCapacity = useCallback(() => {
    const n = fields.capacity ? parseInt(fields.capacity, 10) : null
    return n && n > 0 ? n : null
  }, [fields.capacity])

  return {
    fields,
    updateFields,
    updateExtras,
    resetFields,

    // Image upload
    cameraLoading,
    uploading,
    uploadProgress,
    uploadError,
    handleUploadFromGallery,
    handleUploadFromCamera,
    removeCoverImage,
    setCoverImagePosition,

    // Validation
    isBasicsValid,
    isDateValid,
    isDateInPast,
    hasLocation,

    // Helpers
    buildLocationPoint,
    parsedCapacity,
  }
}
