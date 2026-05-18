import { useState, useCallback, useMemo, useEffect, useRef, Suspense, startTransition } from 'react'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import {
    TreePine,
    Clock,
    Leaf,
    Camera,
    Plus,
    X,
    MapPin,
    CheckCircle2,
    Save,
    Calendar,
    ClipboardList,
    WifiOff,
    RefreshCw,
    AlertTriangle,
    Bird,
    ChevronDown,
    Sparkles,
    Users,
    Timer,
} from 'lucide-react'
import {
    useEventDetail,
    useEventImpact,
    useEventAttendees,
    useLogImpact,
    ACTIVITY_TYPE_LABELS,
    getEventDuration,
} from '@/hooks/use-events'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import { useAuth } from '@/hooks/use-auth'
import { useEventSurvey } from '@/hooks/use-event-survey'
import { SurveyQuestionRenderer } from '@/components/survey-questions'
import { isQuestionVisible } from '@/components/survey-questions-utils'
import { syncSurveyImpact } from '@/lib/survey-impact'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import { useCamera } from '@/hooks/use-camera'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useOffline } from '@/hooks/use-offline'
import type { Json } from '@/types/database.types'
import {
    Page,
    Header,
    Button,
    Input,
    Skeleton,
    EmptyState,
    UploadProgress,
    WhatsNext,
    ConfirmationSheet,
} from '@/components'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { parseLocationPoint } from '@/lib/geo'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const MapView = lazyWithRetry(() => import('@/components/map/map-view').then(m => ({ default: m.MapView })))

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

/* ------------------------------------------------------------------ */
/*  Section card wrapper                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white shadow-sm border border-neutral-100/80',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon,
  title,
  iconColor = 'text-primary-600',
  iconBg = 'bg-primary-50',
}: {
  icon: React.ReactNode
  title: string
  iconColor?: string
  iconBg?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className={cn('flex items-center justify-center w-8 h-8 rounded-xl shrink-0', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </span>
      <h3 className="text-sm font-bold text-neutral-800 tracking-tight">{title}</h3>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Species entry                                                      */
/* ------------------------------------------------------------------ */

interface SpeciesEntry {
  name: string
  count: number
}

function SpeciesTracker({
  species,
  onChange,
  activityType,
}: {
  species: SpeciesEntry[]
  onChange: (species: SpeciesEntry[]) => void
  activityType?: string
}) {
  const [newName, setNewName] = useState('')

  const addSpecies = useCallback(() => {
    if (!newName.trim()) return
    onChange([...species, { name: newName.trim(), count: 1 }])
    setNewName('')
  }, [newName, species, onChange])

  const updateCount = useCallback(
    (index: number, count: number) => {
      if (count <= 0) {
        onChange(species.filter((_, i) => i !== index))
      } else {
        const updated = [...species]
        updated[index] = { ...updated[index], count }
        onChange(updated)
      }
    },
    [species, onChange],
  )

  const removeSpecies = useCallback(
    (index: number) => {
      onChange(species.filter((_, i) => i !== index))
    },
    [species, onChange],
  )

  return (
    <SectionCard className="p-4">
      <SectionHeader
        icon={<Leaf size={16} />}
        title={activityType === 'tree_planting' ? 'Species Planted' : 'Species'}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
      />

      <AnimatePresence initial={false}>
        {species.map((s, i) => (
          <motion.div
            key={`${s.name}-${i}`}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 rounded-xl bg-emerald-50/60 px-3 py-2.5"
          >
            <Leaf size={13} className="text-emerald-500 shrink-0" />
            <span className="flex-1 text-sm font-medium text-neutral-800 truncate">{s.name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => updateCount(i, s.count - 1)}
                className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 text-base font-bold active:scale-[0.92] transition-transform duration-100 cursor-pointer"
                aria-label={`Decrease ${s.name} count`}
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-bold text-neutral-900">{s.count}</span>
              <button
                type="button"
                onClick={() => updateCount(i, s.count + 1)}
                className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 text-base font-bold active:scale-[0.92] transition-transform duration-100 cursor-pointer"
                aria-label={`Increase ${s.name} count`}
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeSpecies(i)}
              className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-red-400 active:scale-[0.92] transition-all duration-100 cursor-pointer"
              aria-label={`Remove ${s.name}`}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="flex gap-2 mt-1">
        <input
          type="text"
          placeholder="Add species name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSpecies()}
          className="flex-1 rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-[16px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
        />
        <button
          type="button"
          onClick={addSpecies}
          disabled={!newName.trim()}
          className="flex items-center justify-center gap-1.5 px-4 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 active:scale-[0.97] transition-all duration-150 cursor-pointer"
          aria-label="Add species"
        >
          <Plus size={15} />
          Add
        </button>
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Wildlife sighting entry                                            */
/* ------------------------------------------------------------------ */

export interface WildlifeSighting {
  species_name: string
  scientific_name?: string
  count: number
  confidence: 'certain' | 'probable' | 'possible'
  location_approximate?: boolean
}

const CONFIDENCE_OPTIONS: { value: WildlifeSighting['confidence']; label: string; color: string }[] = [
  { value: 'certain', label: 'Certain', color: 'text-emerald-700' },
  { value: 'probable', label: 'Probable', color: 'text-amber-700' },
  { value: 'possible', label: 'Possible', color: 'text-neutral-600' },
]

function WildlifeSightingTracker({
  sightings,
  onChange,
}: {
  sightings: WildlifeSighting[]
  onChange: (sightings: WildlifeSighting[]) => void
}) {
  const [newName, setNewName] = useState('')

  const addSighting = useCallback(() => {
    if (!newName.trim()) return
    onChange([...sightings, { species_name: newName.trim(), count: 1, confidence: 'probable' }])
    setNewName('')
  }, [newName, sightings, onChange])

  const updateSighting = useCallback(
    (index: number, patch: Partial<WildlifeSighting>) => {
      const updated = [...sightings]
      updated[index] = { ...updated[index], ...patch }
      if (patch.count !== undefined && patch.count <= 0) {
        onChange(sightings.filter((_, i) => i !== index))
      } else {
        onChange(updated)
      }
    },
    [sightings, onChange],
  )

  const removeSighting = useCallback(
    (index: number) => {
      onChange(sightings.filter((_, i) => i !== index))
    },
    [sightings, onChange],
  )

  return (
    <SectionCard className="p-4">
      <SectionHeader
        icon={<Bird size={16} />}
        title="Wildlife Sightings"
        iconColor="text-sky-600"
        iconBg="bg-sky-50"
      />

      <AnimatePresence initial={false}>
        {sightings.map((s, i) => (
          <motion.div
            key={`${s.species_name}-${i}`}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 10 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl bg-sky-50/50 border border-sky-100 p-3 space-y-2.5"
          >
            <div className="flex items-center gap-2">
              <Bird size={13} className="text-sky-500 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-neutral-800 truncate">{s.species_name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => updateSighting(i, { count: s.count - 1 })}
                  className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 text-base font-bold active:scale-[0.92] transition-transform duration-100 cursor-pointer"
                  aria-label={`Decrease ${s.species_name} count`}
                >
                  −
                </button>
                <span className="w-7 text-center text-sm font-bold text-neutral-900">{s.count}</span>
                <button
                  type="button"
                  onClick={() => updateSighting(i, { count: s.count + 1 })}
                  className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 text-base font-bold active:scale-[0.92] transition-transform duration-100 cursor-pointer"
                  aria-label={`Increase ${s.species_name} count`}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeSighting(i)}
                className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-red-400 active:scale-[0.92] transition-all duration-100 cursor-pointer"
                aria-label={`Remove ${s.species_name}`}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <select
                  value={s.confidence}
                  onChange={(e) => updateSighting(i, { confidence: e.target.value as WildlifeSighting['confidence'] })}
                  className="appearance-none rounded-lg bg-white border border-sky-200 pl-2.5 pr-7 py-1.5 text-xs font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
                  aria-label={`Confidence for ${s.species_name}`}
                >
                  {CONFIDENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              </div>
              <input
                type="text"
                placeholder="Scientific name (optional)"
                value={s.scientific_name ?? ''}
                onChange={(e) => updateSighting(i, { scientific_name: e.target.value || undefined })}
                className="flex-1 min-w-0 rounded-lg bg-white border border-sky-200 px-2.5 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={s.location_approximate ?? false}
                  onChange={(e) => updateSighting(i, { location_approximate: e.target.checked || undefined })}
                  className="rounded border-sky-300 text-sky-600 focus:ring-sky-400 w-4 h-4"
                />
                Approx. location
              </label>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="flex gap-2 mt-1">
        <input
          type="text"
          placeholder="Add species name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSighting()}
          className="flex-1 rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-[16px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
        />
        <button
          type="button"
          onClick={addSighting}
          disabled={!newName.trim()}
          className="flex items-center justify-center gap-1.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-40 active:scale-[0.97] transition-all duration-150 cursor-pointer"
          aria-label="Add sighting"
        >
          <Plus size={15} />
          Add
        </button>
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Photo section                                                      */
/* ------------------------------------------------------------------ */

function PhotoUploadSection({
  photos,
  onAdd,
  onRemove,
  label,
  uploading,
  progress,
  error,
  failedUploads,
  onRetry,
  onClearFailed,
  isOffline,
  accent = 'neutral',
}: {
  photos: string[]
  onAdd: () => void
  onRemove: (index: number) => void
  label: string
  uploading?: boolean
  progress?: number | null
  error?: string | null
  failedUploads?: { blob: Blob; error: string }[]
  onRetry?: (index: number) => void
  onClearFailed?: (index: number) => void
  isOffline?: boolean
  accent?: 'neutral' | 'amber' | 'emerald'
}) {
  const accentRing = accent === 'amber' ? 'ring-amber-400' : accent === 'emerald' ? 'ring-emerald-400' : 'ring-primary-400'
  const accentBg = accent === 'amber' ? 'bg-amber-500' : accent === 'emerald' ? 'bg-emerald-500' : 'bg-neutral-600'

  return (
    <div className="space-y-2">
      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium">
          <WifiOff size={13} />
          Offline - photos will be queued when you regain signal.
        </div>
      )}

      <div className="-mx-4 lg:-mx-6">
        <div className="flex gap-2.5 overflow-x-auto px-4 lg:px-6 pb-1 scrollbar-none">
          <AnimatePresence initial={false}>
            {photos.map((p, i) => (
              <motion.div
                key={p}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18 }}
                className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 shadow-sm"
              >
                <img src={p} alt={`Photo ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center cursor-pointer active:scale-[0.92] transition-transform duration-100"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X size={11} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {failedUploads?.map((f, i) => (
            <div key={`failed-${i}`} className="relative shrink-0 w-20 h-20 rounded-xl bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-1">
              <AlertTriangle size={15} className="text-red-500" />
              <button
                type="button"
                onClick={() => onRetry?.(i)}
                disabled={uploading || isOffline}
                className="flex items-center gap-1 text-[10px] font-semibold text-red-600 cursor-pointer disabled:opacity-50"
                aria-label={`Retry failed upload ${i + 1}`}
              >
                <RefreshCw size={10} />
                Retry
              </button>
              <button
                type="button"
                onClick={() => onClearFailed?.(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full text-red-400 hover:text-red-600 flex items-center justify-center cursor-pointer"
                aria-label={`Dismiss failed upload ${i + 1}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={onAdd}
            disabled={uploading || isOffline}
            className={cn(
              'shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-neutral-200',
              'flex flex-col items-center justify-center gap-1',
              'text-neutral-400 hover:text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50',
              'cursor-pointer select-none',
              'active:scale-[0.97] transition-all duration-150',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              `focus-visible:ring-2 ${accentRing}`,
            )}
            aria-label="Add photo"
          >
            {uploading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <>
                <Camera size={18} />
                <span className="text-[11px] font-medium">{isOffline ? 'Offline' : 'Add'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <UploadProgress
        progress={progress ?? null}
        uploading={uploading}
        error={error}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Event hero banner                                                  */
/* ------------------------------------------------------------------ */

function EventHeroBanner({
  title,
  activityType,
  checkedInCount,
  registrationCount,
  dateStart,
  dateEnd,
}: {
  title: string
  activityType: string
  checkedInCount: number
  registrationCount: number
  dateStart: string
  dateEnd?: string | null
}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 shadow-sm">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-primary-200 text-xs font-semibold uppercase tracking-widest mb-1">
              {ACTIVITY_TYPE_LABELS[activityType] ?? activityType}
            </p>
            <h2 className="font-heading text-white text-xl font-bold leading-tight">
              {title}
            </h2>
          </div>
          <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5">
            <Users size={13} className="text-white/80" />
            <span className="text-white text-xs font-semibold">
              {checkedInCount} / {registrationCount} checked in
            </span>
          </div>
          {dateEnd && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5">
              <Timer size={13} className="text-white/80" />
              <span className="text-white text-xs font-semibold">
                {getEventDuration(dateStart, dateEnd)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function LogImpactPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { user, profile } = useAuth()
  const { data: event, isLoading: eventLoading } = useEventDetail(eventId)
  const { data: existingImpact, isLoading: impactLoading } = useEventImpact(eventId)
  const { data: attendees } = useEventAttendees(eventId)
  const logImpact = useLogImpact()
  const { isAssistLeader, isLoading: roleLoading } = useCollectiveRole(event?.collective_id)
  const isStaff = profile?.role === 'leader' || profile?.role === 'manager' || profile?.role === 'admin'

  const { validKeys, isPlaceholderData: metricDefsPlaceholder } = useImpactMetricDefs()

  // Load admin-created survey for this event's activity type
  const { data: surveyData, isLoading: surveyLoading } = useEventSurvey(eventId, event?.activity_type)

  // Fetch collective leaders for the "Co-Exist Leader" dropdown
  const { data: collectiveLeaders } = useQuery({
    queryKey: ['collective-leaders', event?.collective_id],
    queryFn: async () => {
      if (!event?.collective_id) return []
      const { data, error } = await supabase
        .from('collective_members')
        .select('profiles(display_name)')
        .eq('collective_id', event.collective_id)
        .in('role', ['leader', 'co_leader', 'assist_leader'])
      if (error) throw error
      type Row = { profiles: { display_name: string | null } | null }
      return ((data ?? []) as unknown as Row[])
        .map((m) => m.profiles?.display_name)
        .filter((name): name is string => !!name)
    },
    enabled: !!event?.collective_id,
    staleTime: 10 * 60 * 1000,
  })

  // Inject "Co-Exist Leader" dropdown before other survey questions
  const surveyQuestions = useMemo(() => {
    const leaderQ = collectiveLeaders && collectiveLeaders.length > 0
      ? [{
          id: 'leader_name',
          text: 'Co-Exist Leader',
          type: 'dropdown' as const,
          required: true,
          options: collectiveLeaders,
        }]
      : []
    const postcodeQ = [{
      id: 'postcode',
      text: 'Postcode',
      type: 'number' as const,
      required: true,
    }]
    return [...leaderQ, ...postcodeQ, ...(surveyData?.questions ?? [])]
  }, [surveyData?.questions, collectiveLeaders])

  // Load existing survey response (for edit pre-fill)
  const { data: existingSurveyResponse } = useQuery({
    queryKey: ['survey-response-leader', surveyData?.surveyId, eventId, user?.id],
    queryFn: async () => {
      if (!surveyData?.surveyId || !eventId || !user) return null
      const { data } = await supabase
        .from('survey_responses')
        .select('answers')
        .eq('survey_id', surveyData.surveyId)
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      return (data?.answers as Record<string, unknown>) ?? null
    },
    enabled: !!surveyData?.surveyId && !!eventId && !!user,
    staleTime: 5 * 60 * 1000,
  })

  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showLeaveSheet, setShowLeaveSheet] = useState(false)
  const [overwriteInfo, setOverwriteInfo] = useState<{ who: string; when: string } | null>(null)
  const [pendingOverwriteResolve, setPendingOverwriteResolve] = useState<((proceed: boolean) => void) | null>(null)

  const { isEditWindowExpired, hoursRemaining: editHoursRemaining } = useMemo(() => {
    if (!existingImpact) return { isEditWindowExpired: false, hoursRemaining: 48 }
    const loggedAt = new Date(existingImpact.logged_at ?? Date.now()).getTime()
    const hoursSince = (Date.now() - loggedAt) / (1000 * 60 * 60)
    return {
      isEditWindowExpired: hoursSince >= 48,
      hoursRemaining: Math.max(0, Math.ceil(48 - hoursSince)),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingImpact?.logged_at])
  const canEdit = !isEditWindowExpired || isStaff

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, unknown>>({})
  const setSurveyAnswer = useCallback((id: string, value: unknown) => {
    setSurveyAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  useEffect(() => {
    if (existingSurveyResponse && Object.keys(surveyAnswers).length === 0) {
      startTransition(() => setSurveyAnswers(existingSurveyResponse))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSurveyResponse])

  // Pre-fill default_value for questions that have one. Mirrors the Microsoft
  // Form behaviour where Issues/Highlights/Grant came pre-filled with "No" so
  // leaders could submit unchanged. Only seeds keys not already in
  // surveyAnswers - never clobbers an existing or pre-loaded answer.
  // See ~/ecodiaos/clients/coexist.md "Sheet sync mapping" doctrine.
  useEffect(() => {
    if (!surveyData?.questions?.length) return
    setSurveyAnswers((prev) => {
      const seeded: Record<string, unknown> = { ...prev }
      let changed = false
      for (const q of surveyData.questions) {
        const dv = (q as unknown as { default_value?: unknown }).default_value
        if (dv !== undefined && seeded[q.id] === undefined) {
          seeded[q.id] = dv
          changed = true
        }
      }
      return changed ? seeded : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyData?.questions])

  const [eventDurationHours, setEventDurationHours] = useState('')
  const [notes, setNotes] = useState('')
  const [species, setSpecies] = useState<SpeciesEntry[]>([])
  const [wildlifeSightings, setWildlifeSightings] = useState<WildlifeSighting[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [beforePhotos, setBeforePhotos] = useState<string[]>([])
  const [afterPhotos, setAfterPhotos] = useState<string[]>([])
  const [drawnArea, setDrawnArea] = useState<Record<string, unknown> | null>(null)

  // Visible-required gate: a question blocks submit only when it IS rendered
  // (show_if matches) AND required AND unanswered. Conditional follow-ups
  // (q1_name, q2 Landcare, q3 OzFish, q7 What-was-collected) that depend on
  // a Yes answer in their parent question stay out of the required check
  // when their parent is No or unanswered.
  const surveyMissingRequired = useMemo(() => {
    return surveyQuestions
      .filter((q) => q.required)
      .filter((q) => isQuestionVisible(q, surveyAnswers))
      .filter((q) => {
        const v = surveyAnswers[q.id]
        if (v === null || v === undefined) return true
        if (typeof v === 'string' && v.trim() === '') return true
        if (Array.isArray(v) && v.length === 0) return true
        return false
      })
      .map((q) => q.id)
  }, [surveyQuestions, surveyAnswers])
  const canSubmitSurvey = surveyMissingRequired.length === 0

  const camera = useCamera()
  const eventPhotosUpload = useImageUpload({ bucket: 'event-images', pathPrefix: 'impact' })
  const beforeUpload = useImageUpload({ bucket: 'event-images', pathPrefix: 'before' })
  const afterUpload = useImageUpload({ bucket: 'event-images', pathPrefix: 'after' })
  const { isOffline } = useOffline()

  const anyPhotoFailed = eventPhotosUpload.hasFailed || beforeUpload.hasFailed || afterUpload.hasFailed
  const anyPhotoUploading = eventPhotosUpload.uploading || beforeUpload.uploading || afterUpload.uploading

  const isDirty = useMemo(() => {
    if (submitted) return false
    return (
      Object.keys(surveyAnswers).length > 0 ||
      photos.length > 0 ||
      beforePhotos.length > 0 ||
      afterPhotos.length > 0 ||
      species.length > 0 ||
      wildlifeSightings.length > 0 ||
      notes.length > 0 ||
      drawnArea !== null
    )
  }, [submitted, surveyAnswers, photos, beforePhotos, afterPhotos, species, wildlifeSightings, notes, drawnArea])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Set when the user confirms Discard - the next popstate is the
  // intentional navigation and must NOT be intercepted (otherwise the
  // sheet re-opens immediately and traps the user on the page).
  // 2026-05-16 Tate feedback: Discard changes was a dead button.
  const isLeavingRef = useRef(false)

  useEffect(() => {
    if (!isDirty) return
    const handlePopState = () => {
      if (isLeavingRef.current) {
        isLeavingRef.current = false
        return
      }
      window.history.pushState(null, '', window.location.href)
      setShowLeaveSheet(true)
    }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isDirty])

  const handleConfirmLeave = useCallback(() => {
    isLeavingRef.current = true
    setShowLeaveSheet(false)
    navigate(-1)
  }, [navigate])

  const handleAddPhoto = async (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    uploader: ReturnType<typeof useImageUpload>,
  ) => {
    if (isOffline) return
    const result = await camera.pickFromGallery()
    if (!result) return
    try {
      const uploaded = await uploader.upload(result.blob)
      setter((prev) => [...prev, uploaded.url])
    } catch {
      // error tracked by hook's failedUploads state
    }
  }

  const handleRetryPhoto = async (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    uploader: ReturnType<typeof useImageUpload>,
    failedIndex: number,
  ) => {
    try {
      const uploaded = await uploader.retry(failedIndex)
      setter((prev) => [...prev, uploaded.url])
    } catch {
      // re-failure tracked by hook
    }
  }

  const checkedInCount = useMemo(
    () => (attendees ?? []).filter((a) => a.status === 'attended').length,
    [attendees],
  )

  // Editable participant count: defaults to live signed-in count but the
  // leader can override (e.g. people came who didn't sign in, or signed in
  // but didn't actually attend). Persisted to event_impact.attendees on
  // save. Hours math uses this value, not the raw checkedInCount.
  // Tate, 4 May 2026 18:39 AEST: "just make sure that the numbe of attendees
  // defalts to total signed in for that event, but is still editable."
  const [attendeesValue, setAttendeesValue] = useState<string>('')
  const [attendeesOverridden, setAttendeesOverridden] = useState(false)

  useEffect(() => {
    if (existingImpact) {
      startTransition(() => {
        setNotes(existingImpact.notes ?? '')
        const cm = existingImpact.custom_metrics as Record<string, unknown> | null
        if (cm) {
          if (Array.isArray(cm.species)) setSpecies(cm.species as SpeciesEntry[])
          if (Array.isArray(cm.photos)) setPhotos(cm.photos as string[])
          if (Array.isArray(cm.before_photos)) setBeforePhotos(cm.before_photos as string[])
          if (Array.isArray(cm.after_photos)) setAfterPhotos(cm.after_photos as string[])
          if (Array.isArray(cm.wildlife_sightings_detail)) setWildlifeSightings(cm.wildlife_sightings_detail as WildlifeSighting[])
          if (cm.drawn_area && typeof cm.drawn_area === 'object') setDrawnArea(cm.drawn_area as Record<string, unknown>)
        }
        // Prefer existingImpact.attendees (the saved value, possibly an override).
        // Fall back to checkedInCount if no row yet. Only derive duration from
        // attendees if non-zero to avoid divide-by-zero on legacy rows.
        const savedAttendees = existingImpact.attendees ?? null
        const effectiveCount = savedAttendees && savedAttendees > 0 ? savedAttendees : checkedInCount
        setAttendeesValue(String(effectiveCount))
        if (savedAttendees != null && savedAttendees !== checkedInCount) {
          setAttendeesOverridden(true)
        }
        if (existingImpact.hours_total && effectiveCount > 0) {
          setEventDurationHours(String(Math.round((existingImpact.hours_total / effectiveCount) * 10) / 10))
        }
      })
    }
  }, [existingImpact, checkedInCount])

  // Sync attendeesValue to checkedInCount when there's no existing impact row
  // and the leader hasn't manually overridden. Keeps the default in step with
  // last-second check-ins right up until they tap into the input.
  useEffect(() => {
    if (existingImpact) return
    if (attendeesOverridden) return
    setAttendeesValue(String(checkedInCount))
  }, [checkedInCount, existingImpact, attendeesOverridden])

  useEffect(() => {
    if (event?.date_end && !existingImpact) {
      startTransition(() => {
        const durationHours =
          (new Date(event.date_end!).getTime() - new Date(event.date_start).getTime()) /
          (1000 * 60 * 60)
        setEventDurationHours(String(Math.round(durationHours * 10) / 10))
      })
    }
  }, [event, existingImpact])

  const finalAttendeeCount = useMemo(() => {
    const parsed = parseInt(attendeesValue, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }, [attendeesValue])

  const computedHoursTotal = useMemo(() => {
    const duration = parseFloat(eventDurationHours) || 0
    return Math.round(duration * finalAttendeeCount * 10) / 10
  }, [eventDurationHours, finalAttendeeCount])

  const activityType = event?.activity_type

  const handleSubmit = useCallback(async () => {
    if (!eventId || !user || isSubmitting) return
    setIsSubmitting(true)

    try {
      if (!existingImpact) {
        const { data: freshImpact, error: freshErr } = await supabase
          .from('event_impact')
          .select('logged_by, logged_at, profiles:logged_by(display_name)')
          .eq('event_id', eventId)
          .maybeSingle()
        if (freshErr) throw freshErr
        if (freshImpact) {
          const who = (freshImpact.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Another leader'
          const when = freshImpact.logged_at
            ? new Date(freshImpact.logged_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
            : 'just now'
          const proceed = await new Promise<boolean>((resolve) => {
            setOverwriteInfo({ who, when })
            setPendingOverwriteResolve(() => resolve)
          })
          if (!proceed) {
            setIsSubmitting(false)
            return
          }
        }
      }

      if (surveyData?.surveyId && surveyQuestions.length > 0) {
        // Check for existing response first (unique index uses COALESCE so standard upsert onConflict won't work)
        const { data: existingResp, error: existingRespErr } = await supabase
          .from('survey_responses')
          .select('id')
          .eq('survey_id', surveyData.surveyId)
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (existingRespErr) throw existingRespErr

        if (existingResp) {
          const { error: updErr } = await supabase
            .from('survey_responses')
            .update({ answers: surveyAnswers as unknown as Json, updated_at: new Date().toISOString() })
            .eq('id', existingResp.id)
          if (updErr) throw updErr
        } else {
          const { error: insErr } = await supabase
            .from('survey_responses')
            .insert({
              survey_id: surveyData.surveyId,
              event_id: eventId,
              user_id: user.id,
              answers: surveyAnswers as unknown as Json,
            })
          if (insErr) throw insErr
        }

        await syncSurveyImpact(eventId, surveyQuestions, surveyAnswers as Record<string, Json>, user.id, metricDefsPlaceholder ? undefined : validKeys)
      }

      const { data: postSyncImpact, error: postSyncErr } = await supabase
        .from('event_impact')
        .select('trees_planted, rubbish_kg, area_restored_sqm, native_plants, wildlife_sightings, invasive_weeds_pulled, coastline_cleaned_m, custom_metrics')
        .eq('event_id', eventId)
        .maybeSingle()
      if (postSyncErr) throw postSyncErr

      const customMetricsPayload: Record<string, unknown> = {
        species: species.length > 0 ? species : undefined,
        wildlife_sightings_detail: wildlifeSightings.length > 0 ? wildlifeSightings : undefined,
        photos: photos.length > 0 ? photos : undefined,
        before_photos: beforePhotos.length > 0 ? beforePhotos : undefined,
        after_photos: afterPhotos.length > 0 ? afterPhotos : undefined,
        drawn_area: drawnArea ?? undefined,
      }
      const leaderSections = Object.fromEntries(
        Object.entries(customMetricsPayload).filter(([, v]) => v !== undefined),
      )

      const existingCm = { ...(postSyncImpact?.custom_metrics as Record<string, unknown>) ?? {} }
      for (const key of ['species', 'wildlife_sightings_detail', 'photos', 'before_photos', 'after_photos', 'drawn_area']) {
        delete existingCm[key]
      }
      const mergedCustom = { ...existingCm, ...leaderSections }

      await logImpact.mutateAsync({
        event_id: eventId,
        hours_total: computedHoursTotal,
        attendees: finalAttendeeCount,
        notes: notes || null,
        custom_metrics: mergedCustom as unknown as Json,
        trees_planted: postSyncImpact?.trees_planted ?? null,
        rubbish_kg: postSyncImpact?.rubbish_kg ?? null,
        area_restored_sqm: postSyncImpact?.area_restored_sqm ?? null,
        native_plants: postSyncImpact?.native_plants ?? null,
        wildlife_sightings: wildlifeSightings.length > 0
          ? wildlifeSightings.reduce((sum, s) => sum + s.count, 0)
          : postSyncImpact?.wildlife_sightings ?? null,
        invasive_weeds_pulled: postSyncImpact?.invasive_weeds_pulled ?? null,
        coastline_cleaned_m: postSyncImpact?.coastline_cleaned_m ?? null,
      })

      queryClient.invalidateQueries({ queryKey: ['survey-response'] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })

      setSubmitted(true)
    } catch (err) {
      // Previously this whole block had no catch - a failed upsert or network
      // error silently returned the form with no indication anything was wrong,
      // so leaders would re-submit or assume it saved. Now surface it.
      console.error('Failed to log impact:', err)
      const msg = err instanceof Error ? err.message : 'Failed to save impact'
      toast.error(`Could not save impact - ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }, [eventId, user, isSubmitting, existingImpact, surveyData, surveyQuestions, surveyAnswers, species, wildlifeSightings, photos, beforePhotos, afterPhotos, drawnArea, logImpact, computedHoursTotal, finalAttendeeCount, notes, queryClient, validKeys, metricDefsPlaceholder, toast])

  const isLoading = eventLoading || impactLoading || roleLoading || surveyLoading
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Log Impact" back />}>
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
      <Page swipeBack header={<Header title="Log Impact" back />}>
        <EmptyState
          illustration="error"
          title="Event not found"
          description="Could not find this event."
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  if (!isAssistLeader && !isStaff) {
    return (
      <Page swipeBack header={<Header title="Log Impact" back />}>
        <EmptyState
          illustration="error"
          title="Leader access only"
          description="Impact logging is available to event leaders and assist-leaders."
          action={{ label: 'View Event', onClick: () => navigate(`/events/${eventId}`) }}
        />
      </Page>
    )
  }

  // Success state
  if (submitted) {
    return (
      <Page swipeBack header={<Header title="Impact Logged" back />}>
        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
        >
          <motion.div
            initial={shouldReduceMotion ? undefined : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1, type: 'spring', stiffness: 200 }}
            className="relative w-20 h-20 mb-5"
          >
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-primary-100 flex items-center justify-center">
              <CheckCircle2 size={36} className="text-primary-600" />
            </div>
          </motion.div>

          <h2 className="font-heading text-2xl font-bold text-neutral-900">
            Impact Logged!
          </h2>
          <p className="text-neutral-500 mt-2 max-w-xs text-sm leading-relaxed">
            Your event's conservation impact has been recorded. Thank you
            for making a difference.
          </p>

          <div className="mt-6 w-full max-w-xs">
            <WhatsNext
              suggestions={[
                {
                  label: 'View Event',
                  description: 'See the completed event details',
                  icon: <CheckCircle2 size={18} />,
                  to: `/events/${event.id}`,
                },
                {
                  label: 'View Impact Dashboard',
                  description: 'See your collective impact grow',
                  icon: <TreePine size={18} />,
                  to: '/profile',
                },
                {
                  label: 'My Events',
                  description: 'Browse your upcoming events',
                  icon: <Calendar size={18} />,
                  to: '/events',
                },
              ]}
            />
          </div>
        </motion.div>
      </Page>
    )
  }

  return (
    <Page
      swipeBack
      header={<Header title="Log Impact" back />}
      footer={
        <div className="space-y-2">
          {anyPhotoFailed && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
              <AlertTriangle size={14} />
              Some photos failed to upload - retry or dismiss them first.
            </div>
          )}
          {anyPhotoUploading && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium">
              <RefreshCw size={14} className="animate-spin" />
              Photo upload in progress…
            </div>
          )}
          {!canSubmitSurvey && (
            <div className="px-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium">
              Answer the required questions above before submitting.
            </div>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Save size={18} />}
            loading={isSubmitting || logImpact.isPending}
            disabled={!canEdit || isSubmitting || anyPhotoFailed || anyPhotoUploading || !canSubmitSurvey}
            onClick={handleSubmit}
          >
            {existingImpact ? 'Update Impact' : 'Submit Impact'}
          </Button>
        </div> as React.ReactNode
      }
    >
      <motion.div
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
        className="pt-4 pb-8 space-y-4"
      >
        {/* Event hero */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <EventHeroBanner
            title={event.title}
            activityType={event.activity_type}
            checkedInCount={checkedInCount}
            registrationCount={event.registration_count}
            dateStart={event.date_start}
            dateEnd={event.date_end}
          />
        </motion.div>

        {/* Edit window banners */}
        {existingImpact && isEditWindowExpired && !isStaff && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
            <Clock size={15} className="shrink-0" />
            The 48-hour edit window has passed. Contact a national admin to make changes.
          </motion.div>
        )}
        {existingImpact && !isEditWindowExpired && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 text-sm font-medium">
            <Clock size={15} className="shrink-0" />
            Editing existing data - {editHoursRemaining}h left to update.
          </motion.div>
        )}

        {/* Volunteer hours */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <SectionCard className="p-4">
            <SectionHeader
              icon={<Clock size={16} />}
              title="Volunteer Hours"
              iconColor="text-violet-600"
              iconBg="bg-violet-50"
            />

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-neutral-500 font-medium mb-1.5">
                  Event duration
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={eventDurationHours}
                    onChange={(e) => setEventDurationHours(e.target.value)}
                    placeholder="0"
                    className="w-24 rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-[16px] text-right font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                    min="0"
                    step="0.5"
                  />
                  <span className="text-sm text-neutral-500 font-medium">hours</span>
                </div>
              </div>

              <div className="h-12 w-px bg-neutral-100" />

              <div className="flex-1">
                <label className="block text-xs text-neutral-500 font-medium mb-1.5">
                  Participants
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={attendeesValue}
                    onChange={(e) => {
                      setAttendeesValue(e.target.value)
                      setAttendeesOverridden(true)
                    }}
                    placeholder={String(checkedInCount)}
                    className="w-20 rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-[16px] text-right font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                    min="0"
                    step="1"
                  />
                  <span className="text-sm text-neutral-500 font-medium">people</span>
                </div>
                {attendeesOverridden && finalAttendeeCount !== checkedInCount && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttendeesValue(String(checkedInCount))
                      setAttendeesOverridden(false)
                    }}
                    className="mt-1 text-[11px] text-violet-600 font-medium hover:underline"
                  >
                    Reset to {checkedInCount} signed in
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50">
              <span className="text-xs text-violet-700">
                <span className="font-bold">{eventDurationHours || '0'} hrs</span>
                <span className="text-violet-400 mx-1.5">×</span>
                <span className="font-bold">{finalAttendeeCount} {finalAttendeeCount === 1 ? 'person' : 'people'}</span>
                <span className="text-violet-400 mx-1.5">=</span>
                <span className="font-bold">{computedHoursTotal} volunteer hours</span>
              </span>
            </div>

            {finalAttendeeCount === 0 && (
              <p className="mt-2 text-xs text-amber-600 font-medium">
                No participants yet - check in on the Event Day page or enter the count above.
              </p>
            )}

            {attendeesOverridden && finalAttendeeCount !== checkedInCount && (
              <p className="mt-2 text-xs text-neutral-500">
                {checkedInCount} signed in via the app, you've set {finalAttendeeCount} total.
              </p>
            )}
          </SectionCard>
        </motion.div>

        {/* Survey questions */}
        {surveyQuestions.length > 0 && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SectionCard className="p-4">
              <SectionHeader
                icon={<ClipboardList size={16} />}
                title={surveyData?.title ?? 'Impact Survey'}
                iconColor="text-primary-600"
                iconBg="bg-primary-50"
              />
              <SurveyQuestionRenderer
                questions={surveyQuestions}
                answers={surveyAnswers}
                setAnswer={setSurveyAnswer}
                numbered={false}
              />
            </SectionCard>
          </motion.div>
        )}

        {!surveyLoading && surveyQuestions.length === 0 && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-neutral-50 border border-neutral-100 text-neutral-500 text-sm">
            <ClipboardList size={15} className="shrink-0" />
            No custom impact questions for this event type.
          </motion.div>
        )}

        {/* Species tracking */}
        {(activityType === 'tree_planting' || activityType === 'ecosystem_restoration') && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SpeciesTracker species={species} onChange={setSpecies} activityType={activityType} />
          </motion.div>
        )}

        {/* Wildlife sightings */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <WildlifeSightingTracker sightings={wildlifeSightings} onChange={setWildlifeSightings} />
        </motion.div>

        {/* Event photos */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <SectionCard className="p-4">
            <SectionHeader
              icon={<Camera size={16} />}
              title="Event Photos"
              iconColor="text-neutral-600"
              iconBg="bg-neutral-100"
            />
            <PhotoUploadSection
              photos={photos}
              onAdd={() => handleAddPhoto(setPhotos, eventPhotosUpload)}
              onRemove={(i) => setPhotos((p) => p.filter((_, idx) => idx !== i))}
              label="Event Photos"
              uploading={eventPhotosUpload.uploading}
              progress={eventPhotosUpload.progress}
              error={eventPhotosUpload.error}
              failedUploads={eventPhotosUpload.failedUploads}
              onRetry={(i) => handleRetryPhoto(setPhotos, eventPhotosUpload, i)}
              onClearFailed={(i) => eventPhotosUpload.clearFailed(i)}
              isOffline={isOffline}
            />
          </SectionCard>
        </motion.div>

        {/* Before / After photos */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <SectionCard className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-neutral-100">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Before</span>
                </div>
                <PhotoUploadSection
                  photos={beforePhotos}
                  onAdd={() => handleAddPhoto(setBeforePhotos, beforeUpload)}
                  onRemove={(i) => setBeforePhotos((p) => p.filter((_, idx) => idx !== i))}
                  label="Before"
                  uploading={beforeUpload.uploading}
                  progress={beforeUpload.progress}
                  error={beforeUpload.error}
                  failedUploads={beforeUpload.failedUploads}
                  onRetry={(i) => handleRetryPhoto(setBeforePhotos, beforeUpload, i)}
                  onClearFailed={(i) => beforeUpload.clearFailed(i)}
                  isOffline={isOffline}
                  accent="amber"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">After</span>
                </div>
                <PhotoUploadSection
                  photos={afterPhotos}
                  onAdd={() => handleAddPhoto(setAfterPhotos, afterUpload)}
                  onRemove={(i) => setAfterPhotos((p) => p.filter((_, idx) => idx !== i))}
                  label="After"
                  uploading={afterUpload.uploading}
                  progress={afterUpload.progress}
                  error={afterUpload.error}
                  failedUploads={afterUpload.failedUploads}
                  onRetry={(i) => handleRetryPhoto(setAfterPhotos, afterUpload, i)}
                  onClearFailed={(i) => afterUpload.clearFailed(i)}
                  isOffline={isOffline}
                  accent="emerald"
                />
              </div>
            </div>
          </SectionCard>
        </motion.div>

        {/* GPS area map */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <SectionCard className="overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <SectionHeader
                icon={<MapPin size={16} />}
                title="Area Worked"
                iconColor="text-rose-600"
                iconBg="bg-rose-50"
              />
            </div>
            <Suspense fallback={<Skeleton className="aspect-[16/10] rounded-none" />}>
              <MapView
                mode="draw"
                center={parseLocationPoint(event.location_point) ?? undefined}
                zoom={15}
                aria-label="Draw the area you worked on"
                className="aspect-[16/10]"
                onAreaChange={(geojson) => setDrawnArea(geojson as Record<string, unknown> | null)}
              />
            </Suspense>
          </SectionCard>
        </motion.div>

        {/* Notes */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <SectionCard className="p-4">
            <SectionHeader
              icon={<ClipboardList size={16} />}
              title="Notes"
              iconColor="text-neutral-500"
              iconBg="bg-neutral-100"
            />
            <Input
              type="textarea"
              placeholder="Any observations, challenges, or highlights from the event..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </SectionCard>
        </motion.div>
      </motion.div>

      <ConfirmationSheet
        open={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        onConfirm={handleConfirmLeave}
        title="Leave without saving?"
        description="You have unsaved impact data that will be lost."
        confirmLabel="Discard changes"
        variant="warning"
      />

      <ConfirmationSheet
        open={!!overwriteInfo}
        onClose={() => {
          pendingOverwriteResolve?.(false)
          setOverwriteInfo(null)
          setPendingOverwriteResolve(null)
        }}
        onConfirm={() => {
          pendingOverwriteResolve?.(true)
          setOverwriteInfo(null)
          setPendingOverwriteResolve(null)
        }}
        title="Impact already logged"
        description={
          overwriteInfo
            ? `${overwriteInfo.who} already logged impact for this event (${overwriteInfo.when}). Replace their submission?`
            : ''
        }
        confirmLabel="Replace"
        variant="warning"
      />
    </Page>
  )
}
