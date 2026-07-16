import { useState, useMemo, useRef, useEffect, startTransition } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { formatRole } from '@/lib/labels-and-enums'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    Plus,
    ClipboardCheck,
    Calendar,
    CalendarDays,
    CalendarClock,
    Repeat,
    CircleDot,
    Paperclip,
    Upload,
    FileText,
    Info,
    X,
    Trash2,
    Pencil,
    BarChart3,
    AlertTriangle,
    CheckCircle,
    Target,
    Zap,
    Sparkles,
    Users,
    User,
    UserCheck,
    ClipboardList,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { SearchBar } from '@/components/search-bar'
import { Dropdown } from '@/components/dropdown'
import { BottomSheet } from '@/components/bottom-sheet'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { TabBar } from '@/components/tab-bar'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useFileUpload } from '@/hooks/use-file-upload'
import {
    useAdminTaskTemplates,
    useAdminCreateTemplate,
    useAdminUpdateTemplate,
    useAdminToggleTemplate,
    useAdminDeleteTemplate,
    useAdminKpiDashboard,
    formatSchedule,
    TASK_CATEGORIES,
    CATEGORY_COLORS,
    type TaskTemplate,
} from '@/hooks/use-admin-tasks'
import {
    useTimelineRule,
    useUpsertTimelineRule,
    useDeleteTimelineRule,
    buildDisplayLabel,
    type TimelineAnchor,
} from '@/hooks/use-timeline-rules'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function useAllCollectives() {
  return useQuery({
    queryKey: ['admin-all-collectives-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name, slug, state')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useAssignableStaff() {
  return useQuery({
    queryKey: ['admin-assignable-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .neq('role', 'participant')
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useAllSurveys() {
  return useQuery({
    queryKey: ['admin-all-surveys-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title')
        .order('title')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

const scheduleTypeOptions = [
  { value: '', label: 'All Schedules' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'event_relative', label: 'Event Relative' },
  { value: 'once', label: 'One-time' },
]

const scopeOptions = [
  { value: 'all', label: 'All Scopes' },
  { value: 'global', label: 'Global (All Collectives)' },
]

const assigneeRoleOptions = [
  { value: 'assist_leader', label: 'Assistant Leader+' },
  { value: 'co_leader', label: 'Co-Leader+' },
  { value: 'leader', label: 'Leader Only' },
]

const dayOfWeekOptions = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const dayOfMonthOptions = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))

const SCHEDULE_ICONS: Record<string, typeof Calendar> = {
  weekly: Repeat,
  monthly: CalendarDays,
  event_relative: CalendarClock,
  once: CircleDot,
}

const ACTIVITY_TYPE_OPTIONS = [
  { value: '', label: 'Any event type' },
  { value: 'clean_up', label: 'Clean Up' },
  { value: 'tree_planting', label: 'Tree Planting' },
  { value: 'ecosystem_restoration', label: 'Ecosystem Restoration' },
  { value: 'nature_hike', label: 'Nature Hike' },
  { value: 'camp_out', label: 'Camp Out' },
  { value: 'spotlighting', label: 'Spotlighting' },
  { value: 'other', label: 'Other' },
]

const ANCHOR_OPTIONS: { value: TimelineAnchor; label: string; description: string }[] = [
  { value: 'next_event', label: 'Any event', description: 'Triggers for upcoming events regardless of type' },
  { value: 'next_event_of_type', label: 'Specific event type', description: 'Only triggers for a specific activity type' },
  { value: 'event_series', label: 'Event series', description: 'Only triggers for events in a specific series' },
]

const tabs = [
  { id: 'templates', label: 'Templates', icon: <ClipboardCheck data-eos-id="src/pages/admin/workflows.tsx#0" size={14} /> },
  { id: 'kpi', label: 'KPI Dashboard', icon: <BarChart3 data-eos-id="src/pages/admin/workflows.tsx#1" size={14} /> },
]

/* ------------------------------------------------------------------ */
/*  Dynamic Timeline Builder                                           */
/* ------------------------------------------------------------------ */

function DynamicTimelineBuilder({
  anchor,
  setAnchor,
  activityTypeFilter,
  setActivityTypeFilter,
  offsetDays,
  setOffsetDays,
  lookaheadDays,
  setLookaheadDays,
  matchAllEvents,
  setMatchAllEvents,
}: {
  anchor: TimelineAnchor
  setAnchor: (v: TimelineAnchor) => void
  activityTypeFilter: string
  setActivityTypeFilter: (v: string) => void
  offsetDays: string
  setOffsetDays: (v: string) => void
  lookaheadDays: string
  setLookaheadDays: (v: string) => void
  matchAllEvents: boolean
  setMatchAllEvents: (v: boolean) => void
}) {
  const offsetNum = parseInt(offsetDays) || 0
  const previewLabel = buildDisplayLabel({
    anchor,
    offset_days: offsetNum,
    activity_type_filter: activityTypeFilter || null,
    match_all_events: matchAllEvents,
  })

  return (
    <div data-eos-id="src/pages/admin/workflows.tsx#2" className="space-y-3">
      {/* Natural language preview */}
      <div data-eos-id="src/pages/admin/workflows.tsx#3" className="rounded-sm bg-white border border-neutral-100 px-4 py-3">
        <div data-eos-id="src/pages/admin/workflows.tsx#4" className="flex items-start gap-2.5">
          <Sparkles data-eos-id="src/pages/admin/workflows.tsx#5" size={15} className="text-primary-500 mt-0.5 shrink-0" />
          <div data-eos-id="src/pages/admin/workflows.tsx#6" className="flex-1 min-w-0">
            <p data-eos-id="src/pages/admin/workflows.tsx#7" className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-0.5">Auto-calculated deadline</p>
            <p data-eos-id="src/pages/admin/workflows.tsx#8" className="text-sm font-semibold text-neutral-900">{previewLabel}</p>
            <p data-eos-id="src/pages/admin/workflows.tsx#9" className="text-[11px] text-neutral-400 mt-1">
              Each collective gets a personalised due date based on their own events
            </p>
          </div>
        </div>
      </div>

      {/* Anchor selection */}
      <div data-eos-id="src/pages/admin/workflows.tsx#10">
        <p data-eos-id="src/pages/admin/workflows.tsx#11" className="text-sm font-medium text-neutral-900 mb-2">Anchor to</p>
        <div data-eos-id="src/pages/admin/workflows.tsx#12" className="space-y-1.5">
          {ANCHOR_OPTIONS.map((opt) => (
            <button data-eos-id="src/pages/admin/workflows.tsx#13"
              key={opt.value}
              type="button"
              onClick={() => setAnchor(opt.value)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-sm transition-colors cursor-pointer',
                anchor === opt.value
                  ? 'bg-primary-100 border border-neutral-200'
                  : 'bg-white border border-neutral-100 hover:bg-neutral-50',
              )}
            >
              <p data-eos-id="src/pages/admin/workflows.tsx#14" data-eos-var="opt.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" className={cn(
                'text-sm font-medium',
                anchor === opt.value ? 'text-primary-700' : 'text-neutral-600',
              )}>
                {opt.label}
              </p>
              <p data-eos-id="src/pages/admin/workflows.tsx#15" data-eos-var="opt.description" data-eos-var-label="Description" data-eos-var-scope="item" data-eos-var-src="literal" className="text-[11px] text-neutral-400 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Activity type filter (only for next_event_of_type) */}
      {anchor === 'next_event_of_type' && (
        <Dropdown data-eos-id="src/pages/admin/workflows.tsx#16"
          options={ACTIVITY_TYPE_OPTIONS}
          value={activityTypeFilter}
          onChange={setActivityTypeFilter}
          label="Event Type"
        />
      )}

      {/* Offset */}
      <div data-eos-id="src/pages/admin/workflows.tsx#17">
        <p data-eos-id="src/pages/admin/workflows.tsx#18" className="text-sm font-medium text-neutral-900 mb-2">Timing</p>
        <div data-eos-id="src/pages/admin/workflows.tsx#19" className="flex items-center gap-2">
          <Input data-eos-id="src/pages/admin/workflows.tsx#20"
            type="number"
            value={offsetDays}
            onChange={(e) => setOffsetDays(e.target.value)}
            className="w-24"
          />
          <p data-eos-id="src/pages/admin/workflows.tsx#21" data-eos-var="Math.abs" data-eos-var-label="Abs" data-eos-var-scope="prop" className="text-sm text-neutral-600">
            day{Math.abs(offsetNum) !== 1 ? 's' : ''}{' '}
            {offsetNum < 0 ? 'before' : offsetNum > 0 ? 'after' : 'on the day of'}{' '}
            the event
          </p>
        </div>
        <p data-eos-id="src/pages/admin/workflows.tsx#22" className="text-[11px] text-neutral-400 mt-1">
          Use negative numbers for before (e.g. -3), positive for after (e.g. 7)
        </p>
      </div>

      {/* Advanced options */}
      <div data-eos-id="src/pages/admin/workflows.tsx#23" className="space-y-3 pt-1">
        <div data-eos-id="src/pages/admin/workflows.tsx#24" className="flex items-center justify-between">
          <div data-eos-id="src/pages/admin/workflows.tsx#25">
            <p data-eos-id="src/pages/admin/workflows.tsx#26" className="text-sm font-medium text-neutral-700">Apply to all upcoming events</p>
            <p data-eos-id="src/pages/admin/workflows.tsx#27" className="text-[11px] text-neutral-400">
              {matchAllEvents
                ? 'Creates a task for every matching event in the lookahead window'
                : 'Only creates a task for the next matching event'}
            </p>
          </div>
          <Toggle data-eos-id="src/pages/admin/workflows.tsx#28" checked={matchAllEvents} onChange={setMatchAllEvents} />
        </div>

        <div data-eos-id="src/pages/admin/workflows.tsx#29">
          <Input data-eos-id="src/pages/admin/workflows.tsx#30"
            label="Lookahead window (days)"
            type="number"
            value={lookaheadDays}
            onChange={(e) => setLookaheadDays(e.target.value)}
            placeholder="60"
          />
          <p data-eos-id="src/pages/admin/workflows.tsx#31" className="text-[11px] text-neutral-400 mt-1">
            How far ahead to search for events (default 60 days)
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Template Create/Edit Modal                                         */
/* ------------------------------------------------------------------ */

function TemplateModal({
  open,
  onClose,
  template,
  collectives,
  surveys,
  staffUsers,
}: {
  open: boolean
  onClose: () => void
  template?: TaskTemplate | null
  collectives: { id: string; name: string; state: string | null }[]
  surveys: { id: string; title: string }[]
  staffUsers: { id: string; display_name: string | null; avatar_url: string | null; role: string | null }[]
}) {
  const { toast } = useToast()
  const createMutation = useAdminCreateTemplate()
  const updateMutation = useAdminUpdateTemplate()
  const upsertRuleMutation = useUpsertTimelineRule()
  const deleteRuleMutation = useDeleteTimelineRule()
  const fileUpload = useFileUpload({ bucket: 'task-attachments', pathPrefix: 'templates' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? 'general')
  const [scheduleType, setScheduleType] = useState(template?.schedule_type ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState(String(template?.day_of_week ?? 1))
  const [dayOfMonth, setDayOfMonth] = useState(String(template?.day_of_month ?? 1))
  const [eventOffsetDays, setEventOffsetDays] = useState(String(template?.event_offset_days ?? -3))
  const [assigneeRole, setAssigneeRole] = useState(template?.assignee_role ?? 'assist_leader')
  const [assignmentMode, setAssignmentMode] = useState<'collective' | 'individual' | 'assigned'>(template?.assignment_mode ?? 'collective')
  const [assignedToUserId, setAssignedToUserId] = useState(template?.assigned_to_user_id ?? '')
  const [collectiveId, setCollectiveId] = useState(template?.collective_id ?? '')
  const [sortOrder, setSortOrder] = useState(String(template?.sort_order ?? 0))
  const [attachmentUrl, setAttachmentUrl] = useState(template?.attachment_url ?? '')
  const [attachmentLabel, setAttachmentLabel] = useState(template?.attachment_label ?? '')
  const [surveyId, setSurveyId] = useState(template?.survey_id ?? '')

  // Dynamic timeline state
  const [useDynamicTimeline, setUseDynamicTimeline] = useState(!!(template?.use_dynamic_timeline))
  const [tlAnchor, setTlAnchor] = useState<TimelineAnchor>('next_event')
  const [tlActivityTypeFilter, setTlActivityTypeFilter] = useState('')
  const [tlOffsetDays, setTlOffsetDays] = useState('-3')
  const [tlLookaheadDays, setTlLookaheadDays] = useState('60')
  const [tlMatchAllEvents, setTlMatchAllEvents] = useState(false)

  // Load existing timeline rule for edits
  const { data: existingRule } = useTimelineRule(template?.id)
  useEffect(() => {
    if (existingRule) {
      startTransition(() => {
        setUseDynamicTimeline(true)
        setTlAnchor(existingRule.anchor)
        setTlActivityTypeFilter(existingRule.activity_type_filter ?? '')
        setTlOffsetDays(String(existingRule.offset_days))
        setTlLookaheadDays(String(existingRule.lookahead_days))
        setTlMatchAllEvents(existingRule.match_all_events)
      })
    }
  }, [existingRule])

  const isEdit = !!template

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await fileUpload.upload(file)
      setAttachmentUrl(result.url)
      setAttachmentLabel(result.fileName)
      toast.success('File uploaded')
    } catch {
      toast.error(fileUpload.error || 'Upload failed')
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const collectiveOptions = useMemo(() => [
    { value: '', label: 'All Collectives (Global)' },
    ...collectives.map((c) => ({ value: c.id, label: `${c.name}${c.state ? ` (${c.state})` : ''}` })),
  ], [collectives])

  const handleSave = () => {
    const isDynamic = scheduleType === 'event_relative' && useDynamicTimeline
    const input = {
      title: title.trim(),
      description: description.trim() || undefined,
      collective_id: collectiveId || null,
      category,
      schedule_type: scheduleType,
      day_of_week: scheduleType === 'weekly' ? parseInt(dayOfWeek) : null,
      day_of_month: scheduleType === 'monthly' ? parseInt(dayOfMonth) : null,
      event_offset_days: scheduleType === 'event_relative' ? parseInt(isDynamic ? tlOffsetDays : eventOffsetDays) : null,
      assignee_role: assigneeRole,
      assignment_mode: assignmentMode,
      assigned_to_user_id: assignmentMode === 'assigned' ? (assignedToUserId || null) : null,
      sort_order: parseInt(sortOrder) || 0,
      attachment_url: attachmentUrl.trim() || null,
      attachment_label: attachmentLabel.trim() || null,
      use_dynamic_timeline: isDynamic,
      survey_id: surveyId || null,
    }

    const saveTimelineRule = (templateId: string) => {
      if (isDynamic) {
        upsertRuleMutation.mutate({
          template_id: templateId,
          anchor: tlAnchor,
          activity_type_filter: tlAnchor === 'next_event_of_type' ? tlActivityTypeFilter || null : null,
          offset_days: parseInt(tlOffsetDays) || -3,
          lookahead_days: parseInt(tlLookaheadDays) || 60,
          match_all_events: tlMatchAllEvents,
        })
      } else if (isEdit) {
        // If turning off dynamic timeline on an existing template, clean up the rule
        deleteRuleMutation.mutate(template.id)
      }
    }

    if (isEdit) {
      updateMutation.mutate(
        { id: template.id, ...input },
        {
          onSuccess: () => {
            saveTimelineRule(template.id)
            toast.success('Template updated')
            onClose()
          },
          onError: () => toast.error('Failed to update template'),
        },
      )
    } else {
      createMutation.mutate(
        input,
        {
          onSuccess: (created) => {
            saveTimelineRule(created.id)
            toast.success('Template created')
            onClose()
          },
          onError: () => toast.error('Failed to create template'),
        },
      )
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/admin/workflows.tsx#32" open={open} onClose={onClose}>
      {/* Header */}
      <div data-eos-id="src/pages/admin/workflows.tsx#33" className="flex items-center justify-between mb-4">
        <h2 data-eos-id="src/pages/admin/workflows.tsx#34" className="font-heading text-lg font-semibold text-neutral-900">{isEdit ? 'Edit Template' : 'Create Task Template'}</h2>
        <button data-eos-id="src/pages/admin/workflows.tsx#35"
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X data-eos-id="src/pages/admin/workflows.tsx#36" size={20} />
        </button>
      </div>
      <div data-eos-id="src/pages/admin/workflows.tsx#37" className="space-y-4">
        <Input data-eos-id="src/pages/admin/workflows.tsx#38"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Post pre-event Instagram reel"
          required
        />
        <Input data-eos-id="src/pages/admin/workflows.tsx#39"
          label="Description"
          type="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Instructions or details for this task..."
        />
        {/* Assignment mode - placed before scope/category so conditional fields make sense */}
        <div data-eos-id="src/pages/admin/workflows.tsx#40">
          <p data-eos-id="src/pages/admin/workflows.tsx#41" className="text-sm font-medium text-neutral-900 mb-2">Completion Mode</p>
          <div data-eos-id="src/pages/admin/workflows.tsx#42" className="flex gap-2">
            <button data-eos-id="src/pages/admin/workflows.tsx#43"
              type="button"
              onClick={() => setAssignmentMode('collective')}
              className={cn(
                'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-sm cursor-pointer transition-colors text-left',
                assignmentMode === 'collective'
                  ? 'bg-primary-100 border border-neutral-200'
                  : 'bg-white border border-neutral-100 hover:bg-neutral-50',
              )}
            >
              <Users data-eos-id="src/pages/admin/workflows.tsx#44" size={16} className={assignmentMode === 'collective' ? 'text-primary-700' : 'text-neutral-400'} />
              <div data-eos-id="src/pages/admin/workflows.tsx#45">
                <p data-eos-id="src/pages/admin/workflows.tsx#46" className={cn('text-sm font-medium', assignmentMode === 'collective' ? 'text-primary-700' : 'text-neutral-500')}>
                  Collective
                </p>
                <p data-eos-id="src/pages/admin/workflows.tsx#47" className="text-[11px] text-neutral-400">Anyone can tick it off</p>
              </div>
            </button>
            <button data-eos-id="src/pages/admin/workflows.tsx#48"
              type="button"
              onClick={() => setAssignmentMode('individual')}
              className={cn(
                'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-sm cursor-pointer transition-colors text-left',
                assignmentMode === 'individual'
                  ? 'bg-primary-100 border border-neutral-200'
                  : 'bg-white border border-neutral-100 hover:bg-neutral-50',
              )}
            >
              <User data-eos-id="src/pages/admin/workflows.tsx#49" size={16} className={assignmentMode === 'individual' ? 'text-primary-700' : 'text-neutral-400'} />
              <div data-eos-id="src/pages/admin/workflows.tsx#50">
                <p data-eos-id="src/pages/admin/workflows.tsx#51" className={cn('text-sm font-medium', assignmentMode === 'individual' ? 'text-primary-700' : 'text-neutral-500')}>
                  Individual
                </p>
                <p data-eos-id="src/pages/admin/workflows.tsx#52" className="text-[11px] text-neutral-400">Each person completes it</p>
              </div>
            </button>
            <button data-eos-id="src/pages/admin/workflows.tsx#53"
              type="button"
              onClick={() => setAssignmentMode('assigned')}
              className={cn(
                'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-sm cursor-pointer transition-colors text-left',
                assignmentMode === 'assigned'
                  ? 'bg-primary-100 border border-neutral-200'
                  : 'bg-white border border-neutral-100 hover:bg-neutral-50',
              )}
            >
              <UserCheck data-eos-id="src/pages/admin/workflows.tsx#54" size={16} className={assignmentMode === 'assigned' ? 'text-primary-700' : 'text-neutral-400'} />
              <div data-eos-id="src/pages/admin/workflows.tsx#55">
                <p data-eos-id="src/pages/admin/workflows.tsx#56" className={cn('text-sm font-medium', assignmentMode === 'assigned' ? 'text-primary-700' : 'text-neutral-500')}>
                  Assigned
                </p>
                <p data-eos-id="src/pages/admin/workflows.tsx#57" className="text-[11px] text-neutral-400">One specific person</p>
              </div>
            </button>
          </div>

          {/* User picker for assigned mode */}
          {assignmentMode === 'assigned' && (
            <div data-eos-id="src/pages/admin/workflows.tsx#58" className="mt-3">
              <Dropdown data-eos-id="src/pages/admin/workflows.tsx#59"
                options={staffUsers.map((u) => ({
                  value: u.id,
                  label: `${u.display_name ?? 'Unknown'} (${formatRole(u.role ?? 'leader')})`,
                }))}
                value={assignedToUserId}
                onChange={setAssignedToUserId}
                label="Assign to"
                placeholder="Select a staff member..."
              />
              {!assignedToUserId && (
                <p data-eos-id="src/pages/admin/workflows.tsx#60" className="text-[11px] text-warning-600 mt-1">
                  Please select a user to assign this task to
                </p>
              )}
            </div>
          )}
        </div>

        {/* Scope & targeting - hidden for assigned mode (task goes to a specific person) */}
        {assignmentMode !== 'assigned' && (
          <Dropdown data-eos-id="src/pages/admin/workflows.tsx#61"
            options={collectiveOptions}
            value={collectiveId}
            onChange={setCollectiveId}
            label="Scope"
          />
        )}
        <div data-eos-id="src/pages/admin/workflows.tsx#62" className={cn('grid gap-3', assignmentMode === 'assigned' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
          <Dropdown data-eos-id="src/pages/admin/workflows.tsx#63"
            options={TASK_CATEGORIES}
            value={category}
            onChange={setCategory}
            label="Category"
          />
          {assignmentMode !== 'assigned' && (
            <Dropdown data-eos-id="src/pages/admin/workflows.tsx#64"
              options={assigneeRoleOptions}
              value={assigneeRole}
              onChange={setAssigneeRole}
              label="Visible To"
            />
          )}
        </div>

        {/* Schedule */}
        <div data-eos-id="src/pages/admin/workflows.tsx#65">
          <p data-eos-id="src/pages/admin/workflows.tsx#66" className="text-sm font-medium text-neutral-900 mb-2">Schedule</p>
          <div data-eos-id="src/pages/admin/workflows.tsx#67" className="flex gap-2 mb-3 flex-wrap">
            {(['weekly', 'monthly', 'event_relative', 'once'] as const).map((type) => {
              const Icon = SCHEDULE_ICONS[type]
              const labels: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', event_relative: 'Event', once: 'One-time' }
              return (
                <button data-eos-id="src/pages/admin/workflows.tsx#68" data-eos-var="labels.[..]" data-eos-var-label="]" data-eos-var-scope="prop"
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 min-h-11 rounded-sm text-sm cursor-pointer',
                    'transition-colors duration-150',
                    scheduleType === type
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'bg-white text-neutral-400 hover:bg-neutral-50',
                  )}
                >
                  <Icon data-eos-id="src/pages/admin/workflows.tsx#69" size={14} />
                  {labels[type]}
                </button>
              )
            })}
          </div>
          {scheduleType === 'weekly' && (
            <Dropdown data-eos-id="src/pages/admin/workflows.tsx#70" options={dayOfWeekOptions} value={dayOfWeek} onChange={setDayOfWeek} label="Day of Week" />
          )}
          {scheduleType === 'monthly' && (
            <Dropdown data-eos-id="src/pages/admin/workflows.tsx#71" options={dayOfMonthOptions} value={dayOfMonth} onChange={setDayOfMonth} label="Day of Month" />
          )}
          {scheduleType === 'event_relative' && (
            <div data-eos-id="src/pages/admin/workflows.tsx#72" className="space-y-3">
              {/* Dynamic timeline toggle */}
              <div data-eos-id="src/pages/admin/workflows.tsx#73" className="flex items-center justify-between rounded-sm bg-white border border-neutral-100 px-3 py-2.5">
                <div data-eos-id="src/pages/admin/workflows.tsx#74" className="flex items-center gap-2">
                  <Zap data-eos-id="src/pages/admin/workflows.tsx#75" size={15} className="text-moss-600" />
                  <div data-eos-id="src/pages/admin/workflows.tsx#76">
                    <p data-eos-id="src/pages/admin/workflows.tsx#77" className="text-sm font-medium text-neutral-900">Dynamic Timeline</p>
                    <p data-eos-id="src/pages/admin/workflows.tsx#78" className="text-[11px] text-neutral-400">Auto-calculate deadlines per collective</p>
                  </div>
                </div>
                <Toggle data-eos-id="src/pages/admin/workflows.tsx#79" checked={useDynamicTimeline} onChange={setUseDynamicTimeline} />
              </div>

              {useDynamicTimeline ? (
                <DynamicTimelineBuilder data-eos-id="src/pages/admin/workflows.tsx#80"
                  anchor={tlAnchor}
                  setAnchor={setTlAnchor}
                  activityTypeFilter={tlActivityTypeFilter}
                  setActivityTypeFilter={setTlActivityTypeFilter}
                  offsetDays={tlOffsetDays}
                  setOffsetDays={setTlOffsetDays}
                  lookaheadDays={tlLookaheadDays}
                  setLookaheadDays={setTlLookaheadDays}
                  matchAllEvents={tlMatchAllEvents}
                  setMatchAllEvents={setTlMatchAllEvents}
                />
              ) : (
                <Input data-eos-id="src/pages/admin/workflows.tsx#81"
                  label="Days offset (negative = before event)"
                  type="number"
                  value={eventOffsetDays}
                  onChange={(e) => setEventOffsetDays(e.target.value)}
                  placeholder="-3"
                />
              )}
            </div>
          )}
        </div>

        <Input data-eos-id="src/pages/admin/workflows.tsx#82"
          label="Sort Order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="0"
        />

        {scheduleType === 'once' && (
          <div data-eos-id="src/pages/admin/workflows.tsx#83" className="rounded-sm bg-info-50 px-3 py-2.5">
            <p data-eos-id="src/pages/admin/workflows.tsx#84" className="text-xs text-info-700 leading-relaxed">
              One-time tasks are created once per user when they load the tasks page. Once completed or skipped, they never reappear.
            </p>
          </div>
        )}

        {/* Survey (optional) */}
        <div data-eos-id="src/pages/admin/workflows.tsx#85" className="space-y-2">
          <p data-eos-id="src/pages/admin/workflows.tsx#86" className="text-sm font-medium text-neutral-900 flex items-center gap-1.5">
            <ClipboardList data-eos-id="src/pages/admin/workflows.tsx#87" size={14} className="text-neutral-400" />
            Survey (optional)
          </p>
          <Dropdown data-eos-id="src/pages/admin/workflows.tsx#88"
            options={[
              { value: '', label: 'No survey' },
              ...surveys.map((s) => ({ value: s.id, label: s.title })),
            ]}
            value={surveyId}
            onChange={setSurveyId}
            placeholder="Attach a survey..."
          />
          {surveyId && (
            <p data-eos-id="src/pages/admin/workflows.tsx#89" className="text-[11px] text-neutral-400 px-1">
              Staff will be prompted to complete this survey when marking the task as done
            </p>
          )}
        </div>

        {/* Attachment (optional) */}
        <div data-eos-id="src/pages/admin/workflows.tsx#90" className="space-y-2">
          <p data-eos-id="src/pages/admin/workflows.tsx#91" className="text-sm font-medium text-neutral-900 flex items-center gap-1.5">
            <Paperclip data-eos-id="src/pages/admin/workflows.tsx#92" size={14} className="text-neutral-400" />
            Attachment (optional)
          </p>

          {attachmentUrl ? (
            <div data-eos-id="src/pages/admin/workflows.tsx#93" className="flex items-center gap-3 px-3 py-2.5 rounded-sm bg-neutral-50 border border-neutral-100">
              <FileText data-eos-id="src/pages/admin/workflows.tsx#94" size={18} className="text-neutral-500 shrink-0" />
              <div data-eos-id="src/pages/admin/workflows.tsx#95" className="flex-1 min-w-0">
                <p data-eos-id="src/pages/admin/workflows.tsx#96" className="text-xs font-medium text-neutral-700 truncate">{attachmentLabel || 'Attachment'}</p>
                <p data-eos-id="src/pages/admin/workflows.tsx#97" className="text-[11px] text-neutral-400 truncate">{attachmentUrl}</p>
              </div>
              <button data-eos-id="src/pages/admin/workflows.tsx#98"
                type="button"
                onClick={() => { setAttachmentUrl(''); setAttachmentLabel('') }}
                className="shrink-0 p-1 rounded-sm text-neutral-400 hover:text-error-600 hover:bg-error-50 cursor-pointer transition-colors"
                aria-label="Remove attachment"
              >
                <X data-eos-id="src/pages/admin/workflows.tsx#99" size={14} />
              </button>
            </div>
          ) : (
            <div data-eos-id="src/pages/admin/workflows.tsx#100">
              <input data-eos-id="src/pages/admin/workflows.tsx#101"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button data-eos-id="src/pages/admin/workflows.tsx#102" data-eos-var="fileUpload.uploading" data-eos-var-label="Uploading" data-eos-var-scope="prop"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fileUpload.uploading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-sm border-2 border-dashed',
                  'text-sm font-medium cursor-pointer transition-colors',
                  fileUpload.uploading
                    ? 'border-neutral-200 text-neutral-300 bg-neutral-50'
                    : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50',
                )}
              >
                <Upload data-eos-id="src/pages/admin/workflows.tsx#103" size={16} />
                {fileUpload.uploading
                  ? `Uploading${fileUpload.progress != null ? ` ${fileUpload.progress}%` : '...'}`
                  : 'Upload file (PDF, doc, image)'}
              </button>
              {fileUpload.error && (
                <p data-eos-id="src/pages/admin/workflows.tsx#104" data-eos-var="fileUpload.error" data-eos-var-label="Error" data-eos-var-scope="prop" className="text-xs text-error-600 mt-1">{fileUpload.error}</p>
              )}
            </div>
          )}
        </div>

        <Button data-eos-id="src/pages/admin/workflows.tsx#105"
          variant="primary"
          fullWidth
          onClick={handleSave}
          loading={createMutation.isPending || updateMutation.isPending}
          disabled={!title.trim()}
        >
          {isEdit ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Dashboard Tab                                                  */
/* ------------------------------------------------------------------ */

function KpiDashboard() {
  const [collectiveFilter, setCollectiveFilter] = useState('')
  const { data: collectives } = useAllCollectives()

  // Default to last 30 days
  const dateFrom = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString()
  }, [])

  const { data, isLoading } = useAdminKpiDashboard({
    collectiveId: collectiveFilter || undefined,
    dateFrom,
  })
  const showLoading = useDelayedLoading(isLoading)

  const collectiveOptions = useMemo(() => [
    { value: '', label: 'All Collectives' },
    ...(collectives ?? []).map((c) => ({ value: c.id, label: c.name })),
  ], [collectives])

  return (
    <div data-eos-id="src/pages/admin/workflows.tsx#106" className="space-y-4">
      <Dropdown data-eos-id="src/pages/admin/workflows.tsx#107"
        options={collectiveOptions}
        value={collectiveFilter}
        onChange={setCollectiveFilter}
        placeholder="All Collectives"
        className="max-w-xs"
      />

      {showLoading ? (
        <Skeleton data-eos-id="src/pages/admin/workflows.tsx#108" variant="list-item" count={4} />
      ) : !data ? (
        <EmptyState data-eos-id="src/pages/admin/workflows.tsx#109" illustration="empty" title="No data" description="No task instances found for this period" />
      ) : (
        <>
          {/* Overview stats */}
          <div data-eos-id="src/pages/admin/workflows.tsx#110" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div data-eos-id="src/pages/admin/workflows.tsx#111" className="p-4 rounded-sm bg-white shadow-sm">
              <div data-eos-id="src/pages/admin/workflows.tsx#112" className="flex items-center gap-2 mb-1">
                <Target data-eos-id="src/pages/admin/workflows.tsx#113" size={14} className="text-neutral-400" />
                <p data-eos-id="src/pages/admin/workflows.tsx#114" className="text-xs text-neutral-500">Total Tasks</p>
              </div>
              <p data-eos-id="src/pages/admin/workflows.tsx#115" data-eos-var="data.totals.total" data-eos-var-label="Total" data-eos-var-scope="prop" className="text-2xl font-bold text-neutral-900">{data.totals.total}</p>
            </div>
            <div data-eos-id="src/pages/admin/workflows.tsx#116" className="p-4 rounded-sm bg-white shadow-sm">
              <div data-eos-id="src/pages/admin/workflows.tsx#117" className="flex items-center gap-2 mb-1">
                <CheckCircle data-eos-id="src/pages/admin/workflows.tsx#118" size={14} className="text-success-500" />
                <p data-eos-id="src/pages/admin/workflows.tsx#119" className="text-xs text-neutral-500">Completed</p>
              </div>
              <p data-eos-id="src/pages/admin/workflows.tsx#120" data-eos-var="data.totals.completed" data-eos-var-label="Completed" data-eos-var-scope="prop" className="text-2xl font-bold text-success-600">{data.totals.completed}</p>
            </div>
            <div data-eos-id="src/pages/admin/workflows.tsx#121" className="p-4 rounded-sm bg-white shadow-sm">
              <div data-eos-id="src/pages/admin/workflows.tsx#122" className="flex items-center gap-2 mb-1">
                <AlertTriangle data-eos-id="src/pages/admin/workflows.tsx#123" size={14} className="text-error-500" />
                <p data-eos-id="src/pages/admin/workflows.tsx#124" className="text-xs text-neutral-500">Overdue</p>
              </div>
              <p data-eos-id="src/pages/admin/workflows.tsx#125" data-eos-var="data.totals.overdue" data-eos-var-label="Overdue" data-eos-var-scope="prop" className="text-2xl font-bold text-error-600">{data.totals.overdue}</p>
            </div>
            <div data-eos-id="src/pages/admin/workflows.tsx#126" className="p-4 rounded-sm bg-white shadow-sm">
              <div data-eos-id="src/pages/admin/workflows.tsx#127" className="flex items-center gap-2 mb-1">
                <BarChart3 data-eos-id="src/pages/admin/workflows.tsx#128" size={14} className="text-neutral-400" />
                <p data-eos-id="src/pages/admin/workflows.tsx#129" className="text-xs text-neutral-500">Completion Rate</p>
              </div>
              <p data-eos-id="src/pages/admin/workflows.tsx#130" data-eos-var="data.totals.rate" data-eos-var-label="Rate" data-eos-var-scope="prop" className="text-2xl font-bold text-neutral-900">{data.totals.rate}%</p>
            </div>
          </div>

          {/* Per-collective table */}
          {data.stats.length > 0 && (
            <div data-eos-id="src/pages/admin/workflows.tsx#131" className="overflow-x-auto">
              <table data-eos-id="src/pages/admin/workflows.tsx#132" className="w-full text-sm">
                <thead data-eos-id="src/pages/admin/workflows.tsx#133">
                  <tr data-eos-id="src/pages/admin/workflows.tsx#134" className="border-b border-neutral-100">
                    <th data-eos-id="src/pages/admin/workflows.tsx#135" className="text-left py-3 px-3 text-neutral-500 font-medium">Collective</th>
                    <th data-eos-id="src/pages/admin/workflows.tsx#136" className="text-center py-3 px-2 text-neutral-500 font-medium">Total</th>
                    <th data-eos-id="src/pages/admin/workflows.tsx#137" className="text-center py-3 px-2 text-neutral-500 font-medium">Done</th>
                    <th data-eos-id="src/pages/admin/workflows.tsx#138" className="text-center py-3 px-2 text-neutral-500 font-medium">Overdue</th>
                    <th data-eos-id="src/pages/admin/workflows.tsx#139" className="text-center py-3 px-2 text-neutral-500 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody data-eos-id="src/pages/admin/workflows.tsx#140">
                  {data.stats.map((stat) => (
                    <tr data-eos-id="src/pages/admin/workflows.tsx#141" key={stat.collective_id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td data-eos-id="src/pages/admin/workflows.tsx#142" data-eos-var="stat.collective_name" data-eos-var-label="Collective name" data-eos-var-scope="item" className="py-2.5 px-3 font-medium text-neutral-900">{stat.collective_name}</td>
                      <td data-eos-id="src/pages/admin/workflows.tsx#143" data-eos-var="stat.total" data-eos-var-label="Total" data-eos-var-scope="item" className="text-center py-2.5 px-2 text-primary-600">{stat.total}</td>
                      <td data-eos-id="src/pages/admin/workflows.tsx#144" data-eos-var="stat.completed" data-eos-var-label="Completed" data-eos-var-scope="item" className="text-center py-2.5 px-2 text-success-600">{stat.completed}</td>
                      <td data-eos-id="src/pages/admin/workflows.tsx#145" data-eos-var="stat.overdue" data-eos-var-label="Overdue" data-eos-var-scope="item" className="text-center py-2.5 px-2 text-error-600">{stat.overdue}</td>
                      <td data-eos-id="src/pages/admin/workflows.tsx#146" className="text-center py-2.5 px-2">
                        <span data-eos-id="src/pages/admin/workflows.tsx#147" data-eos-var="stat.rate" data-eos-var-label="Rate" data-eos-var-scope="item"
                          className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            stat.rate >= 80
                              ? 'bg-success-100 text-success-700'
                              : stat.rate >= 50
                                ? 'bg-warning-100 text-warning-700'
                                : 'bg-error-100 text-error-700',
                          )}
                        >
                          {stat.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminWorkflowsPage() {
  const [activeTab, setActiveTab] = useState('templates')
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [scheduleFilter, setScheduleFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTemplate, setEditTemplate] = useState<TaskTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem('workflows-tip-dismissed') === '1' } catch { return false }
  })

  const { toast } = useToast()
  const { data: collectives } = useAllCollectives()
  const { data: surveys } = useAllSurveys()
  const { data: staffUsers } = useAssignableStaff()
  const { data: templates, isLoading } = useAdminTaskTemplates({
    scope: scopeFilter,
    scheduleType: scheduleFilter || undefined,
    search: search || undefined,
  })
  const showLoading = useDelayedLoading(isLoading)

  const toggleMutation = useAdminToggleTemplate()
  const deleteMutation = useAdminDeleteTemplate()

  const shouldReduceMotion = useReducedMotion()

  // Extend scope options with per-collective options
  const fullScopeOptions = useMemo(() => [
    ...scopeOptions,
    ...(collectives ?? []).map((c) => ({ value: c.id, label: c.name })),
  ], [collectives])

  const heroActions = useMemo(() =>
    activeTab === 'templates' ? (
      <Button data-eos-id="src/pages/admin/workflows.tsx#148"
        variant="primary"
        size="sm"
        icon={<Plus data-eos-id="src/pages/admin/workflows.tsx#149" size={16} />}
        onClick={() => setShowCreate(true)}
        className="!bg-white/15 !border-white/10 hover:!bg-white/25 !text-white"
      >
        Create Template
      </Button>
    ) : undefined,
  [activeTab])

  useAdminHeader('Workflows', { actions: heroActions })

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/workflows.tsx#150" variants={stagger} initial="hidden" animate="visible">
      <motion.div data-eos-id="src/pages/admin/workflows.tsx#151" variants={fadeUp}>
        <TabBar data-eos-id="src/pages/admin/workflows.tsx#152" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />
      </motion.div>

      {activeTab === 'templates' && (
        <>
          {/* Filters */}
          <motion.div data-eos-id="src/pages/admin/workflows.tsx#153" variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-4">
            <SearchBar data-eos-id="src/pages/admin/workflows.tsx#154"
              value={search}
              onChange={setSearch}
              placeholder="Search templates..."
              compact
              className="flex-1"
            />
            <Dropdown data-eos-id="src/pages/admin/workflows.tsx#155"
              options={fullScopeOptions}
              value={scopeFilter}
              onChange={setScopeFilter}
              placeholder="All Scopes"
              className="sm:w-48"
            />
            <Dropdown data-eos-id="src/pages/admin/workflows.tsx#156"
              options={scheduleTypeOptions}
              value={scheduleFilter}
              onChange={setScheduleFilter}
              placeholder="All Schedules"
              className="sm:w-40"
            />
          </motion.div>

          {/* Tip: handbook onboarding setup */}
          {!tipDismissed && (
            <motion.div data-eos-id="src/pages/admin/workflows.tsx#157" variants={fadeUp} className="mb-4 rounded-sm bg-info-50/80 border border-info-200/40 px-4 py-3">
              <div data-eos-id="src/pages/admin/workflows.tsx#158" className="flex items-start gap-3">
                <Info data-eos-id="src/pages/admin/workflows.tsx#159" size={16} className="text-info-500 mt-0.5 shrink-0" />
                <div data-eos-id="src/pages/admin/workflows.tsx#160" className="flex-1 min-w-0 space-y-1.5">
                  <p data-eos-id="src/pages/admin/workflows.tsx#161" className="text-xs font-semibold text-info-800">Setting up the Handbook task for new leaders</p>
                  <ol data-eos-id="src/pages/admin/workflows.tsx#162" className="text-[11px] text-info-700 leading-relaxed list-decimal pl-3.5 space-y-0.5">
                    <li data-eos-id="src/pages/admin/workflows.tsx#163">Tap <span data-eos-id="src/pages/admin/workflows.tsx#164" className="font-medium">Create Template</span></li>
                    <li data-eos-id="src/pages/admin/workflows.tsx#165">Set schedule to <span data-eos-id="src/pages/admin/workflows.tsx#166" className="font-medium">One-time</span> so it only appears once per user</li>
                    <li data-eos-id="src/pages/admin/workflows.tsx#167">Set scope to <span data-eos-id="src/pages/admin/workflows.tsx#168" className="font-medium">All Collectives</span> and assign to <span data-eos-id="src/pages/admin/workflows.tsx#169" className="font-medium">Assistant Leader+</span></li>
                    <li data-eos-id="src/pages/admin/workflows.tsx#170">Upload the handbook PDF using the <span data-eos-id="src/pages/admin/workflows.tsx#171" className="font-medium">Attachment</span> file picker</li>
                    <li data-eos-id="src/pages/admin/workflows.tsx#172">Once a leader completes or skips the task, it never reappears for them</li>
                  </ol>
                </div>
                <button data-eos-id="src/pages/admin/workflows.tsx#173"
                  type="button"
                  onClick={() => {
                    setTipDismissed(true)
                    try { localStorage.setItem('workflows-tip-dismissed', '1') } catch { /* ignore storage errors */ }
                  }}
                  className="shrink-0 p-1 rounded-sm text-info-400 hover:text-info-600 hover:bg-info-100 cursor-pointer transition-colors"
                  aria-label="Dismiss tip"
                >
                  <X data-eos-id="src/pages/admin/workflows.tsx#174" size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {/* Template list */}
          <motion.div data-eos-id="src/pages/admin/workflows.tsx#175" variants={fadeUp}>
            {showLoading ? (
              <Skeleton data-eos-id="src/pages/admin/workflows.tsx#176" variant="list-item" count={6} />
            ) : !templates?.length ? (
              <EmptyState data-eos-id="src/pages/admin/workflows.tsx#177"
                illustration="empty"
                title="No task templates"
                description="Create recurring task templates for your collective staff"
                action={{ label: 'Create Template', onClick: () => setShowCreate(true) }}
              />
            ) : (
              <StaggeredList data-eos-id="src/pages/admin/workflows.tsx#178" className="space-y-2">
                {templates.map((template) => {
                  const ScheduleIcon = SCHEDULE_ICONS[template.schedule_type] ?? Calendar
                  return (
                    <StaggeredItem data-eos-id="src/pages/admin/workflows.tsx#179"
                      key={template.id}
                      className={cn(
                        'p-4 rounded-sm bg-white shadow-sm',
                        !template.is_active && 'opacity-50',
                      )}
                    >
                      <div data-eos-id="src/pages/admin/workflows.tsx#180" className="flex items-start gap-3">
                        <div data-eos-id="src/pages/admin/workflows.tsx#181" className="flex-1 min-w-0">
                          <div data-eos-id="src/pages/admin/workflows.tsx#182" className="flex items-center gap-2 mb-1">
                            <p data-eos-id="src/pages/admin/workflows.tsx#183" data-eos-var="template.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                              {template.title}
                            </p>
                            <span data-eos-id="src/pages/admin/workflows.tsx#184" data-eos-var="template.category" data-eos-var-label="Category" data-eos-var-scope="item" className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0', CATEGORY_COLORS[template.category])}>
                              {template.category.replace('_', ' ')}
                            </span>
                          </div>
                          {template.description && (
                            <p data-eos-id="src/pages/admin/workflows.tsx#185" data-eos-var="template.description" data-eos-var-label="Description" data-eos-var-scope="item" className="text-xs text-neutral-500 line-clamp-1 mb-1.5">{template.description}</p>
                          )}
                          <div data-eos-id="src/pages/admin/workflows.tsx#186" className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                            <span data-eos-id="src/pages/admin/workflows.tsx#187" className="flex items-center gap-1">
                              <ScheduleIcon data-eos-id="src/pages/admin/workflows.tsx#188" size={12} />
                              {formatSchedule(template)}
                            </span>
                            {template.use_dynamic_timeline && (
                              <>
                                <span data-eos-id="src/pages/admin/workflows.tsx#189" className="text-primary-200">·</span>
                                <span data-eos-id="src/pages/admin/workflows.tsx#190" className="flex items-center gap-1 text-moss-600 font-medium">
                                  <Zap data-eos-id="src/pages/admin/workflows.tsx#191" size={10} />
                                  Dynamic
                                </span>
                              </>
                            )}
                            <span data-eos-id="src/pages/admin/workflows.tsx#192" className="text-primary-200">·</span>
                            <span data-eos-id="src/pages/admin/workflows.tsx#193" data-eos-var="template.collective.name" data-eos-var-label="Name" data-eos-var-scope="item">{template.collective?.name ?? 'All Collectives'}</span>
                            <span data-eos-id="src/pages/admin/workflows.tsx#194" className="text-primary-200">·</span>
                            <span data-eos-id="src/pages/admin/workflows.tsx#195" className="flex items-center gap-1">
                              {(template.assignment_mode ?? 'collective') === 'collective'
                                ? <><Users data-eos-id="src/pages/admin/workflows.tsx#196" size={10} /> Collective</>
                                : (template.assignment_mode === 'assigned')
                                ? <><UserCheck data-eos-id="src/pages/admin/workflows.tsx#197" size={10} /> Assigned</>
                                : <><User data-eos-id="src/pages/admin/workflows.tsx#198" size={10} /> Individual</>}
                            </span>
                            <span data-eos-id="src/pages/admin/workflows.tsx#199" className="text-primary-200">·</span>
                            <span data-eos-id="src/pages/admin/workflows.tsx#200" data-eos-var="template.assignee_role" data-eos-var-label="Assignee role" data-eos-var-scope="item">{formatRole(template.assignee_role)}+</span>
                            {template.attachment_url && (
                              <>
                                <span data-eos-id="src/pages/admin/workflows.tsx#201" className="text-primary-200">·</span>
                                <span data-eos-id="src/pages/admin/workflows.tsx#202" data-eos-var="template.attachment_label" data-eos-var-label="Attachment label" data-eos-var-scope="item" className="flex items-center gap-1 text-primary-500">
                                  <Paperclip data-eos-id="src/pages/admin/workflows.tsx#203" size={10} />
                                  {template.attachment_label || 'Attachment'}
                                </span>
                              </>
                            )}
                            {template.survey_id && (
                              <>
                                <span data-eos-id="src/pages/admin/workflows.tsx#204" className="text-primary-200">·</span>
                                <span data-eos-id="src/pages/admin/workflows.tsx#205" data-eos-var="template.survey.title" data-eos-var-label="Title" data-eos-var-scope="item" className="flex items-center gap-1 text-plum-600 font-medium">
                                  <ClipboardList data-eos-id="src/pages/admin/workflows.tsx#206" size={10} />
                                  {template.survey?.title || 'Survey'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div data-eos-id="src/pages/admin/workflows.tsx#207" className="flex items-center gap-1 shrink-0">
                          <Toggle data-eos-id="src/pages/admin/workflows.tsx#208"
                            checked={template.is_active}
                            onChange={(v) =>
                              toggleMutation.mutate(
                                { id: template.id, is_active: v },
                                {
                                  onSuccess: () => toast.success(v ? 'Activated' : 'Deactivated'),
                                  onError: () => toast.error('Failed to toggle'),
                                },
                              )
                            }
                          />
                          <button data-eos-id="src/pages/admin/workflows.tsx#209"
                            type="button"
                            onClick={() => setEditTemplate(template)}
                            className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer"
                            title="Edit"
                          >
                            <Pencil data-eos-id="src/pages/admin/workflows.tsx#210" size={14} />
                          </button>
                          <button data-eos-id="src/pages/admin/workflows.tsx#211"
                            type="button"
                            onClick={() => setDeleteTarget(template.id)}
                            className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 data-eos-id="src/pages/admin/workflows.tsx#212" size={14} />
                          </button>
                        </div>
                      </div>
                    </StaggeredItem>
                  )
                })}
              </StaggeredList>
            )}
          </motion.div>
        </>
      )}

      {activeTab === 'kpi' && (
        <motion.div data-eos-id="src/pages/admin/workflows.tsx#213" variants={fadeUp}>
          <KpiDashboard data-eos-id="src/pages/admin/workflows.tsx#214" />
        </motion.div>
      )}

      {/* Create modal */}
      {showCreate && (
        <TemplateModal data-eos-id="src/pages/admin/workflows.tsx#215"
          open={showCreate}
          onClose={() => setShowCreate(false)}
          collectives={collectives ?? []}
          surveys={surveys ?? []}
          staffUsers={staffUsers ?? []}
        />
      )}

      {/* Edit modal */}
      {editTemplate && (
        <TemplateModal data-eos-id="src/pages/admin/workflows.tsx#216"
          open={!!editTemplate}
          onClose={() => setEditTemplate(null)}
          template={editTemplate}
          collectives={collectives ?? []}
          surveys={surveys ?? []}
          staffUsers={staffUsers ?? []}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/workflows.tsx#217"
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget, {
              onSuccess: () => { toast.success('Template deleted'); setDeleteTarget(null) },
              onError: () => toast.error('Failed to delete'),
            })
          }
        }}
        title="Delete Template"
        description="This will permanently delete this task template and all its generated instances. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </motion.div>
  )
}
