import { useState, useMemo } from 'react'
import type { Database } from '@/types/database.types'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Users,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  Bell,
  Sparkles,
  Heart,
  Briefcase,
  MessageSquare,
  ExternalLink,
  Shield,
  Star,
  Megaphone,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { TabBar } from '@/components/tab-bar'
import { Toggle } from '@/components/toggle'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { ROLE_LABELS, SKILL_LABELS } from '@/lib/labels-and-enums'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Application {
  id: string
  created_at: string
  first_name: string
  last_name: string
  email: string
  date_of_birth: string | null
  phone: string | null
  country: string
  address_line1: string
  address_line2: string | null
  suburb: string
  state: string
  postcode: string
  why_volunteer: string
  roles: string[]
  time_commitment: string
  attended_events: string | null
  skills: string[]
  resume_url: string | null
  additional_info: string | null
  how_heard: string
  news_opt_in: boolean
  user_id: string | null
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
}

interface NotificationRecipient {
  id: string
  event_type: string
  user_id: string
  notify_email: boolean
  notify_push: boolean
  profile?: { display_name: string; email?: string }
}

/* ------------------------------------------------------------------ */
/*  Label maps                                                         */
/* ------------------------------------------------------------------ */


const HOW_HEARD_LABELS: Record<string, string> = {
  social_media: 'Social Media',
  friend: 'Friend or Family',
  event: 'At an Event',
  school_uni: 'School or University',
  google: 'Google Search',
  news: 'News or Media',
  other: 'Other',
}

const STATUS_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string;
  icon: React.ReactNode; strip: string; glow: string;
}> = {
  pending: {
    label: 'Pending Review', color: 'text-warning-800', bg: 'bg-warning-100',
    border: 'border-warning-200', icon: <Clock size={12} />,
    strip: 'bg-warning-500',
    glow: 'ring-1 ring-warning-100',
  },
  reviewed: {
    label: 'Under Review', color: 'text-moss-800', bg: 'bg-moss-100',
    border: 'border-moss-200', icon: <Eye size={12} />,
    strip: 'bg-moss-500',
    glow: 'ring-1 ring-moss-100',
  },
  accepted: {
    label: 'Accepted', color: 'text-success-800', bg: 'bg-success-100',
    border: 'border-success-200', icon: <CheckCircle2 size={12} />,
    strip: 'bg-success-500',
    glow: 'ring-1 ring-success-100',
  },
  rejected: {
    label: 'Not Accepted', color: 'text-error-800', bg: 'bg-error-100',
    border: 'border-error-200', icon: <XCircle size={12} />,
    strip: 'bg-error-500',
    glow: 'ring-1 ring-error-100',
  },
}

/* ------------------------------------------------------------------ */
/*  Data hooks                                                         */
/* ------------------------------------------------------------------ */

function useApplications() {
  return useQuery({
    queryKey: ['admin-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collective_applications')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Application[]
    },
    staleTime: 60 * 1000,
  })
}

function useNotificationRecipients() {
  return useQuery({
    queryKey: ['admin-application-recipients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_recipients')
        .select('*, profile:profiles!notification_recipients_user_id_fkey(display_name)')
        .eq('event_type', 'collective_application')
      if (error) throw error
      return (data ?? []) as NotificationRecipient[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

function useStaffUsers() {
  return useQuery({
    queryKey: ['admin-staff-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('role', ['leader', 'manager', 'admin'])
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const tabs = [
  { id: 'applications', label: 'Applications', icon: <Users size={14} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
]

/* ------------------------------------------------------------------ */
/*  Application Detail Card                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Section header helper                                              */
/* ------------------------------------------------------------------ */

function SectionHeader({ icon, label, color = 'text-neutral-400' }: {
  icon: React.ReactNode; label: string; color?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className={cn('shrink-0', color)}>{icon}</span>
      <p className={cn('text-[11px] font-bold uppercase tracking-widest', color)}>{label}</p>
      <div className="flex-1 h-px bg-neutral-100" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Application Detail Card                                            */
/* ------------------------------------------------------------------ */

function ApplicationCard({
  app,
  onUpdateStatus,
}: {
  app: Application
  onUpdateStatus: (id: string, status: string, notes?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(app.notes ?? '')
  const statusCfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.pending

  const initials = `${app.first_name[0] ?? ''}${app.last_name[0] ?? ''}`.toUpperCase()
  const [nowMs] = useState(() => Date.now())
  const daysAgo = Math.floor((nowMs - new Date(app.created_at).getTime()) / 86400000)
  const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`

  return (
    <div className={cn(
      'rounded-md bg-white border border-neutral-100 overflow-hidden transition-shadow duration-200',
      'shadow-sm',
      statusCfg.glow,
    )}>
      {/* Colored status strip */}
      <div className={cn('h-1', statusCfg.strip)} />

      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-3.5 px-4 py-3.5 text-left',
          'transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.99]',
          'hover:bg-neutral-50',
        )}
      >
        {/* Avatar with initials */}
        <div className={cn(
          'flex items-center justify-center w-11 h-11 rounded-sm shrink-0',
          'font-heading text-[14px] font-bold tracking-wide',
          app.status === 'accepted' ? 'bg-success-100 text-success-700' :
          app.status === 'rejected' ? 'bg-error-100 text-error-600' :
          app.status === 'reviewed' ? 'bg-info-100 text-info-700' :
          'bg-warning-100 text-warning-700',
        )}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-neutral-900 truncate">
              {app.first_name} {app.last_name}
            </p>
            {app.roles.includes('collective_leader') && (
              <Star size={13} className="text-warning-500 shrink-0 fill-warning-400" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <MapPin size={11} className="text-neutral-300 shrink-0" />
            <p className="text-[12px] text-neutral-400 truncate">
              {app.suburb}, {app.state}
            </p>
            <span className="text-neutral-200">&middot;</span>
            <p className="text-[12px] text-neutral-300 shrink-0">{timeLabel}</p>
          </div>
        </div>

        {/* Status badge */}
        <span className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border',
          statusCfg.bg, statusCfg.color, statusCfg.border,
        )}>
          {statusCfg.icon}
          {statusCfg.label}
        </span>

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown size={16} className="text-neutral-300" />
        </motion.div>
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-5">
              {/* ── Contact & Details ── */}
              <div className="rounded-sm bg-neutral-50 p-4">
                <SectionHeader icon={<Mail size={13} />} label="Contact & Details" color="text-info-500" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailRow icon={<Mail size={14} />} label="Email" value={app.email} iconColor="text-info-400" />
                  {app.phone && <DetailRow icon={<Phone size={14} />} label="Phone" value={app.phone} iconColor="text-sprout-500" />}
                  {app.date_of_birth && <DetailRow icon={<Calendar size={14} />} label="Date of Birth" value={app.date_of_birth} iconColor="text-plum-400" />}
                  <DetailRow icon={<MapPin size={14} />} label="Address" value={`${app.address_line1}${app.address_line2 ? `, ${app.address_line2}` : ''}, ${app.suburb} ${app.state} ${app.postcode}`} iconColor="text-bark-400" />
                  <DetailRow icon={<Clock size={14} />} label="Availability" value={app.time_commitment} iconColor="text-moss-500" />
                  {app.attended_events && <DetailRow icon={<Users size={14} />} label="Attended Events" value={app.attended_events} iconColor="text-sky-500" />}
                  <DetailRow icon={<Megaphone size={14} />} label="How They Found Us" value={HOW_HEARD_LABELS[app.how_heard] ?? app.how_heard} iconColor="text-warning-500" />
                </div>
              </div>

              {/* ── Roles & Skills ── */}
              <div className="rounded-sm bg-neutral-50 p-4">
                <SectionHeader icon={<Briefcase size={13} />} label="Roles & Skills" color="text-neutral-500" />
                <div className="space-y-3">
                  {/* Roles */}
                  <div className="flex flex-wrap gap-1.5">
                    {app.roles.map(r => (
                      <span key={r} className={cn(
                        'inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full',
                        r === 'collective_leader' ? 'bg-warning-100 text-warning-800 border border-warning-200' :
                        r === 'assistant_leader' ? 'bg-info-100 text-info-800 border border-info-200' :
                        r === 'social_media' ? 'bg-plum-100 text-plum-700 border border-plum-200' :
                        'bg-neutral-100 text-neutral-700 border border-neutral-200',
                      )}>
                        {r === 'collective_leader' && <Star size={11} className="fill-warning-400" />}
                        {r === 'assistant_leader' && <Shield size={11} />}
                        {ROLE_LABELS[r] ?? r}
                      </span>
                    ))}
                  </div>

                  {/* Skills */}
                  {app.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {app.skills.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-sprout-100 text-sprout-700 border border-sprout-200">
                          <Sparkles size={10} />
                          {SKILL_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Motivation ── */}
              <div className="rounded-sm bg-neutral-50 p-4">
                <SectionHeader icon={<Heart size={13} />} label="Why They Want to Volunteer" color="text-success-500" />
                <p className="text-[14px] text-neutral-900 leading-relaxed">
                  {app.why_volunteer}
                </p>
              </div>

              {/* ── Resume & Additional ── */}
              {(app.resume_url || app.additional_info) && (
                <div className="rounded-sm bg-neutral-50 p-4 space-y-3">
                  <SectionHeader icon={<FileText size={13} />} label="Attachments & Notes" color="text-bark-400" />
                  {app.resume_url && (
                    <a
                      href={app.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-2 text-[13px] font-semibold',
                        'text-neutral-600 hover:text-neutral-900 transition-colors',
                        'bg-white rounded-sm px-3.5 py-2.5 shadow-sm',
                        'border border-neutral-100',
                      )}
                    >
                      <FileText size={14} />
                      View Resume
                      <ExternalLink size={12} className="text-neutral-300" />
                    </a>
                  )}
                  {app.additional_info && (
                    <p className="text-[14px] text-neutral-700 leading-relaxed italic">
                      &ldquo;{app.additional_info}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* ── Staff Notes ── */}
              <div className="rounded-sm bg-warning-50 border border-warning-100 p-4">
                <SectionHeader icon={<MessageSquare size={13} />} label="Staff Notes (Internal)" color="text-warning-600" />
                <Input
                  type="textarea"
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add internal notes about this applicant..."
                  rows={2}
                />
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center gap-2 pt-1">
                {app.status !== 'accepted' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle2 size={14} />}
                    onClick={() => onUpdateStatus(app.id, 'accepted', notes)}
                  >
                    Accept
                  </Button>
                )}
                {app.status !== 'rejected' && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<XCircle size={14} />}
                    onClick={() => onUpdateStatus(app.id, 'rejected', notes)}
                  >
                    Reject
                  </Button>
                )}
                {app.status === 'pending' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Eye size={14} />}
                    onClick={() => onUpdateStatus(app.id, 'reviewed', notes)}
                  >
                    Mark Reviewed
                  </Button>
                )}
                {app.reviewed_at && (
                  <p className="ml-auto text-[11px] text-neutral-300">
                    Last updated {new Date(app.reviewed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DetailRow({ icon, label, value, iconColor = 'text-neutral-400' }: {
  icon: React.ReactNode; label: string; value: string; iconColor?: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn('mt-0.5 shrink-0', iconColor)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-neutral-400 leading-tight">{label}</p>
        <p className="text-[14px] text-neutral-900 break-words leading-snug">{value}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Notification Settings Tab                                          */
/* ------------------------------------------------------------------ */

function NotificationSettingsTab() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: recipients, isLoading } = useNotificationRecipients()
  const { data: staffUsers } = useStaffUsers()
  const [addingUserId, setAddingUserId] = useState('')

  const addRecipient = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('notification_recipients')
        .insert({ event_type: 'collective_application', user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-application-recipients'] })
      setAddingUserId('')
      toast.success('Staff member added to notifications')
    },
    onError: () => toast.error('Failed to add recipient'),
  })

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_recipients')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-application-recipients'] })
      toast.success('Recipient removed')
    },
    onError: () => toast.error('Failed to remove'),
  })

  const toggleNotifType = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: 'notify_email' | 'notify_push'; value: boolean }) => {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ [field]: value } as Database['public']['Tables']['notification_recipients']['Update'])
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-application-recipients'] })
      const previous = queryClient.getQueryData<NotificationRecipient[]>(['admin-application-recipients'])
      queryClient.setQueryData<NotificationRecipient[]>(['admin-application-recipients'], (old) =>
        old?.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin-application-recipients'], ctx.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-application-recipients'] })
    },
  })

  const availableStaff = (staffUsers ?? []).filter(
    s => !(recipients ?? []).some(r => r.user_id === s.id)
  )

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-white border border-neutral-100 shadow-sm overflow-hidden">
        {/* Header band */}
        <div className="bg-white px-5 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-info-100 text-info-600">
              <Bell size={16} />
            </div>
            <div>
              <h3 className="font-heading text-[15px] font-semibold text-neutral-900">
                Who gets notified?
              </h3>
              <p className="text-[12px] text-neutral-400 mt-0.5">
                Staff members who receive alerts when new applications are submitted.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Current recipients */}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-sm" />
              <Skeleton className="h-14 w-full rounded-sm" />
            </div>
          ) : (recipients ?? []).length === 0 ? (
            <div className="rounded-sm bg-warning-50 border border-warning-100 px-4 py-3.5 flex items-center gap-2.5">
              <Bell size={16} className="text-warning-500 shrink-0" />
              <p className="text-[13px] text-warning-700">
                No staff members configured. Add someone below to receive notifications.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(recipients ?? []).map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-sm bg-neutral-50 border border-neutral-100 px-4 py-3 hover:bg-neutral-100 transition-colors">
                  <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-neutral-100 text-neutral-600 shrink-0">
                    <Users size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-neutral-900 truncate">
                      {(r as unknown as Record<string, Record<string, unknown>>).profile?.display_name as string ?? r.user_id.slice(0, 8)}
                    </p>
                  </div>
                  <Toggle
                    label="Email"
                    size="sm"
                    checked={r.notify_email}
                    onChange={(v) => toggleNotifType.mutate({ id: r.id, field: 'notify_email', value: v })}
                  />
                  <Toggle
                    label="Push"
                    size="sm"
                    checked={r.notify_push}
                    onChange={(v) => toggleNotifType.mutate({ id: r.id, field: 'notify_push', value: v })}
                  />
                  <button
                    onClick={() => removeRecipient.mutate(r.id)}
                    className="text-neutral-300 hover:text-error transition-[colors,transform] duration-150 cursor-pointer p-1 rounded-sm hover:bg-error-50 active:scale-[0.98]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add recipient */}
          {availableStaff.length > 0 && (
            <div className="flex gap-2 pt-2 border-t border-neutral-100">
              <div className="flex-1">
                <Dropdown
                  options={availableStaff.map(s => ({ value: s.id, label: s.display_name ?? s.id }))}
                  value={addingUserId}
                  onChange={setAddingUserId}
                  placeholder="Select staff member..."
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                disabled={!addingUserId}
                onClick={() => addRecipient.mutate(addingUserId)}
                loading={addRecipient.isPending}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status filter                                                      */
/* ------------------------------------------------------------------ */

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminApplicationsPage() {
  const shouldReduceMotion = useReducedMotion()
  const { stagger, fadeUp } = adminVariants(shouldReduceMotion ?? false)
  const [activeTab, setActiveTab] = useState('applications')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: applications, isLoading } = useApplications()
  const showLoading = useDelayedLoading(isLoading)

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('collective_applications')
        .update({
          status,
          notes: notes || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      await logAudit({
        action: `application_${status}`,
        target_type: 'collective_application',
        target_id: id,
      })
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-applications'] })
      toast.success(`Application ${vars.status}`)
    },
    onError: () => toast.error('Failed to update application'),
  })

  const handleUpdateStatus = (id: string, status: string, notes?: string) => {
    updateStatus.mutate({ id, status, notes })
  }

  // Stats
  const stats = useMemo(() => {
    const apps = applications ?? []
    return {
      total: apps.length,
      pending: apps.filter(a => a.status === 'pending').length,
      accepted: apps.filter(a => a.status === 'accepted').length,
    }
  }, [applications])

  // Filtered list
  const filtered = useMemo(() => {
    let list = applications ?? []
    if (statusFilter !== 'all') {
      list = list.filter(a => a.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(a =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.suburb.toLowerCase().includes(q)
      )
    }
    return list
  }, [applications, statusFilter, searchQuery])

  const rejected = useMemo(() => (applications ?? []).filter(a => a.status === 'rejected').length, [applications])
  const rm = !!shouldReduceMotion

  // Hero stats
  const heroStats = useMemo(() => (
    <AdminHeroStatRow>
      <AdminHeroStat value={stats.total} label="Total" icon={<Users size={18} />} color="primary" delay={0} reducedMotion={rm} />
      <AdminHeroStat value={stats.pending} label="Pending" icon={<Clock size={18} />} color="warning" delay={1} reducedMotion={rm} />
      <AdminHeroStat value={stats.accepted} label="Accepted" icon={<CheckCircle2 size={18} />} color="success" delay={2} reducedMotion={rm} />
      {rejected > 0 && (
        <AdminHeroStat value={rejected} label="Declined" icon={<XCircle size={18} />} color="error" delay={3} reducedMotion={rm} />
      )}
    </AdminHeroStatRow>
  ), [stats, rejected, rm])

  useAdminHeader('Applications', {
    heroContent: heroStats,
  })

  return (
    <motion.div
      className="space-y-4"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      {/* Tabs */}
      <motion.div variants={fadeUp}>
        <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </motion.div>

      {activeTab === 'applications' ? (
        <>
          {/* Filters */}
          <motion.div variants={fadeUp} className="space-y-3">
            {/* Search + dropdown row */}
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Input
                  type="search"
                  placeholder="Search by name, email, suburb..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dropdown
                options={STATUS_FILTERS}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Status"
                triggerClassName="!w-auto min-w-[140px]"
              />
            </div>

            {/* Quick-filter pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5">
              {STATUS_FILTERS.map(f => {
                const count = f.value === 'all' ? (applications ?? []).length
                  : (applications ?? []).filter(a => a.status === f.value).length
                const isActive = statusFilter === f.value
                const cfg = f.value !== 'all' ? STATUS_CONFIG[f.value] : null
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 min-h-11 rounded-full',
                      'transition-transform duration-150 cursor-pointer shrink-0 border active:scale-[0.98]',
                      isActive
                        ? cfg
                          ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                          : 'bg-neutral-100 text-neutral-900 border-neutral-200'
                        : 'bg-white text-neutral-400 border-neutral-100 hover:bg-neutral-50 hover:text-neutral-600',
                    )}
                  >
                    {f.label}
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                      isActive
                        ? cfg
                          ? 'bg-white/60 text-inherit'
                          : 'bg-neutral-200/60 text-neutral-700'
                        : 'bg-neutral-100 text-neutral-400',
                    )}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>

          {/* List */}
          {showLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration={<Users size={40} />}
              title="No applications"
              description={statusFilter !== 'all' ? 'No applications match the current filter.' : 'Applications will appear here when people apply to lead a collective.'}
            />
          ) : (
            <StaggeredList className="space-y-3">
              {filtered.map(app => (
                <StaggeredItem key={app.id}>
                  <ApplicationCard app={app} onUpdateStatus={handleUpdateStatus} />
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      ) : (
        <motion.div variants={fadeUp}>
          <NotificationSettingsTab />
        </motion.div>
      )}
    </motion.div>
  )
}
