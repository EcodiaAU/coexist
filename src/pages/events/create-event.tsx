import { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    ChevronDown,
    Type,
    Calendar,
    MapPin,
    Settings2,
    Image,
    Eye,
    Users,
    Building2,
    CheckCircle2,
    Leaf,
    TreePine,
    Waves,
    Sprout,
    Footprints,
    BookOpen,
    Repeat,
    Accessibility,
    Mountain,
    Backpack,
    Sparkles,
    Check,
    Clock,
    EyeOff,
    Send,
    Upload,
    HelpCircle,
    Ticket,
    Plus,
    Trash2
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery } from '@tanstack/react-query'
import {
    useCreateEvent,
    useInviteCollective,
    ACTIVITY_TYPE_OPTIONS,
} from '@/hooks/use-events'
import { supabase } from '@/lib/supabase'
import { useEventForm } from '@/hooks/use-event-form'
import type { EventFormFields, ActivityType } from '@/hooks/use-event-form'
import { useActivityTypeDefaults } from '@/hooks/use-activity-defaults'
import { parseLocationPoint } from '@/lib/geo'
import {
    DateTimeFields,
    LocationFields,
} from './components/event-form-fields'
import { CoverImageFocalPointPicker } from '@/components/cover-image-focal-point-picker'
import { coverImagePositionStyle } from '@/lib/cover-image'
import type { Database } from '@/types/database.types'
import {
    Page,
    Header,
    Button,
    Input,
    Dropdown,
    Toggle,
    Card,
    UploadProgress,
} from '@/components'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Error formatting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Turn whatever the Supabase / fetch / mutation chain throws into a short,
 * human-readable string. Postgres / PostgREST errors come back as plain
 * objects (not Error instances), so the old `String(err)` rendered them as
 * "[object Object]". This walks the common shapes and special-cases the
 * 23505 unique-violation so a duplicate event surfaces a clean message
 * instead of leaking the constraint name.
 */
function formatCreateEventError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string; hint?: string }
    if (e.code === '23505') {
      return 'This event already exists. Adjust the title or date and try again.'
    }
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    if (typeof e.details === 'string' && e.details.trim()) return e.details
    if (typeof e.hint === 'string' && e.hint.trim()) return e.hint
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Something went wrong. Please try again.'
}

/* ------------------------------------------------------------------ */
/*  Create-only form data (extends shared fields)                      */
/* ------------------------------------------------------------------ */

interface TicketTierDraft {
  id: string
  name: string
  description: string
  price_dollars: string
  capacity: string
}

interface CreateExtraFields {
  selected_collective_ids: string[]
  is_recurring: boolean
  recurring_type: 'weekly' | 'fortnightly' | 'monthly'
  recurring_count: number
  what_to_bring: string
  meeting_point: string
  wheelchair_access: boolean
  terrain: string
  difficulty: 'easy' | 'moderate' | 'challenging'
  what_to_wear: string
  invite_collective: boolean
  partner_name: string
  is_ticketed: boolean
  ticket_tiers: TicketTierDraft[]
  checkin_window_minutes: number
}

const INITIAL_EXTRA: CreateExtraFields = {
  selected_collective_ids: [],
  is_recurring: false,
  recurring_type: 'weekly',
  recurring_count: 4,
  what_to_bring: '',
  meeting_point: '',
  wheelchair_access: false,
  terrain: '',
  difficulty: 'easy',
  what_to_wear: '',
  invite_collective: false,
  partner_name: '',
  is_ticketed: false,
  ticket_tiers: [],
  checkin_window_minutes: 30,
}

/* ------------------------------------------------------------------ */
/*  Step config                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: 'Collective',
    subtitle: 'Which collectives is this event for?',
    icon: <Leaf size={20} />,
    gradient: 'from-sprout-500/20 via-moss-400/10 to-transparent',
    accentColor: 'text-sprout-600',
    accentBg: 'bg-sprout-500',
    cardBorder: 'border-l-sprout-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Basics',
    subtitle: 'Name your event and pick an activity',
    icon: <Type size={20} />,
    gradient: 'from-primary-500/20 via-sprout-400/10 to-transparent',
    accentColor: 'text-primary-600',
    accentBg: 'bg-primary-500',
    cardBorder: 'border-l-primary-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Date & Time',
    subtitle: 'When is it happening?',
    icon: <Calendar size={20} />,
    gradient: 'from-sky-400/15 via-primary-400/10 to-transparent',
    accentColor: 'text-sky-600',
    accentBg: 'bg-sky-500',
    cardBorder: 'border-l-sky-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Location',
    subtitle: 'Where should people meet?',
    icon: <MapPin size={20} />,
    gradient: 'from-sprout-400/20 via-moss-400/10 to-transparent',
    accentColor: 'text-sprout-600',
    accentBg: 'bg-sprout-500',
    cardBorder: 'border-l-sprout-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Details',
    subtitle: 'Help attendees prepare',
    icon: <Settings2 size={20} />,
    gradient: 'from-bark-400/15 via-primary-400/10 to-transparent',
    accentColor: 'text-bark-600',
    accentBg: 'bg-bark-500',
    cardBorder: 'border-l-bark-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Cover Image',
    subtitle: 'Make your event stand out',
    icon: <Image size={20} />,
    gradient: 'from-coral-400/15 via-plum-400/10 to-transparent',
    accentColor: 'text-coral-600',
    accentBg: 'bg-coral-500',
    cardBorder: 'border-l-coral-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Visibility',
    subtitle: 'Who can see this event?',
    icon: <Eye size={20} />,
    gradient: 'from-plum-400/15 via-primary-400/10 to-transparent',
    accentColor: 'text-plum-600',
    accentBg: 'bg-plum-500',
    cardBorder: 'border-l-plum-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Ticketing',
    subtitle: 'Free or paid? Set up tickets',
    icon: <Ticket size={20} />,
    gradient: 'from-amber-400/15 via-warning-400/10 to-transparent',
    accentColor: 'text-amber-600',
    accentBg: 'bg-amber-500',
    cardBorder: 'border-l-amber-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Invite',
    subtitle: 'Spread the word',
    icon: <Users size={20} />,
    gradient: 'from-moss-400/15 via-sprout-400/10 to-transparent',
    accentColor: 'text-moss-600',
    accentBg: 'bg-moss-500',
    cardBorder: 'border-l-moss-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Partner',
    subtitle: 'Co-hosting with an organisation?',
    icon: <Building2 size={20} />,
    gradient: 'from-bark-400/15 via-primary-400/10 to-transparent',
    accentColor: 'text-bark-600',
    accentBg: 'bg-bark-500',
    cardBorder: 'border-l-bark-400',
    cardGlow: 'bg-white',
  },
  {
    title: 'Review',
    subtitle: 'Everything look good?',
    icon: <CheckCircle2 size={20} />,
    gradient: 'from-success-400/20 via-sprout-400/10 to-transparent',
    accentColor: 'text-success-600',
    accentBg: 'bg-success-500',
    cardBorder: 'border-l-success-400',
    cardGlow: 'bg-white',
  },
]

/* ------------------------------------------------------------------ */
/*  Activity type icons                                                */
/* ------------------------------------------------------------------ */

const activityIcons: Record<string, React.ReactNode> = {
  clean_up: <Waves size={18} />,
  tree_planting: <TreePine size={18} />,
  ecosystem_restoration: <Sprout size={18} />,
  nature_hike: <Footprints size={18} />,
  camp_out: <Mountain size={18} />,
  spotlighting: <Eye size={18} />,
  other: <BookOpen size={18} />,
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

/* Step color context  lets StepCard auto-pick the current step's accent */
const StepColorCtx = createContext<{ cardBorder: string; cardGlow: string }>({
  cardBorder: 'border-l-primary-300',
  cardGlow: 'bg-surface-0',
})

/** Styled card wrapper used inside each step */
function StepCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { cardBorder, cardGlow } = useContext(StepColorCtx)
  return (
    <div
      className={cn(
        'rounded-2xl shadow-sm',
        'border border-neutral-100',
        'border-l-[3px]',
        cardBorder,
        cardGlow,
        'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Small section label inside step cards */
function SectionLabel({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 mb-4',
        'text-overline tracking-wider text-neutral-500',
        className,
      )}
    >
      {icon && <span className="text-neutral-400">{icon}</span>}
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step Components                                                    */
/* ------------------------------------------------------------------ */

/** Lightweight hook to fetch all active collectives for admin picker */
function useAllActiveCollectives() {
  return useQuery({
    queryKey: ['all-active-collectives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name, region, state, cover_image_url, timezone')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Common Australian IANA timezones for the per-event override dropdown.
 * Kept short - WA/SA/NT/east-coast cover essentially all Co-Exist
 * collectives. Anyone running an event abroad can still pick from the
 * full IANA list via the admin panel.
 */
const AU_TIMEZONES: { value: string; label: string }[] = [
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST, no DST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST, no DST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
]

function StepCollective({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const { data: collectives, isLoading } = useAllActiveCollectives()

  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Leaf size={14} />}>Select Collectives</SectionLabel>
        <p className="text-sm text-neutral-500 mb-4">
          Choose one or more collectives this event belongs to. The first
          selected collective is the primary host.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
            Loading collectives...
          </div>
        ) : !collectives?.length ? (
          <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
            No active collectives found
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto -mx-1 px-1">
            {collectives.map((c) => {
              const isSelected = selectedIds.includes(c.id)
              const isPrimary = selectedIds[0] === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggle(c.id)}
                  className={cn(
                    'w-full min-h-11 flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none text-left',
                    'active:scale-[0.98] transition-all duration-200',
                    'border',
                    isSelected
                      ? 'border-sprout-400 bg-gradient-to-r from-sprout-50 to-moss-50 ring-1 ring-sprout-300/50'
                      : 'border-neutral-100 bg-surface-0 hover:bg-surface-1',
                  )}
                >
                  {c.cover_image_url ? (
                    <img
                      src={c.cover_image_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      isSelected ? 'bg-sprout-500 text-white' : 'bg-surface-2 text-neutral-400',
                    )}>
                      <Leaf size={18} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{c.name}</p>
                    {(c.region || c.state) && (
                      <p className="text-caption text-neutral-500 truncate">
                        {[c.region, c.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex items-center gap-2 shrink-0">
                      {isPrimary && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sprout-600 bg-sprout-100 rounded-full px-2 py-0.5">
                          Host
                        </span>
                      )}
                      <div className="w-6 h-6 rounded-full bg-sprout-500 flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </StepCard>

      {selectedIds.length > 1 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-sprout-50 to-moss-50 border border-sprout-200/60">
          <div className="w-9 h-9 rounded-xl bg-sprout-500 flex items-center justify-center shrink-0">
            <Users size={16} className="text-white" />
          </div>
          <p className="text-sm text-sprout-700 font-medium">
            {selectedIds.length} collectives selected. The first one selected is
            the primary host.
          </p>
        </div>
      )}
    </div>
  )
}

function StepBasics({
  fields,
  onChange,
}: {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Sparkles size={14} />}>Event Info</SectionLabel>
        <div className="space-y-5">
          <Input
            label="Event Title"
            placeholder="e.g. Byron Bay Dune Planting Day"
            value={fields.title}
            onChange={(e) => onChange({ title: e.target.value })}
            required
          />

          <Dropdown
            label="Activity Type"
            placeholder="Select activity type"
            value={fields.activity_type || undefined}
            onChange={(v) => onChange({ activity_type: v as ActivityType })}
            options={ACTIVITY_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              icon: activityIcons[o.value],
            }))}
          />
        </div>
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Type size={14} />}>Description</SectionLabel>
        <Input
          type="textarea"
          label="Description"
          placeholder="Tell people what this event is about, what you'll be doing, and why it matters..."
          value={fields.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={5}
        />
      </StepCard>
    </div>
  )
}

function StepDateTime({
  fields,
  onChange,
  extra,
  onExtraChange,
}: {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
  extra: CreateExtraFields
  onExtraChange: (updates: Partial<CreateExtraFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Clock size={14} />}>Schedule</SectionLabel>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 -mb-1">
            <span>
              Times entered in{' '}
              <span className="font-semibold text-neutral-800">
                {AU_TIMEZONES.find((tz) => tz.value === fields.timezone)?.label ?? fields.timezone}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onChange({ timezone_overrides_collective: !fields.timezone_overrides_collective })}
              className="text-moss-700 hover:text-moss-800 font-medium underline-offset-2 hover:underline"
            >
              {fields.timezone_overrides_collective ? 'Reset to collective default' : 'Use different timezone'}
            </button>
          </div>
          {fields.timezone_overrides_collective && (
            <Dropdown
              label="Event Timezone"
              value={fields.timezone}
              onChange={(v) => onChange({ timezone: v })}
              options={AU_TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }))}
            />
          )}
          <DateTimeFields fields={fields} onChange={onChange} minStart={new Date()} />
          {fields.date_start && fields.date_start < new Date() && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning-50 text-warning-700 text-caption">
              <Clock size={14} className="shrink-0" />
              Start date is in the past - please choose a future date
            </div>
          )}
        </div>
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Repeat size={14} />}>Recurring</SectionLabel>
        <Toggle
          label="Recurring Event"
          description="Create a series of events on a schedule"
          checked={extra.is_recurring}
          onChange={(checked) => onExtraChange({ is_recurring: checked })}
        />

        <AnimatePresence>
          {extra.is_recurring && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-sky-200">
                <Dropdown
                  label="Frequency"
                  value={extra.recurring_type}
                  onChange={(v) =>
                    onExtraChange({
                      recurring_type: v as 'weekly' | 'fortnightly' | 'monthly',
                    })
                  }
                  options={[
                    {
                      value: 'weekly',
                      label: 'Weekly',
                      icon: <Repeat size={16} />,
                    },
                    {
                      value: 'fortnightly',
                      label: 'Fortnightly',
                      icon: <Repeat size={16} />,
                    },
                    {
                      value: 'monthly',
                      label: 'Monthly',
                      icon: <Repeat size={16} />,
                    },
                  ]}
                />

                <Input
                  label="Number of Events"
                  placeholder="4"
                  value={String(extra.recurring_count)}
                  onChange={(e) =>
                    onExtraChange({ recurring_count: parseInt(e.target.value) || 1 })
                  }
                />

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-50 text-sky-700 text-caption">
                  <Calendar size={14} />
                  This will create {extra.recurring_count} linked events
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </StepCard>
    </div>
  )
}

function StepLocation({
  fields,
  onChange,
  extra,
  onExtraChange,
}: {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
  extra: CreateExtraFields
  onExtraChange: (updates: Partial<CreateExtraFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<MapPin size={14} />}>Address &amp; Pin</SectionLabel>
        <p className="text-caption text-neutral-500 -mt-1 mb-3">
          Type an address or drag the pin - they stay in sync. Pin position is what attendees see on event day.
        </p>
        <LocationFields fields={fields} onChange={onChange} />
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Footprints size={14} />}>Meeting Point</SectionLabel>
        <Input
          label="Meeting Point Notes"
          placeholder="e.g. Meet at the car park near the northern entrance"
          value={extra.meeting_point}
          onChange={(e) => onExtraChange({ meeting_point: e.target.value })}
        />
      </StepCard>
    </div>
  )
}

function StepDetails({
  fields,
  onChange,
  extra,
  onExtraChange,
}: {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
  extra: CreateExtraFields
  onExtraChange: (updates: Partial<CreateExtraFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Users size={14} />}>Capacity</SectionLabel>
        <Input
          label="Max Participants"
          placeholder="Leave empty for unlimited"
          value={fields.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
        />
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Clock size={14} />}>Check-in Window</SectionLabel>
        <Dropdown
          label="When should check-in open?"
          value={String(extra.checkin_window_minutes)}
          onChange={(v) => onExtraChange({ checkin_window_minutes: parseInt(v, 10) })}
          options={[
            { value: '0', label: 'At event start time' },
            { value: '30', label: '30 minutes before (default)' },
          ]}
        />
        <p className="text-caption text-neutral-500 mt-2">
          Check-in can open up to 30 minutes before the event starts. Leaders can always override this and open check-in early from the event page.
        </p>
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Backpack size={14} />}>Preparation</SectionLabel>
        <div className="space-y-5">
          <Input
            type="textarea"
            label="What to Bring"
            placeholder="e.g. Water bottle, sunscreen, closed-toe shoes, gloves (we provide)"
            value={extra.what_to_bring}
            onChange={(e) => onExtraChange({ what_to_bring: e.target.value })}
            rows={3}
          />

          <Input
            type="textarea"
            label="What to Wear"
            placeholder="e.g. Long pants, hat, old clothes you don't mind getting dirty"
            value={extra.what_to_wear}
            onChange={(e) => onExtraChange({ what_to_wear: e.target.value })}
            rows={2}
          />
        </div>
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Accessibility size={14} />}>
          Accessibility & Terrain
        </SectionLabel>
        <div className="space-y-5">
          <Toggle
            label="Wheelchair Accessible"
            description="The venue and route are wheelchair accessible"
            checked={extra.wheelchair_access}
            onChange={(checked) => onExtraChange({ wheelchair_access: checked })}
          />

          <Input
            label="Terrain Type"
            placeholder="e.g. Beach sand, bushland trail, flat parkland"
            value={extra.terrain}
            onChange={(e) => onExtraChange({ terrain: e.target.value })}
          />

          <Dropdown
            label="Difficulty"
            value={extra.difficulty}
            onChange={(v) =>
              onExtraChange({ difficulty: v as 'easy' | 'moderate' | 'challenging' })
            }
            options={[
              {
                value: 'easy',
                label: 'Easy - suitable for everyone',
                icon: (
                  <Mountain size={16} className="text-success-600" />
                ),
              },
              {
                value: 'moderate',
                label: 'Moderate - some fitness required',
                icon: (
                  <Mountain size={16} className="text-warning-600" />
                ),
              },
              {
                value: 'challenging',
                label: 'Challenging - good fitness needed',
                icon: (
                  <Mountain size={16} className="text-error-600" />
                ),
              },
            ]}
          />
        </div>
      </StepCard>
    </div>
  )
}

function StepCoverImage({
  coverImageUrl,
  onUploadGallery,
  onUploadCamera,
  onRemove,
  uploading,
  cameraLoading,
  uploadProgress,
  uploadError,
  positionX,
  positionY,
  onPositionChange,
}: {
  coverImageUrl: string
  onUploadGallery: () => void
  onUploadCamera: () => void
  onRemove: () => void
  uploading: boolean
  cameraLoading: boolean
  uploadProgress: number | null
  uploadError: string | null
  positionX: number
  positionY: number
  onPositionChange: (x: number, y: number) => void
}) {
  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={onUploadGallery}
          disabled={cameraLoading || uploading}
          className={cn(
            'w-full min-h-11 cursor-pointer select-none',
            'active:scale-[0.98] transition-transform duration-200',
            'flex flex-col items-center justify-center',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            coverImageUrl
              ? 'p-0'
              : 'py-20 bg-gradient-to-br from-surface-2 via-surface-1 to-primary-50',
          )}
          aria-label="Upload cover image"
        >
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt="Cover preview"
              className="w-full object-cover"
              style={{
                aspectRatio: '16/9',
                ...coverImagePositionStyle(positionX, positionY),
              }}
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                <Upload size={28} className="text-neutral-400" />
              </div>
              <p className="text-sm font-semibold text-primary-700">
                Tap to upload a cover photo
              </p>
              <p className="text-caption text-neutral-500 mt-1">
                JPG or PNG, recommended 16:9
              </p>
            </div>
          )}
        </button>
        <UploadProgress
          progress={uploadProgress}
          uploading={uploading}
          variant="overlay"
        />
      </div>

      <UploadProgress
        progress={uploadProgress}
        uploading={uploading}
        error={uploadError}
        variant="bar"
      />

      {coverImageUrl && (
        <CoverImageFocalPointPicker
          imageUrl={coverImageUrl}
          x={positionX}
          y={positionY}
          onChange={onPositionChange}
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {coverImageUrl ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onUploadGallery}
              disabled={cameraLoading || uploading}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
            >
              Remove
            </Button>
          </>
        ) : (
          <StepCard className="w-full flex items-center gap-3 !p-3.5">
            <span className="text-neutral-400 shrink-0"><Image size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary-700">
                Take a photo instead
              </p>
              <p className="text-caption text-neutral-500">
                Use your camera to capture the location
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onUploadCamera}
              disabled={cameraLoading || uploading}
              className="shrink-0"
            >
              Camera
            </Button>
          </StepCard>
        )}
      </div>

      {/* Soft warning when no cover image */}
      {!coverImageUrl && !uploading && (
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200/60">
          <Image size={16} className="text-amber-500 shrink-0" />
          <p className="text-caption text-amber-700">
            Events with cover images get more registrations - consider adding one
          </p>
        </div>
      )}
    </div>
  )
}

function StepVisibility({
  fields,
  onChange,
}: {
  fields: EventFormFields
  onChange: (updates: Partial<EventFormFields>) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500 mb-1">
        Choose who can discover and register for this event.
      </p>

      {/* Public option */}
      <button
        type="button"
        onClick={() => onChange({ is_public: true })}
        className={cn(
          'w-full min-h-11 flex items-center gap-4 p-4 rounded-2xl cursor-pointer select-none text-left',
          'active:scale-[0.97] transition-transform duration-200',
          'border',
          fields.is_public
            ? 'border-primary-400 shadow-sm bg-gradient-to-r from-primary-50 to-sprout-50 ring-1 ring-primary-300/50'
            : 'border-neutral-100 bg-surface-0 hover:bg-surface-1',
        )}
      >
        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
            fields.is_public
              ? 'bg-primary-500 text-white'
              : 'bg-surface-2 text-neutral-400',
          )}
        >
          <Eye size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Public</p>
          <p className="text-caption text-neutral-500 mt-0.5">
            Anyone can find and register for this event
          </p>
        </div>
        {fields.is_public && (
          <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shrink-0">
            <Check size={14} className="text-white" />
          </div>
        )}
      </button>

      {/* Collective only option */}
      <button
        type="button"
        onClick={() => onChange({ is_public: false })}
        className={cn(
          'w-full min-h-11 flex items-center gap-4 p-4 rounded-2xl cursor-pointer select-none text-left',
          'active:scale-[0.97] transition-transform duration-200',
          'border',
          !fields.is_public
            ? 'border-plum-400 shadow-sm bg-gradient-to-r from-plum-50 to-primary-50 ring-1 ring-plum-300/50'
            : 'border-neutral-100 bg-surface-0 hover:bg-surface-1',
        )}
      >
        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
            !fields.is_public
              ? 'bg-plum-500 text-white'
              : 'bg-surface-2 text-neutral-400',
          )}
        >
          <EyeOff size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">
            Collective Only
          </p>
          <p className="text-caption text-neutral-500 mt-0.5">
            Only members of the selected collectives can see and register
          </p>
        </div>
        {!fields.is_public && (
          <div className="w-6 h-6 rounded-full bg-plum-500 flex items-center justify-center shrink-0">
            <Check size={14} className="text-white" />
          </div>
        )}
      </button>
    </div>
  )
}

function StepTicketing({
  extra,
  onExtraChange,
}: {
  extra: CreateExtraFields
  onExtraChange: (partial: Partial<CreateExtraFields>) => void
}) {
  const addTier = () => {
    onExtraChange({
      ticket_tiers: [
        ...extra.ticket_tiers,
        {
          id: crypto.randomUUID(),
          name: extra.ticket_tiers.length === 0 ? 'General Admission' : '',
          description: '',
          price_dollars: '',
          capacity: '',
        },
      ],
    })
  }

  const updateTier = (id: string, patch: Partial<TicketTierDraft>) => {
    onExtraChange({
      ticket_tiers: extra.ticket_tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  const removeTier = (id: string) => {
    onExtraChange({ ticket_tiers: extra.ticket_tiers.filter((t) => t.id !== id) })
  }

  return (
    <div className="space-y-4">
      <StepCard>
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Require tickets?</SectionLabel>
            <p className="text-xs text-neutral-500 mt-0.5">
              Ticketed events use Stripe for secure payment
            </p>
          </div>
          <Toggle
            checked={extra.is_ticketed}
            onChange={(checked) => {
              onExtraChange({ is_ticketed: checked })
              if (checked && extra.ticket_tiers.length === 0) addTier()
            }}
          />
        </div>
      </StepCard>

      {extra.is_ticketed && (
        <>
          <StepCard>
            <SectionLabel>Ticket tiers</SectionLabel>
            <p className="text-xs text-neutral-500 mb-3">
              Add one or more ticket types. Set price to $0 for free tiers.
            </p>

            <div className="space-y-3">
              {extra.ticket_tiers.map((tier, idx) => (
                <motion.div
                  key={tier.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="rounded-xl bg-white border border-neutral-100 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 text-amber-600 text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <Input
                      value={tier.name}
                      onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                      placeholder="Tier name (e.g. Early Bird)"
                      compact
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      className="flex items-center justify-center min-w-9 min-h-9 rounded-lg text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer"
                      aria-label="Remove tier"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <Input
                    value={tier.description}
                    onChange={(e) => updateTier(tier.id, { description: e.target.value })}
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
                          onChange={(e) => updateTier(tier.id, { price_dollars: e.target.value })}
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
                        onChange={(e) => updateTier(tier.id, { capacity: e.target.value })}
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
              onClick={addTier}
              className="mt-3 w-full"
            >
              Add another tier
            </Button>
          </StepCard>

          <div className="px-3 py-2 rounded-lg bg-amber-50/60 text-amber-700 text-xs">
            Attendees will be redirected to Stripe to complete payment. You'll see revenue and ticket sales in the admin dashboard.
          </div>
        </>
      )}
    </div>
  )
}

function StepInvite({
  extra,
  onExtraChange,
}: {
  extra: CreateExtraFields
  onExtraChange: (updates: Partial<CreateExtraFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Send size={14} />}>Notifications</SectionLabel>
        <p className="text-sm text-neutral-500 mb-4">
          Optionally invite all members of the selected collectives. They'll
          receive a push notification and the event will appear in their
          "Invited" tab.
        </p>

        <Toggle
          label="Invite All Collective Members"
          description="Send invites to every member of each selected collective when published"
          checked={extra.invite_collective}
          onChange={(checked) => onExtraChange({ invite_collective: checked })}
        />
      </StepCard>

      <AnimatePresence>
        {extra.invite_collective && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-moss-50 to-sprout-50 border border-moss-200/60">
              <div className="w-9 h-9 rounded-xl bg-moss-500 flex items-center justify-center shrink-0">
                <Users size={16} className="text-white" />
              </div>
              <p className="text-sm text-moss-700 font-medium">
                All active members of each selected collective will be notified
                when you publish.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepPartner({
  extra,
  onExtraChange,
  fields,
  onFieldsChange,
}: {
  extra: CreateExtraFields
  onExtraChange: (updates: Partial<CreateExtraFields>) => void
  fields: EventFormFields
  onFieldsChange: (updates: Partial<EventFormFields>) => void
}) {
  return (
    <div className="space-y-4">
      <StepCard>
        <SectionLabel icon={<Building2 size={14} />}>
          Event Type
        </SectionLabel>
        <p className="text-sm text-neutral-500 mb-4">
          Is this a regular Co-Exist event, or an external collaboration managed by a partner?
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => onFieldsChange({ is_external_collaboration: false, external_registration_url: '' })}
            className={cn(
              'flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer select-none',
              !fields.is_external_collaboration
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Leaf size={16} />
              Co-Exist Event
            </div>
          </button>
          <button
            type="button"
            onClick={() => onFieldsChange({ is_external_collaboration: true })}
            className={cn(
              'flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer select-none',
              fields.is_external_collaboration
                ? 'border-bark-400 bg-bark-50 text-bark-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Building2 size={16} />
              External Collab
            </div>
          </button>
        </div>
      </StepCard>

      <StepCard>
        <SectionLabel icon={<Building2 size={14} />}>
          Partner Organisation
        </SectionLabel>
        <p className="text-sm text-neutral-500 mb-4">
          If this event is co-hosted or sponsored by an external organisation,
          add them here. Their name will appear on the event page.
        </p>

        <Input
          label="Partner Organisation (optional)"
          placeholder="e.g. Byron Shire Council, Patagonia"
          value={extra.partner_name}
          onChange={(e) => onExtraChange({ partner_name: e.target.value })}
        />
      </StepCard>

      {fields.is_external_collaboration && (
        <StepCard>
          <SectionLabel icon={<Send size={14} />}>
            External Registration
          </SectionLabel>
          <p className="text-sm text-neutral-500 mb-4">
            If participants need to register on the partner's website, add the link here.
            This will show a "Register on Partner Site" button on the event page.
          </p>

          <Input
            label="External Registration URL (optional)"
            placeholder="https://partner-org.com/register"
            value={fields.external_registration_url}
            onChange={(e) => onFieldsChange({ external_registration_url: e.target.value })}
          />
        </StepCard>
      )}

      {!extra.partner_name && !fields.is_external_collaboration && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2/60 text-neutral-500">
          <HelpCircle size={16} className="shrink-0 text-neutral-400" />
          <p className="text-caption italic">
            You can skip this step - partners are optional.
          </p>
        </div>
      )}
    </div>
  )
}

function StepReview({ fields, extra }: { fields: EventFormFields; extra: CreateExtraFields }) {
  const activityLabel =
    ACTIVITY_TYPE_OPTIONS.find((o) => o.value === fields.activity_type)?.label ??
    fields.activity_type
  const { data: allCollectives } = useAllActiveCollectives()
  const selectedCollectives = (allCollectives ?? []).filter((c) =>
    extra.selected_collective_ids.includes(c.id),
  )

  return (
    <div className="space-y-4">
      {/* Preview card */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-neutral-100">
        <Card variant="event">
          {fields.cover_image_url && (
            <Card.Image
              src={fields.cover_image_url}
              alt={fields.title || 'Event cover'}
            />
          )}
          <Card.Content>
            <Card.Title>{fields.title || 'Untitled Event'}</Card.Title>
            <Card.Meta>
              {fields.date_start
                ? new Intl.DateTimeFormat('en-AU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(fields.date_start)
                : 'No date set'}
            </Card.Meta>
            {fields.address && <Card.Meta>{fields.address}</Card.Meta>}
          </Card.Content>
        </Card>
      </div>

      {/* Detail summary */}
      <StepCard className="!p-0 overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
          <p className="text-overline tracking-wider text-primary-500">
            Event Summary
          </p>
        </div>
        <div className="px-5 py-2 divide-y divide-neutral-100">
          <SummaryRow
            icon={<Leaf size={15} />}
            label="Collectives"
            value={
              selectedCollectives.length > 0
                ? selectedCollectives.map((c) => c.name).join(', ')
                : '-'
            }
          />
          <SummaryRow
            icon={
              activityIcons[fields.activity_type] || <HelpCircle size={15} />
            }
            label="Activity"
            value={activityLabel}
          />
          <SummaryRow
            icon={<Calendar size={15} />}
            label="Date"
            value={
              fields.date_start
                ? new Intl.DateTimeFormat('en-AU', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(fields.date_start)
                : '-'
            }
          />
          {fields.date_end && (
            <SummaryRow
              icon={<Clock size={15} />}
              label="Ends"
              value={new Intl.DateTimeFormat('en-AU', {
                timeStyle: 'short',
              }).format(fields.date_end)}
            />
          )}
          <SummaryRow
            icon={<MapPin size={15} />}
            label="Location"
            value={fields.address || '-'}
          />
          <SummaryRow
            icon={<Users size={15} />}
            label="Capacity"
            value={fields.capacity || 'Unlimited'}
          />
          <SummaryRow
            icon={fields.is_public ? <Eye size={15} /> : <EyeOff size={15} />}
            label="Visibility"
            value={fields.is_public ? 'Public' : 'Collective Only'}
          />
          <SummaryRow
            icon={<Ticket size={15} />}
            label="Ticketing"
            value={
              extra.is_ticketed
                ? `${extra.ticket_tiers.length} tier${extra.ticket_tiers.length !== 1 ? 's' : ''} - ${extra.ticket_tiers.map((t) => t.price_dollars ? `$${t.price_dollars}` : 'Free').join(', ')}`
                : 'Free - no ticket required'
            }
          />
          <SummaryRow
            icon={<Mountain size={15} />}
            label="Difficulty"
            value={
              extra.difficulty.charAt(0).toUpperCase() +
              extra.difficulty.slice(1)
            }
          />
          {extra.is_recurring && (
            <SummaryRow
              icon={<Repeat size={15} />}
              label="Recurring"
              value={`${extra.recurring_type}, ${extra.recurring_count} events`}
            />
          )}
          {extra.invite_collective && (
            <SummaryRow
              icon={<Send size={15} />}
              label="Invites"
              value={`All members (${extra.selected_collective_ids.length} collective${extra.selected_collective_ids.length === 1 ? '' : 's'})`}
            />
          )}
          {extra.partner_name && (
            <SummaryRow
              icon={<Building2 size={15} />}
              label="Partner"
              value={extra.partner_name}
            />
          )}
          {fields.is_external_collaboration && (
            <SummaryRow
              icon={<Building2 size={15} />}
              label="Event Type"
              value="External Collaboration"
            />
          )}
          {fields.external_registration_url && (
            <SummaryRow
              icon={<Send size={15} />}
              label="External Rego"
              value={fields.external_registration_url}
            />
          )}
        </div>
      </StepCard>

      {/* Missing fields checklist */}
      {(() => {
        const warnings: { label: string; icon: React.ReactNode }[] = []
        if (!fields.address && fields.location_lat == null)
          warnings.push({ label: 'No location set', icon: <MapPin size={14} /> })
        if (!fields.cover_image_url)
          warnings.push({ label: 'No cover image', icon: <Image size={14} /> })
        if (!fields.capacity)
          warnings.push({ label: 'No capacity limit', icon: <Users size={14} /> })
        if (!fields.description)
          warnings.push({ label: 'No description', icon: <Type size={14} /> })

        if (warnings.length === 0) return null
        return (
          <StepCard className="!p-0 overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200/60">
              <p className="text-overline tracking-wider text-amber-600">
                Recommended
              </p>
            </div>
            <div className="px-5 py-2 space-y-1">
              {warnings.map((w) => (
                <div key={w.label} className="flex items-center gap-2.5 py-2 text-caption text-amber-700">
                  <span className="text-amber-400 shrink-0">{w.icon}</span>
                  {w.label}
                </div>
              ))}
              <p className="text-caption text-neutral-500 py-1">
                You can still publish - these are optional but recommended.
              </p>
            </div>
          </StepCard>
        )
      })()}

      {/* Ready banner */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-success-50 to-sprout-50 border border-success-200/60">
        <div className="w-9 h-9 rounded-xl bg-success-500 flex items-center justify-center shrink-0">
          <CheckCircle2 size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-success-700">
            Ready to publish
          </p>
          <p className="text-caption text-success-600/80">
            Your event will be visible immediately
          </p>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-neutral-400 shrink-0">{icon}</span>
      <span className="text-caption text-neutral-500 shrink-0 w-20">
        {label}
      </span>
      <span className="text-sm text-neutral-900 font-medium text-right flex-1 min-w-0 truncate">
        {value}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Wizard                                                        */
/* ------------------------------------------------------------------ */

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [extra, setExtra] = useState<CreateExtraFields>(INITIAL_EXTRA)
  const [saveAsDraft] = useState(false)

  // Which sections are expanded. Required sections start open; optional
  // ones start collapsed so the form is short on first paint and the user
  // can scan + expand what they care about.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    collective: true,
    basics: true,
    datetime: true,
    location: true,
    details: false,
    cover: false,
    visibility: false,
    ticketing: false,
    invite: false,
    partner: false,
  })
  const toggleSection = useCallback((key: string) => {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))
  }, [])

  const form = useEventForm({ mode: 'create' })

  const createEvent = useCreateEvent()
  const { data: activityDefaults } = useActivityTypeDefaults()
  const inviteCollective = useInviteCollective()
  const { toast: toastApi } = useToast()

  // Reset everything (used after a successful publish, so that re-entering this
  // page from KeepAlive cache does not show the previous event's draft).
  const resetWizard = useCallback(() => {
    setExtra(INITIAL_EXTRA)
    form.resetFields({})
    setOpenSections({
      collective: true,
      basics: true,
      datetime: true,
      location: true,
      details: false,
      cover: false,
      visibility: false,
      ticketing: false,
      invite: false,
      partner: false,
    })
  }, [form])

  // Duplicate / "create from existing" support: when the URL includes
  // ?from=:eventId we fetch that event and prefill the form, opening the
  // wizard at the Basics step so the user can tweak details before publishing.
  // No DB row is inserted until the user hits Publish.
  //
  // We track *every* source ID that has been prefilled in this component
  // instance - not just the most recent one. The wizard lives inside
  // KeepAlive's frozen-location cache, so even after we navigate away
  // post-publish, useSearchParams() can keep returning the same ?from=
  // value. Without a per-id ledger, resetting state post-publish would
  // make the prefill effect re-fire and pull the user back into a
  // pre-filled wizard instead of staying on the new event detail page.
  const fromEventId = searchParams.get('from')
  const prefilledIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!fromEventId || prefilledIdsRef.current.has(fromEventId)) return
    prefilledIdsRef.current.add(fromEventId)

    let cancelled = false
    ;(async () => {
      const { data: source, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', fromEventId)
        .single()
      if (cancelled || error || !source) return

      // Pull collaborator collectives so the duplicate keeps multi-host setup
      const { data: collabs } = await supabase
        .from('collective_event_collaborators')
        .select('collective_id')
        .eq('event_id', fromEventId)
        .eq('status', 'accepted')
      if (cancelled) return

      const pos = parseLocationPoint(source.location_point)
      form.resetFields({
        title: `${source.title} (Copy)`,
        activity_type: source.activity_type,
        description: source.description ?? '',
        date_start: null, // force user to pick a new date
        date_end: null,
        address: source.address ?? '',
        location_lat: pos?.lat ?? null,
        location_lng: pos?.lng ?? null,
        capacity: source.capacity ? String(source.capacity) : '',
        cover_image_url: source.cover_image_url ?? '',
        cover_image_position_x: (source as { cover_image_position_x?: number | null }).cover_image_position_x ?? 50,
        cover_image_position_y: (source as { cover_image_position_y?: number | null }).cover_image_position_y ?? 50,
        is_public: source.is_public ?? true,
        is_external_collaboration: source.is_external_collaboration ?? false,
        external_registration_url: source.external_registration_url ?? '',
        // Carry through any per-event tz override; the collective-default
        // sync effect will fill in the rest when collectives are picked.
        timezone: (source as { timezone?: string | null }).timezone ?? 'Australia/Sydney',
        timezone_overrides_collective: !!(source as { timezone?: string | null }).timezone,
      })
      setExtra((prev) => ({
        ...prev,
        selected_collective_ids: [
          source.collective_id,
          ...(collabs?.map((c) => c.collective_id) ?? []),
        ],
        is_ticketed: source.is_ticketed ?? false,
        checkin_window_minutes: (source as unknown as { checkin_window_minutes?: number }).checkin_window_minutes ?? 30,
      }))
      // Clear the query string so re-entering the page later doesn't re-prefill
      setSearchParams({}, { replace: true })
    })()

    return () => { cancelled = true }
  }, [fromEventId, form, setSearchParams])

  const updateExtra = useCallback((updates: Partial<CreateExtraFields>) => {
    setExtra((prev) => ({ ...prev, ...updates }))
  }, [])

  // Keep the form's timezone in sync with the primary collective's tz
  // UNTIL the user explicitly overrides it. This is what makes a Sydney
  // admin's "10am" entry land at 10am AWST when they pick a Perth
  // collective: the picker re-renders against the new tz the moment the
  // collective is chosen.
  const { data: allCollectives } = useAllActiveCollectives()
  const primaryCollectiveId = extra.selected_collective_ids[0]
  const primaryCollective = useMemo(
    () => allCollectives?.find((c) => c.id === primaryCollectiveId) ?? null,
    [allCollectives, primaryCollectiveId],
  )
  useEffect(() => {
    if (form.fields.timezone_overrides_collective) return
    const collectiveTz = primaryCollective?.timezone ?? 'Australia/Sydney'
    if (form.fields.timezone !== collectiveTz) {
      form.updateFields({ timezone: collectiveTz })
    }
  }, [primaryCollective, form.fields.timezone, form.fields.timezone_overrides_collective, form])

  // Per-section validity. Drives the section status pills + the publish-time
  // gate. Optional sections are always valid.
  const sectionStatus = useMemo(() => ({
    collective: extra.selected_collective_ids.length > 0,
    basics: form.isBasicsValid,
    datetime: form.isDateValid && !form.isDateInPast,
    location: form.hasLocation,
  }), [extra.selected_collective_ids.length, form.isBasicsValid, form.isDateValid, form.isDateInPast, form.hasLocation])

  const canPublish = useMemo(
    () => sectionStatus.collective && sectionStatus.basics && sectionStatus.datetime && sectionStatus.location,
    [sectionStatus],
  )

  // When the user hits publish without filling something required, auto-open
  // the offending sections + scroll to the first one so they aren't hunting
  // for what's missing.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const revealMissing = useCallback(() => {
    const order: Array<keyof typeof sectionStatus> = ['collective', 'basics', 'datetime', 'location']
    const first = order.find((k) => !sectionStatus[k])
    if (!first) return
    setOpenSections((s) => ({ ...s, [first]: true }))
    requestAnimationFrame(() => {
      sectionRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [sectionStatus])

  // We need the user's collective - use the first one they're a leader of
  const handlePublish = useCallback(
    async (asDraft = false) => {
      if (!user) return

      const isDraft = asDraft || saveAsDraft

      // Validate dates
      if (form.fields.date_start && form.fields.date_start < new Date()) {
        toastApi.error('Start date cannot be in the past')
        return
      }
      if (
        form.fields.date_start &&
        form.fields.date_end &&
        form.fields.date_end <= form.fields.date_start
      ) {
        toastApi.error('End date must be after start date')
        return
      }

      try {
        const selectedIds = extra.selected_collective_ids
        if (selectedIds.length === 0) {
          toastApi.error('Please select at least one collective')
          return
        }

        const primaryCollectiveId = selectedIds[0]
        const additionalCollectiveIds = selectedIds.slice(1)

        // For recurring events, generate a series_id so all occurrences share it.
        let seriesId: string | null = null
        if (extra.is_recurring && extra.recurring_count > 1 && !isDraft) {
          const { data: series, error: seriesErr } = await supabase
            .from('event_series')
            .insert({
              collective_id: primaryCollectiveId,
              created_by: user.id,
              title_template: form.fields.title,
              recurrence_rule: {
                type: extra.recurring_type,
                count: extra.recurring_count,
              },
            })
            .select('id')
            .single()
          if (seriesErr) {
            console.error('[create-event] series insert error:', seriesErr)
          } else {
            seriesId = series?.id ?? null
          }
        }

        // If the admin didn't upload a cover, fall back to the activity
        // default so the event always has an image. activityDefaults is the
        // map keyed by activity_type from useActivityTypeDefaults.
        const activityDefault = !form.fields.cover_image_url && form.fields.activity_type
          ? activityDefaults?.[form.fields.activity_type]
          : null
        const resolvedCover = form.fields.cover_image_url || activityDefault?.cover_image_url || null
        const resolvedCoverX = form.fields.cover_image_url
          ? form.fields.cover_image_position_x
          : activityDefault?.cover_image_position_x ?? form.fields.cover_image_position_x
        const resolvedCoverY = form.fields.cover_image_url
          ? form.fields.cover_image_position_y
          : activityDefault?.cover_image_position_y ?? form.fields.cover_image_position_y
        const baseInsert = {
          collective_id: primaryCollectiveId,
          title: form.fields.title,
          description: form.fields.description || null,
          activity_type:
            form.fields.activity_type as Database['public']['Enums']['activity_type'],
          date_start: form.fields.date_start!.toISOString(),
          date_end: form.fields.date_end?.toISOString() ?? null,
          address: form.fields.address || null,
          location_point: form.buildLocationPoint(),
          capacity: form.parsedCapacity(),
          cover_image_url: resolvedCover,
          cover_image_position_x: resolvedCoverX,
          cover_image_position_y: resolvedCoverY,
          is_public: form.fields.is_public,
          is_ticketed: extra.is_ticketed,
          is_external_collaboration: form.fields.is_external_collaboration,
          external_registration_url: form.fields.external_registration_url || null,
          checkin_window_minutes: extra.checkin_window_minutes,
          // Cast keeps the literal type when this object is reused below for
          // recurring-event fan-out - without it the spread loses contextual
          // narrowing and 'status' widens to plain `string`.
          status: (isDraft ? 'draft' : 'published') as Database['public']['Enums']['event_status'],
          series_id: seriesId,
          // Persist a per-event timezone override only when the user has
          // explicitly chosen a different zone from the collective's.
          // Otherwise leave NULL so the event inherits if the collective
          // ever changes its tz.
          timezone: form.fields.timezone_overrides_collective ? form.fields.timezone : null,
          // Capture the wizard's "preparation & access" fields so edit-event
          // can round-trip them. Stored as jsonb so we can extend without a
          // schema change later.
          event_extras: {
            meeting_point: extra.meeting_point || '',
            what_to_bring: extra.what_to_bring || '',
            what_to_wear: extra.what_to_wear || '',
            terrain: extra.terrain || '',
            difficulty: extra.difficulty || 'easy',
            wheelchair_access: !!extra.wheelchair_access,
            partner_name: extra.partner_name || '',
          },
        }

        const event = await createEvent.mutateAsync(baseInsert)

        // Insert ticket types if ticketed
        if (extra.is_ticketed && extra.ticket_tiers.length > 0) {
          const ticketTypeRows = extra.ticket_tiers
            .filter((t) => t.name.trim())
            .map((t, idx) => ({
              event_id: event.id,
              name: t.name.trim(),
              description: t.description.trim() || null,
              price_cents: Math.round(parseFloat(t.price_dollars || '0') * 100),
              capacity: t.capacity ? parseInt(t.capacity, 10) : null,
              sort_order: idx,
              is_active: true,
            }))

          if (ticketTypeRows.length > 0) {
            const { error: ttErr } = await supabase
              .from('event_ticket_types')
              .insert(ticketTypeRows)
            if (ttErr) console.error('[create-event] ticket type insert error:', ttErr)
          }
        }

        // Recurring events: fan out N-1 additional occurrences sharing the
        // same series_id. Each occurrence is a fully independent event row
        // (so registrations/check-ins/impact are tracked per-date) but they
        // can be queried as a series via series_id.
        if (extra.is_recurring && extra.recurring_count > 1 && seriesId && !isDraft) {
          const intervalDays =
            extra.recurring_type === 'weekly' ? 7
            : extra.recurring_type === 'fortnightly' ? 14
            : 0 // monthly handled via setMonth below

          const recurringRows: typeof baseInsert[] = []
          for (let i = 1; i < extra.recurring_count; i++) {
            const start = new Date(form.fields.date_start!.getTime())
            const end = form.fields.date_end ? new Date(form.fields.date_end.getTime()) : null
            if (extra.recurring_type === 'monthly') {
              start.setMonth(start.getMonth() + i)
              if (end) end.setMonth(end.getMonth() + i)
            } else {
              start.setDate(start.getDate() + intervalDays * i)
              if (end) end.setDate(end.getDate() + intervalDays * i)
            }
            recurringRows.push({
              ...baseInsert,
              date_start: start.toISOString(),
              date_end: end ? end.toISOString() : null,
            })
          }

          if (recurringRows.length > 0) {
            const { data: extraEvents, error: recErr } = await supabase
              .from('events')
              .insert(recurringRows.map((r) => ({ ...r, created_by: user.id })))
              .select()
            if (recErr) {
              console.error('[create-event] recurring insert error:', recErr)
            } else if (extraEvents && extra.is_ticketed && extra.ticket_tiers.length > 0) {
              // Replicate ticket tiers to each new occurrence
              const tierRows = extraEvents.flatMap((ev) =>
                extra.ticket_tiers
                  .filter((t) => t.name.trim())
                  .map((t, idx) => ({
                    event_id: ev.id,
                    name: t.name.trim(),
                    description: t.description.trim() || null,
                    price_cents: Math.round(parseFloat(t.price_dollars || '0') * 100),
                    capacity: t.capacity ? parseInt(t.capacity, 10) : null,
                    sort_order: idx,
                    is_active: true,
                  })),
              )
              if (tierRows.length > 0) {
                await supabase.from('event_ticket_types').insert(tierRows)
              }
            }
          }
        }

        // Link additional collectives as accepted collaborators
        if (additionalCollectiveIds.length > 0) {
          const { error: collabErr } = await supabase
            .from('collective_event_collaborators')
            .insert(
              additionalCollectiveIds.map((cId) => ({
                event_id: event.id,
                collective_id: cId,
                invited_by_collective_id: primaryCollectiveId,
                invited_by_user: user.id,
                status: 'accepted',
              })),
            )
          if (collabErr) console.error('[create-event] collaborator insert error:', collabErr)
        }

        // Auto-invite selected collectives if toggled on
        if (extra.invite_collective && !isDraft) {
          for (const cId of selectedIds) {
            try {
              await inviteCollective.mutateAsync({
                eventId: event.id,
                collectiveId: cId,
              })
            } catch {
              // Non-critical - continue with other collectives
            }
          }
        }

        // Reset wizard state BEFORE navigating away. KeepAlive caches this
        // page, so without an explicit reset the next visit (e.g. creating a
        // second event) would reopen the wizard on the last step with the
        // previous event's details still prefilled. We DON'T clear
        // prefilledIdsRef - keeping the source id in the ledger prevents the
        // prefill effect from re-firing on the next render and dragging the
        // user back into the wizard with the just-published event prefilled
        // (the cached frozen URL still carries the ?from= we already used).
        resetWizard()

        navigate('/admin/events', { replace: true })
      } catch (err) {
        console.error('[create-event] publish failed:', err)
        const msg = formatCreateEventError(err)
        toastApi.error(
          isDraft ? `Failed to save draft: ${msg}` : `Failed to publish: ${msg}`,
        )
      }
    },
    [user, form, extra, saveAsDraft, createEvent, inviteCollective, navigate, toastApi, resetWizard, activityDefaults],
  )

  const handleBack = useCallback(() => navigate(-1), [navigate])

  const toggleCollective = useCallback((id: string) => {
    setExtra((prev) => {
      const ids = prev.selected_collective_ids
      return {
        ...prev,
        selected_collective_ids: ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id],
      }
    })
  }, [])

  const handlePublishClick = useCallback(() => {
    if (!canPublish) {
      revealMissing()
      toastApi.error('A few required fields still need attention')
      return
    }
    handlePublish()
  }, [canPublish, revealMissing, toastApi, handlePublish])

  // Section config — drives both the accordion render and the meta lookup.
  // Each entry maps a section key to one of the original STEPS configs and
  // a short summary string so the user can see at-a-glance what's set.
  const sectionDefs = useMemo(() => {
    const tzLabel = AU_TIMEZONES.find((tz) => tz.value === form.fields.timezone)?.label ?? form.fields.timezone
    const dateSummary = form.fields.date_start
      ? new Intl.DateTimeFormat('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }).format(form.fields.date_start)
      : ''
    return [
      {
        key: 'collective',
        step: STEPS[0],
        required: true,
        valid: sectionStatus.collective,
        summary:
          extra.selected_collective_ids.length === 0
            ? ''
            : `${extra.selected_collective_ids.length} selected`,
        content: <StepCollective selectedIds={extra.selected_collective_ids} onToggle={toggleCollective} />,
      },
      {
        key: 'basics',
        step: STEPS[1],
        required: true,
        valid: sectionStatus.basics,
        summary: form.fields.title || '',
        content: <StepBasics fields={form.fields} onChange={form.updateFields} />,
      },
      {
        key: 'datetime',
        step: STEPS[2],
        required: true,
        valid: sectionStatus.datetime,
        summary: dateSummary ? `${dateSummary} · ${tzLabel}` : '',
        content: <StepDateTime fields={form.fields} onChange={form.updateFields} extra={extra} onExtraChange={updateExtra} />,
      },
      {
        key: 'location',
        step: STEPS[3],
        required: true,
        valid: sectionStatus.location,
        summary: form.fields.address || '',
        content: <StepLocation fields={form.fields} onChange={form.updateFields} extra={extra} onExtraChange={updateExtra} />,
      },
      {
        key: 'details',
        step: STEPS[4],
        required: false,
        valid: true,
        summary: form.fields.capacity ? `Capacity ${form.fields.capacity}` : '',
        content: <StepDetails fields={form.fields} onChange={form.updateFields} extra={extra} onExtraChange={updateExtra} />,
      },
      {
        key: 'cover',
        step: STEPS[5],
        required: false,
        valid: true,
        summary: form.fields.cover_image_url ? 'Image added' : '',
        content: (
          <StepCoverImage
            coverImageUrl={form.fields.cover_image_url}
            onUploadGallery={form.handleUploadFromGallery}
            onUploadCamera={form.handleUploadFromCamera}
            onRemove={form.removeCoverImage}
            uploading={form.uploading}
            cameraLoading={form.cameraLoading}
            uploadProgress={form.uploadProgress}
            uploadError={form.uploadError}
            positionX={form.fields.cover_image_position_x}
            positionY={form.fields.cover_image_position_y}
            onPositionChange={form.setCoverImagePosition}
          />
        ),
      },
      {
        key: 'visibility',
        step: STEPS[6],
        required: false,
        valid: true,
        summary: form.fields.is_public ? 'Public' : 'Collective only',
        content: <StepVisibility fields={form.fields} onChange={form.updateFields} />,
      },
      {
        key: 'ticketing',
        step: STEPS[7],
        required: false,
        valid: true,
        summary: extra.is_ticketed
          ? `${extra.ticket_tiers.length} tier${extra.ticket_tiers.length !== 1 ? 's' : ''}`
          : 'Free',
        content: <StepTicketing extra={extra} onExtraChange={updateExtra} />,
      },
      {
        key: 'invite',
        step: STEPS[8],
        required: false,
        valid: true,
        summary: extra.invite_collective ? 'Invite all members' : '',
        content: <StepInvite extra={extra} onExtraChange={updateExtra} />,
      },
      {
        key: 'partner',
        step: STEPS[9],
        required: false,
        valid: true,
        summary:
          extra.partner_name ||
          (form.fields.is_external_collaboration ? 'External collab' : ''),
        content: <StepPartner extra={extra} onExtraChange={updateExtra} fields={form.fields} onFieldsChange={form.updateFields} />,
      },
    ] as const
  }, [extra, form, sectionStatus, toggleCollective, updateExtra])

  return (
    <Page
      swipeBack
      fullBleed
      header={<Header title="Create Event" back transparent onBack={handleBack} />}
      footer={
        <div className="py-3 space-y-2 bg-gradient-to-r from-primary-50/60 via-surface-0 to-moss-50/40">
          <div className="px-4">
            <Button
              variant="primary"
              fullWidth
              disabled={!canPublish || createEvent.isPending}
              loading={createEvent.isPending && !saveAsDraft}
              onClick={handlePublishClick}
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={18} />
                Publish Event
              </span>
            </Button>
          </div>
          <div className="px-4">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => handlePublish(true)}
              loading={createEvent.isPending && saveAsDraft}
              disabled={!sectionStatus.collective || !sectionStatus.basics}
            >
              Save as Draft
            </Button>
          </div>
        </div>
      }
    >
      {/* ---- Sub-header strip: title + missing-required hint ---- */}
      <div className="pt-3 px-3 sm:px-4">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl p-4 bg-gradient-to-br from-primary-500/15 via-sprout-400/10 to-transparent"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white bg-primary-500">
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-primary-900">New Event</h2>
              <p className="text-caption text-primary-500 mt-0.5">
                {canPublish
                  ? 'Looks good — publish whenever you are ready'
                  : 'Fill out the highlighted sections to publish'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ---- All sections, stacked as collapsible accordions ---- */}
      <div className="pt-3 pb-6 px-3 sm:px-4">
        {sectionDefs.map((def) => {
          const isOpen = !!openSections[def.key]
          return (
            <div
              key={def.key}
              ref={(el) => {
                sectionRefs.current[def.key] = el
              }}
            >
              <button
                type="button"
                onClick={() => toggleSection(def.key)}
                aria-expanded={isOpen}
                className={cn(
                  'w-full min-h-14 flex items-center gap-3 py-3 text-left',
                  'cursor-pointer select-none',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0',
                    def.step.accentBg,
                  )}
                >
                  {def.step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900 truncate">
                      {def.step.title}
                    </h3>
                    {def.required && (
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5',
                          def.valid
                            ? 'text-success-600 bg-success-50'
                            : 'text-warning-600 bg-warning-50',
                        )}
                      >
                        {def.valid ? 'Done' : 'Required'}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-neutral-500 mt-0.5 truncate">
                    {def.summary || def.step.subtitle}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={cn(
                    'shrink-0 text-neutral-400 transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pb-4 pt-1">
                      <StepColorCtx.Provider
                        value={{ cardBorder: def.step.cardBorder, cardGlow: def.step.cardGlow }}
                      >
                        {def.content}
                      </StepColorCtx.Provider>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {/* Review summary always rendered at the bottom so the user can scan
            the final event before publishing — no separate step needed. */}
        <div className="pt-2">
          <StepColorCtx.Provider
            value={{ cardBorder: STEPS[10].cardBorder, cardGlow: STEPS[10].cardGlow }}
          >
            <StepReview fields={form.fields} extra={extra} />
          </StepColorCtx.Provider>
        </div>
      </div>
    </Page>
  )
}
