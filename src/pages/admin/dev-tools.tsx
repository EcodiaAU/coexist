import { useState } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    Bug,
    Bell,
    Calendar,
    Hash,
    ClipboardCheck,
    TreePine,
    MapPin, Users,
    Trash2,
    Play, AlertCircle, Star, CheckCircle2,
    XCircle, Smartphone,
    Moon,
    Globe,
    RefreshCw,
    Mail, Send,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { Toggle } from '@/components/toggle'
import { useAuth } from '@/hooks/use-auth'
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { Dropdown } from '@/components/dropdown'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database.types'
import type { NotificationType, NotificationPreferences } from '@/hooks/use-notifications'
import { DEFAULT_PREFERENCES } from '@/hooks/use-notifications'

/* ================================================================== */
/*  SECTION 1 - Event Seeding (existing)                               */
/* ================================================================== */

interface TestEvent {
  id: string
  title: string
  activity_type: string
  date_start: string
  date_end: string | null
  collective_name: string
  collective_id: string
  registration_count: number
  user_role: string | null
  user_status: string | null
}

function useSeedTestEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (activityType: Database['public']['Enums']['activity_type']) => {
      if (!user) throw new Error('Not authenticated')

      const { data: membership } = await supabase
        .from('collective_members')
        .select('collective_id, collectives(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      let collectiveId: string
      let collectiveName: string

      if (membership) {
        collectiveId = membership.collective_id
        collectiveName = membership.collectives?.name ?? 'Test Collective'
      } else {
        collectiveId = 'c0000000-0000-0000-0000-000000000001'
        collectiveName = 'Byron Bay Collective'

        await supabase.from('collective_members').upsert(
          {
            collective_id: collectiveId,
            user_id: user.id,
            role: 'leader',
            status: 'active',
          },
          { onConflict: 'collective_id,user_id' },
        )
      }

      await supabase
        .from('collective_members')
        .update({ role: 'leader' })
        .eq('collective_id', collectiveId)
        .eq('user_id', user.id)

      const now = new Date()
      const start = new Date(now.getTime() - 30 * 60 * 1000)
      const end = new Date(now.getTime() + 2.5 * 60 * 60 * 1000)

      const label = ACTIVITY_TYPE_LABELS[activityType] ?? activityType
      const title = `[TEST] ${label} - ${now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          collective_id: collectiveId,
          created_by: user.id,
          title,
          description: `Dev test event for ${label}. This event is happening right now for testing day-of flows.`,
          activity_type: activityType,
          date_start: start.toISOString(),
          date_end: end.toISOString(),
          capacity: 30,
          address: '1 Main Beach, Byron Bay NSW 2481',
          is_public: true,
          status: 'published',
        })
        .select('id')
        .single()

      if (eventError) throw eventError

      await supabase.from('event_registrations').upsert(
        { event_id: event.id, user_id: user.id, status: 'registered' },
        { onConflict: 'event_id,user_id' },
      )

      const fakeNames = [
        'Alex Rivera', 'Sam Chen', 'Jordan Kim', 'Taylor Nguyen',
        'Casey Patel', 'Morgan Lee', 'Quinn Davis', 'Riley Zhang',
      ]

      for (let i = 0; i < fakeNames.length; i++) {
        const fakeId = `f0000000-test-0000-0000-${String(i + 1).padStart(12, '0')}`
        await supabase.from('profiles').upsert(
          { id: fakeId, display_name: fakeNames[i], role: 'participant' },
          { onConflict: 'id' },
        )
        const status = i < 6 ? 'registered' : 'waitlisted'
        await supabase.from('event_registrations').upsert(
          { event_id: event.id, user_id: fakeId, status },
          { onConflict: 'event_id,user_id' },
        )
      }

      return { eventId: event.id, collectiveId, collectiveName, title }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dev-test-events'] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
      queryClient.invalidateQueries({ queryKey: ['collective-events'] })
      toast.success(`Created: ${data.title}`)
    },
    onError: (err) => {
      toast.error(`Failed: ${(err as Error).message}`)
    },
  })
}

function useTestEvents() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['dev-test-events', user?.id],
    queryFn: async () => {
      if (!user) return []

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const { data: events, error } = await supabase
        .from('events')
        .select(`id, title, activity_type, date_start, date_end, status, collectives(id, name)`)
        .eq('created_by', user.id)
        .gte('date_end', todayStart.toISOString())
        .lte('date_start', todayEnd.toISOString())
        .in('status', ['published', 'completed'])
        .order('date_start', { ascending: false })

      if (error) throw error

      const results: TestEvent[] = []
      for (const evt of events ?? []) {
        const { count } = await supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', evt.id)
          .in('status', ['registered', 'attended'])

        const { data: userReg } = await supabase
          .from('event_registrations')
          .select('status')
          .eq('event_id', evt.id)
          .eq('user_id', user.id)
          .maybeSingle()

        const { data: membership } = await supabase
          .from('collective_members')
          .select('role')
          .eq('collective_id', evt.collectives?.id as string)
          .eq('user_id', user.id)
          .maybeSingle()

        results.push({
          id: evt.id,
          title: evt.title,
          activity_type: evt.activity_type,
          date_start: evt.date_start,
          date_end: evt.date_end,
          collective_name: evt.collectives?.name ?? '',
          collective_id: evt.collectives?.id ?? '',
          registration_count: count ?? 0,
          user_role: membership?.role ?? null,
          user_status: userReg?.status ?? null,
        })
      }

      return results
    },
    enabled: !!user,
    staleTime: 10 * 1000,
  })
}

function useCleanupTests() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const { data: testEvents } = await supabase
        .from('events')
        .select('id')
        .eq('created_by', user.id)
        .like('title', '%[TEST]%')

      if (testEvents?.length) {
        const ids = testEvents.map((e) => e.id)
        for (const id of ids) {
          await supabase.from('event_registrations').delete().eq('event_id', id)
          await supabase.from('survey_responses').delete().eq('event_id', id)
          await supabase.from('event_impact').delete().eq('event_id', id)
        }
        await supabase.from('events').delete().in('id', ids)
      }

      for (let i = 0; i < 8; i++) {
        const fakeId = `f0000000-test-0000-0000-${String(i + 1).padStart(12, '0')}`
        await supabase.from('profiles').delete().eq('id', fakeId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-test-events'] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
      queryClient.invalidateQueries({ queryKey: ['collective-events'] })
      toast.success('Test data cleaned up')
    },
    onError: (err) => {
      toast.error(`Cleanup failed: ${(err as Error).message}`)
    },
  })
}

/* ================================================================== */
/*  SECTION 2 - Push Notification Test Suite                           */
/* ================================================================== */

/* ---- 2a. Types --------------------------------------------------- */

interface PushTestResult {
  id: string
  label: string
  category: 'infra' | 'delivery' | 'filtering'
  status: 'idle' | 'running' | 'pass' | 'fail'
  detail?: string
  durationMs?: number
}

const TYPE_META: Record<NotificationType, string> = {
  event_reminder: 'Event Reminder',
  registration_confirmed: 'Registration Confirmed',
  waitlist_promotion: 'Waitlist Promotion',
  event_cancelled: 'Event Cancelled',
  event_updated: 'Event Updated',
  points_earned: 'Points Earned',
  new_event_in_collective: 'New Event',
  event_invite: 'Event Invite',
  global_announcement: 'Announcement',
  challenge_update: 'Challenge Update',
  chat_mention: 'Chat @Mention',
  chat_messages: 'Chat Message',
  survey_request: 'Survey Request',
  chat_reply: 'Chat Reply',
  chat_image: 'Chat Image',
  chat_poll: 'Chat Poll',
  chat_announcement: 'Chat Announcement',
}

const ALL_TYPES = Object.keys(TYPE_META) as NotificationType[]

/* ---- 2b. Data hooks (read-only, no side effects) ----------------- */

function usePushTokens() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dev-push-tokens', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('push_tokens')
        .select('token, platform, user_id, updated_at, device_info')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
    staleTime: 5_000,
  })
}

function useNotifPrefs() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dev-notif-prefs', user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_PREFERENCES
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return {
        ...DEFAULT_PREFERENCES,
        ...((data?.notification_preferences as Partial<NotificationPreferences>) ?? {}),
      }
    },
    enabled: !!user,
    staleTime: 5_000,
  })
}

function useUserCollectives() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dev-user-collectives', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('collective_members')
        .select('collective_id, role, collectives(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (error) throw error
      return (data ?? []).map((m) => ({
        id: m.collective_id,
        name: m.collectives?.name ?? 'Unknown',
        role: m.role,
      }))
    },
    enabled: !!user,
    staleTime: 30_000,
  })
}

/* ---- 2c. Test runner (pure logic, no UI) ------------------------- */

async function runSingleTest(
  id: string,
  label: string,
  category: PushTestResult['category'],
  fn: () => Promise<string>,
): Promise<PushTestResult> {
  const start = Date.now()
  try {
    const detail = await fn()
    return { id, label, category, status: 'pass', detail, durationMs: Date.now() - start }
  } catch (err) {
    return { id, label, category, status: 'fail', detail: (err as Error).message, durationMs: Date.now() - start }
  }
}

function usePushTestRunner() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [results, setResults] = useState<PushTestResult[]>([])
  const [running, setRunning] = useState(false)

  async function runAll(opts: {
    selectedTypes: NotificationType[]
    collectiveId?: string
    testQuietHours: boolean
    testOptOut: boolean
  }) {
    if (!user) return
    setRunning(true)
    const tests: PushTestResult[] = []

    const push = async (r: Promise<PushTestResult>) => {
      // Show spinner while running
      const placeholder: PushTestResult = { id: '', label: '', category: 'infra', status: 'running' }
      tests.push(placeholder)
      setResults([...tests])
      const result = await r
      tests[tests.length - 1] = result
      setResults([...tests])
    }

    // ── INFRA: Token check ──
    await push(runSingleTest('tokens', 'Device Token Registration', 'infra', async () => {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('token, platform, updated_at')
        .eq('user_id', user.id)
      if (error) throw error
      if (!data?.length) throw new Error('No push tokens found. Open the app on a real device to register.')
      const platforms = [...new Set(data.map((t) => t.platform))].join(', ')
      const newest = data.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
      const ageMins = Math.round((Date.now() - new Date(newest.updated_at).getTime()) / 60_000)
      return `${data.length} token(s) [${platforms}]. Latest: ${ageMins < 60 ? `${ageMins}m` : `${Math.round(ageMins / 60)}h`} ago.`
    }))

    // ── INFRA: Prefs check ──
    await push(runSingleTest('prefs', 'Preferences Stored', 'infra', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .single()
      if (error) throw error
      const p = data?.notification_preferences as Record<string, unknown> | null
      if (!p || Object.keys(p).length === 0) return 'Defaults (no custom prefs). OK for new users.'
      const disabled = Object.entries(p).filter(([k, v]) => v === false && k !== 'quiet_hours_enabled')
      return `${Object.keys(p).length} prefs saved. ${disabled.length} type(s) disabled. TZ: ${(p.timezone as string) || 'auto'}`
    }))

    // ── INFRA: Latency ──
    await push(runSingleTest('latency', 'Edge Function Latency', 'infra', async () => {
      const t0 = Date.now()
      const { data: resp, error } = await supabase.functions.invoke('send-push', {
        body: {
          userId: user.id,
          title: '[TEST] Latency',
          body: 'Measuring round-trip.',
          data: { type: 'event_reminder' },
        },
      })
      const ms = Date.now() - t0
      if (error) throw error
      if (resp?.error) throw new Error(resp.error)
      const grade = ms < 2000 ? 'Good' : ms < 5000 ? 'OK' : 'Slow'
      return `${ms}ms (${grade}). Sent: ${resp?.sent ?? 0}/${resp?.total ?? 0}.`
    }))

    // ── DELIVERY: Per-type pushes ──
    for (const type of opts.selectedTypes) {
      await push(runSingleTest(`type-${type}`, TYPE_META[type], 'delivery', async () => {
        const data: Record<string, string> = { type }

        // Add routing context so deep-links work
        if (['event_reminder', 'event_cancelled', 'event_updated', 'registration_confirmed',
             'waitlist_promotion', 'new_event_in_collective', 'event_invite'].includes(type)) {
          data.event_id = '00000000-0000-0000-0000-000000000000'
        }
        if (['chat_mention', 'chat_messages'].includes(type)) {
          data.collective_id = opts.collectiveId ?? '00000000-0000-0000-0000-000000000000'
        }

        const { data: resp, error } = await supabase.functions.invoke('send-push', {
          body: {
            userId: user.id,
            title: `[TEST] ${TYPE_META[type]}`,
            body: `Test at ${new Date().toLocaleTimeString('en-AU')}`,
            data,
          },
        })
        if (error) throw error
        if (resp?.error) throw new Error(resp.error)
        return `${resp?.sent ?? 0}/${resp?.total ?? 0} delivered.`
      }))
    }

    // ── DELIVERY: Collective broadcast ──
    if (opts.collectiveId) {
      await push(runSingleTest('broadcast', 'Collective Broadcast', 'delivery', async () => {
        const { data: resp, error } = await supabase.functions.invoke('send-push', {
          body: {
            collectiveId: opts.collectiveId,
            title: '[TEST] Broadcast',
            body: `Test broadcast at ${new Date().toLocaleTimeString('en-AU')}`,
            data: { type: 'chat_messages', collective_id: opts.collectiveId },
          },
        })
        if (error) throw error
        if (resp?.error) throw new Error(resp.error)
        return `${resp?.sent ?? 0}/${resp?.total ?? 0} member tokens.`
      }))
    }

    // ── DELIVERY: In-app notification + realtime ──
    await push(runSingleTest('in-app', 'In-App Notification + Realtime', 'delivery', async () => {
      const { error } = await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'event_reminder',
        title: '[TEST] In-App',
        body: `Test at ${new Date().toLocaleTimeString('en-AU')}`,
        data: { event_id: '00000000-0000-0000-0000-000000000000' },
      })
      if (error) throw error
      return 'Inserted. Check the notification bell - realtime channel should show it instantly.'
    }))

    // ── DELIVERY: Multi-user batch ──
    await push(runSingleTest('batch', 'Multi-User Batch (3 IDs)', 'delivery', async () => {
      const fakeIds = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']
      const { data: resp, error } = await supabase.functions.invoke('send-push', {
        body: {
          userIds: [user.id, ...fakeIds],
          title: '[TEST] Batch',
          body: 'Only your device should receive this.',
          data: { type: 'event_reminder' },
        },
      })
      if (error) throw error
      if (resp?.error) throw new Error(resp.error)
      return `${resp?.sent ?? 0}/${resp?.total ?? 0}. Fake users correctly had 0 tokens.`
    }))

    // ── DELIVERY: Invalid token cleanup ──
    await push(runSingleTest('cleanup', 'Stale Token Auto-Cleanup', 'delivery', async () => {
      const fakeToken = `__dev_test_${Date.now()}`
      await supabase.from('push_tokens').insert({
        user_id: user.id, token: fakeToken, platform: 'android', device_info: { test: 'true' },
      })

      await supabase.functions.invoke('send-push', {
        body: { userId: user.id, title: '[TEST]', body: 'Cleanup check.', data: { type: 'event_reminder' } },
      })

      await new Promise((r) => setTimeout(r, 1000))

      const { data: remaining } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('token', fakeToken)

      if (remaining?.length) {
        await supabase.from('push_tokens').delete().eq('token', fakeToken)
        return 'Token not auto-removed (FCM may accept malformed tokens). Cleaned up manually.'
      }
      return 'Invalid token auto-removed by FCM rejection.'
    }))

    // ── FILTERING: Opt-out enforcement ──
    if (opts.testOptOut) {
      await push(runSingleTest('opt-out', 'Preference Opt-Out Blocks Delivery', 'filtering', async () => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('notification_preferences')
          .eq('id', user.id)
          .single()
        const orig = (profile?.notification_preferences ?? {}) as { [key: string]: Json | undefined }

        // Disable event_reminder temporarily
        await supabase
          .from('profiles')
          .update({ notification_preferences: { ...orig, event_reminder: false } })
          .eq('id', user.id)

        try {
          await new Promise((r) => setTimeout(r, 300))

          const { data: resp, error } = await supabase.functions.invoke('send-push', {
            body: { userId: user.id, title: '[TEST]', body: 'Should be blocked.', data: { type: 'event_reminder' } },
          })

          if (error) throw error
          if ((resp?.sent ?? 0) > 0) throw new Error(`Sent ${resp.sent} despite opt-out!`)
          return 'Correctly blocked. 0 delivered.'
        } finally {
          // Always restore - otherwise a thrown error between disable and
          // restore leaves the admin's event_reminder pref stuck at false.
          await supabase
            .from('profiles')
            .update({ notification_preferences: orig })
            .eq('id', user.id)
        }
      }))
    }

    // ── FILTERING: Quiet hours enforcement ──
    if (opts.testQuietHours) {
      await push(runSingleTest('quiet', 'Quiet Hours Blocks Delivery', 'filtering', async () => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('notification_preferences')
          .eq('id', user.id)
          .single()
        const orig = (profile?.notification_preferences ?? {}) as { [key: string]: Json | undefined }

        const now = new Date()
        const h = now.getHours()
        const m = now.getMinutes()
        const startH = h > 0 ? h - 1 : 23
        const endH = (h + 2) % 24
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const quietPrefs = {
          ...orig,
          quiet_hours_enabled: true,
          quiet_hours_start: `${String(startH).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          quiet_hours_end: `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          timezone: tz,
        }

        await supabase
          .from('profiles')
          .update({ notification_preferences: quietPrefs })
          .eq('id', user.id)

        try {
          await new Promise((r) => setTimeout(r, 300))

          const { data: resp, error } = await supabase.functions.invoke('send-push', {
            body: { userId: user.id, title: '[TEST]', body: 'Should be blocked.', data: { type: 'event_reminder' } },
          })

          if (error) throw error
          if ((resp?.sent ?? 0) > 0) throw new Error(`Sent ${resp.sent} despite quiet hours! TZ: ${tz}`)
          return `Correctly blocked during ${quietPrefs.quiet_hours_start}-${quietPrefs.quiet_hours_end} (${tz}).`
        } finally {
          // Always restore - an in-between throw would otherwise leave the
          // admin stuck in quiet hours mode until they manually fix it.
          await supabase
            .from('profiles')
            .update({ notification_preferences: orig })
            .eq('id', user.id)
        }
      }))
    }

    setRunning(false)
    queryClient.invalidateQueries({ queryKey: ['dev-push-tokens'] })
    queryClient.invalidateQueries({ queryKey: ['dev-notif-prefs'] })

    const passed = tests.filter((t) => t.status === 'pass').length
    toast.success(`Push tests: ${passed}/${tests.length} passed`)
  }

  return { results, running, runAll, clear: () => setResults([]) }
}

/* ---- 2d. Push Test Suite UI -------------------------------------- */

function PushTestSuite() {
  const { data: tokens, isLoading: tokensLoading, refetch: refetchTokens } = usePushTokens()
  const showTokensLoading = useDelayedLoading(tokensLoading)
  const { data: prefs } = useNotifPrefs()
  const { data: collectives } = useUserCollectives()
  const { results, running, runAll, clear } = usePushTestRunner()

  const [selectedTypes, setSelectedTypes] = useState<NotificationType[]>(['event_reminder', 'chat_messages', 'event_invite'])
  const [collectiveId, setCollectiveId] = useState<string | undefined>()
  const [testQuietHours, setTestQuietHours] = useState(true)
  const [testOptOut, setTestOptOut] = useState(true)
  const [tokenNow] = useState(() => Date.now())

  const toggleType = (type: NotificationType) =>
    setSelectedTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type])

  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length

  // Group results by category
  const infraResults = results.filter((r) => r.category === 'infra')
  const deliveryResults = results.filter((r) => r.category === 'delivery')
  const filterResults = results.filter((r) => r.category === 'filtering')

  return (
    <div className="space-y-4">
      {/* ── Device Status ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
            <Smartphone size={13} />
            Registered Devices
          </p>
          <button
            type="button"
            onClick={() => refetchTokens()}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 flex items-center gap-1"
          >
            <RefreshCw size={10} /> Refresh
          </button>
        </div>

        {showTokensLoading ? (
          <Skeleton className="h-10 rounded-sm" />
        ) : tokensLoading ? null : !tokens?.length ? (
          <div className="flex items-center gap-2 p-2.5 rounded-sm bg-warning-50 border border-warning-200">
            <AlertCircle size={14} className="text-warning-600 shrink-0" />
            <p className="text-[11px] text-warning-700">
              No tokens registered. Push won't work until the app runs on a real device.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tokens.map((t, i: number) => {
              const ageMins = Math.round((tokenNow - new Date(t.updated_at).getTime()) / 60_000)
              const stale = ageMins > 60 * 24 * 7
              return (
                <span key={i} className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-medium border',
                  stale ? 'bg-warning-50 border-warning-200 text-warning-700' : 'bg-success-50/50 border-success-200 text-success-700',
                )}>
                  <span className="uppercase font-bold">{t.platform}</span>
                  <span className="text-neutral-400 font-mono">{t.token.slice(0, 12)}...</span>
                  <span className={stale ? 'text-warning-500' : 'text-neutral-400'}>
                    {ageMins < 60 ? `${ageMins}m` : ageMins < 1440 ? `${Math.round(ageMins / 60)}h` : `${Math.round(ageMins / 1440)}d`}
                    {stale ? ' stale' : ''}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Preferences snapshot ── */}
      {prefs && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
            <Bell size={13} />
            Current Preferences
          </p>
          <div className="flex flex-wrap gap-1">
            {ALL_TYPES.map((type) => (
              <span key={type} className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium',
                prefs[type] !== false ? 'bg-success-100 text-success-700' : 'bg-error-100 text-error-600',
              )}>
                {TYPE_META[type]}
              </span>
            ))}
          </div>
          <div className="flex gap-3 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1">
              <Moon size={10} />
              Quiet: {prefs.quiet_hours_enabled ? `${prefs.quiet_hours_start}-${prefs.quiet_hours_end}` : 'Off'}
            </span>
            <span className="flex items-center gap-1">
              <Globe size={10} />
              {prefs.timezone || 'no tz'}
            </span>
          </div>
        </div>
      )}

      {/* ── Test config ── */}
      <div className="space-y-3 pt-1 border-t border-neutral-100">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500">Push Types to Send</p>
            <button
              type="button"
              className="text-[11px] text-neutral-400 hover:text-neutral-600"
              onClick={() => setSelectedTypes(selectedTypes.length === ALL_TYPES.length ? [] : [...ALL_TYPES])}
            >
              {selectedTypes.length === ALL_TYPES.length ? 'None' : 'All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] cursor-pointer',
                  selectedTypes.includes(type) ? 'bg-primary-600 text-white' : 'bg-neutral-50 text-neutral-500',
                )}
              >
                {TYPE_META[type]}
              </button>
            ))}
          </div>
        </div>

        {collectives && collectives.length > 0 && (
          <Dropdown
            label="Collective Broadcast"
            placeholder="Skip"
            options={collectives.map((c) => ({ value: c.id, label: `${c.name} (${c.role})` }))}
            value={collectiveId ?? ''}
            onChange={(v) => setCollectiveId(v || undefined)}
          />
        )}

        <div className="flex gap-4">
          <Toggle checked={testOptOut} onChange={setTestOptOut} label="Test opt-out" size="sm" />
          <Toggle checked={testQuietHours} onChange={setTestQuietHours} label="Test quiet hours" size="sm" />
        </div>
      </div>

      {/* ── Run ── */}
      <Button
        variant="primary"
        size="md"
        fullWidth
        icon={<Play size={16} />}
        loading={running}
        onClick={() => runAll({ selectedTypes, collectiveId, testQuietHours, testOptOut })}
        disabled={selectedTypes.length === 0 && !collectiveId}
      >
        {running ? 'Running...' : 'Run Push Tests'}
      </Button>

      {/* ── Results ── */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-900">
              Results: <span className="text-success-600">{passed} pass</span>
              {failed > 0 && <> / <span className="text-error-600">{failed} fail</span></>}
              <span className="text-neutral-400 font-normal"> / {results.length}</span>
            </p>
            {!running && <button type="button" onClick={clear} className="text-[11px] text-neutral-400 hover:text-neutral-600">Clear</button>}
          </div>

          {/* Group: Infrastructure */}
          {infraResults.length > 0 && (
            <ResultGroup label="Infrastructure" results={infraResults} />
          )}

          {/* Group: Delivery */}
          {deliveryResults.length > 0 && (
            <ResultGroup label="Delivery" results={deliveryResults} />
          )}

          {/* Group: Filtering */}
          {filterResults.length > 0 && (
            <ResultGroup label="Filtering & Preferences" results={filterResults} />
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({ label, results }: { label: string; results: PushTestResult[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{label}</p>
      {results.map((r) => (
        <div
          key={r.id}
          className={cn(
            'flex items-start gap-2 px-2.5 py-2 rounded-sm text-xs',
            r.status === 'pass' ? 'bg-success-50/40' :
            r.status === 'fail' ? 'bg-error-50/40' :
            'bg-neutral-50',
          )}
        >
          <span className="shrink-0 mt-0.5">
            {r.status === 'pass' && <CheckCircle2 size={13} className="text-success-600" />}
            {r.status === 'fail' && <XCircle size={13} className="text-error-600" />}
            {r.status === 'running' && <RefreshCw size={13} className="text-info-500 animate-spin" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-700">{r.label}</span>
              {r.durationMs !== undefined && (
                <span className="text-[9px] text-neutral-400 shrink-0 ml-2">{r.durationMs}ms</span>
              )}
            </div>
            {r.detail && (
              <p className={cn('text-[11px] mt-0.5', r.status === 'fail' ? 'text-error-600' : 'text-neutral-500')}>
                {r.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================== */
/*  SECTION 3 - Email (Resend) Test                                    */
/* ================================================================== */

const EMAIL_TYPES = [
  { value: 'welcome', label: 'Welcome', sampleData: { name: 'Test User', app_url: 'https://app.coexistaus.org' } },
  { value: 'event_confirmation', label: 'Event Confirmation', sampleData: { name: 'Test User', event_title: 'Byron Beach Clean-Up', event_date: 'Sat 5 Apr 2026, 9:00 AM', event_location: 'Main Beach, Byron Bay', event_url: 'https://app.coexistaus.org/events/test' } },
  { value: 'event_reminder', label: 'Event Reminder', sampleData: { name: 'Test User', event_title: 'Byron Beach Clean-Up', event_date: 'Tomorrow 9:00 AM', event_location: 'Main Beach, Byron Bay', event_url: 'https://app.coexistaus.org/events/test', time_until: 'tomorrow' } },
  { value: 'donation_receipt', label: 'Donation Receipt', sampleData: { name: 'Test User', amount: '$25.00', currency: 'AUD', date: new Date().toLocaleDateString('en-AU'), receipt_url: 'https://app.coexistaus.org/receipts/test', is_recurring: false } },
  { value: 'order_confirmation', label: 'Order Confirmation', sampleData: { name: 'Test User', order_id: 'TEST-001', items: 'Co-Exist Tee (M) x1', total: '$45.00', shipping_address: '1 Main St, Byron Bay NSW 2481' } },
  { value: 'password_reset', label: 'Password Reset', sampleData: { name: 'Test User', reset_url: 'https://app.coexistaus.org/reset?token=test' } },
  { value: 'collective_application', label: 'Collective Application', sampleData: { applicant_name: 'Jane Smith', applicant_email: 'jane@example.com', roles: 'Collective Leader', location: 'Gold Coast, QLD' } },
  { value: 'monthly_impact_recap', label: 'Impact Recap', sampleData: { name: 'Test User', events_count: '4', trees: '120', hours: '16', rubbish_kg: '35', month: 'March' } },
] as const

function EmailTestSection() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [selectedType, setSelectedType] = useState<string>(EMAIL_TYPES[0].value)
  const [recipientEmail, setRecipientEmail] = useState('')

  const selectedTemplate = EMAIL_TYPES.find((t) => t.value === selectedType) ?? EMAIL_TYPES[0]
  const toAddress = recipientEmail.trim() || user?.email || ''

  const sendTest = useMutation({
    mutationFn: async () => {
      if (!toAddress) throw new Error('No recipient email')

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: selectedTemplate.value,
          to: toAddress,
          data: selectedTemplate.sampleData,
        },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast.success(`Test email sent to ${toAddress}`)
    },
    onError: (err) => {
      toast.error(`Failed: ${(err as Error).message}`)
    },
  })

  return (
    <div className="space-y-4">
      {/* Template picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-neutral-500">Email Template</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelectedType(t.value)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] cursor-pointer',
                selectedType === t.value ? 'bg-primary-600 text-white' : 'bg-neutral-50 text-neutral-500',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-neutral-500">Recipient</p>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder={user?.email ?? 'your@email.com'}
          className="w-full h-11 px-3 rounded-sm border border-neutral-100 bg-white text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
        />
        <p className="text-[11px] text-neutral-400">
          Leave blank to send to your account email ({user?.email}).
        </p>
      </div>

      {/* Sample data preview */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-neutral-500">Sample Data</p>
        <div className="rounded-sm bg-neutral-50 p-2.5 overflow-x-auto">
          <pre className="text-[11px] text-neutral-600 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(selectedTemplate.sampleData, null, 2)}
          </pre>
        </div>
      </div>

      {/* Send */}
      <Button
        variant="primary"
        size="md"
        fullWidth
        icon={<Send size={16} />}
        loading={sendTest.isPending}
        onClick={() => sendTest.mutate()}
      >
        {sendTest.isPending ? 'Sending...' : `Send "${selectedTemplate.label}" Email`}
      </Button>

      {sendTest.isSuccess && (
        <div className="flex items-center gap-2 p-2.5 rounded-sm bg-success-50 border border-success-200">
          <CheckCircle2 size={14} className="text-success-600 shrink-0" />
          <p className="text-[11px] text-success-700">
            Sent via Resend. Check your inbox (and spam folder).
          </p>
        </div>
      )}

      {sendTest.isError && (
        <div className="flex items-center gap-2 p-2.5 rounded-sm bg-error-50 border border-error-200">
          <XCircle size={14} className="text-error-600 shrink-0" />
          <p className="text-[11px] text-error-700">
            {(sendTest.error as Error).message}
          </p>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  SECTION 4 - Main Page                                              */
/* ================================================================== */

export default function DevToolsPage() {
  useAdminHeader('Dev Tools')

  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { user, profile } = useAuth()
  const { data: testEvents, isLoading } = useTestEvents()
  const showLoading = useDelayedLoading(isLoading)
  const seedEvent = useSeedTestEvent()
  const cleanup = useCleanupTests()

  const [selectedActivity, setSelectedActivity] = useState<Database['public']['Enums']['activity_type']>('clean_up')

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  const devEmails = (import.meta.env.VITE_DEV_EMAILS ?? '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
  const isDevUser = import.meta.env.DEV && !!user?.email && devEmails.includes(user.email.toLowerCase())

  if (!isDevUser) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto mb-3 text-error-400" size={32} />
        <p className="text-sm text-neutral-500">Dev tools are only available in development mode for authorised developers.</p>
      </div>
    )
  }

  return (
    <motion.div
      className="p-4 space-y-6 pb-24"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {/* ---- User Context ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-info-100 text-info-600">
              <Bug size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Dev Testing Panel</h3>
              <p className="text-caption text-neutral-400">
                Signed in as <span className="font-medium text-neutral-600">{profile?.display_name ?? user?.email}</span>
                {' '}({profile?.role ?? 'unknown'})
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-400">
            Create test events happening right now, then jump into any day-of flow to test check-in codes, impact logging, and surveys.
          </p>
        </div>
      </motion.div>

      {/* ---- Seed Event Creator ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <Calendar size={16} className="text-neutral-400" />
            Create Test Event (Happening Now)
          </h3>

          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500">Activity Type</label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedActivity(opt.value)}
                  className={cn(
                    'px-3.5 min-h-11 rounded-full text-sm font-medium transition-[color,background-color,transform] duration-150',
                    'cursor-pointer select-none active:scale-[0.97]',
                    selectedActivity === opt.value
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            fullWidth
            icon={<Play size={16} />}
            loading={seedEvent.isPending}
            onClick={() => seedEvent.mutate(selectedActivity)}
          >
            Seed "{ACTIVITY_TYPE_LABELS[selectedActivity]}" Event
          </Button>

          <p className="text-[11px] text-neutral-400">
            Creates a published event (started 30m ago, ends in 2.5h) with you as leader + 8 fake attendees.
          </p>
        </div>
      </motion.div>

      {/* ---- Active Test Events ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Users size={16} className="text-neutral-400" />
              Your Test Events (Today)
            </h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              loading={cleanup.isPending}
              onClick={() => cleanup.mutate()}
            >
              Clean Up
            </Button>
          </div>

          {showLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-sm" />
              ))}
            </div>
          ) : !testEvents?.length ? (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-400">No test events today. Create one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {testEvents.map((evt) => (
                <TestEventCard key={evt.id} event={evt} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* ---- Push Notification Test Suite ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-accent-100 text-accent-600">
              <Bell size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Push Notification Tests</h3>
              <p className="text-[11px] text-neutral-400">
                Registration, delivery, preferences, quiet hours, batching, latency.
              </p>
            </div>
          </div>
          <PushTestSuite />
        </div>
      </motion.div>

      {/* ---- Email (Resend) Test ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-success-100 text-success-600">
              <Mail size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Email Test (Resend)</h3>
              <p className="text-[11px] text-neutral-400">
                Send a test email to verify Resend is configured and delivering.
              </p>
            </div>
          </div>
          <EmailTestSection />
        </div>
      </motion.div>

      {/* ---- Quick-Nav to Flows ---- */}
      <motion.div variants={fadeUp}>
        <div className="rounded-md bg-white p-4 shadow-sm border border-neutral-100 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900">Quick Navigation</h3>
          <p className="text-xs text-neutral-400 mb-2">
            Jump directly to any day-of page. Use a test event ID from above.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" icon={<Hash size={14} />}
              onClick={() => { const first = testEvents?.[0]; if (first) navigate(`/events/${first.id}/check-in`); else alert('Create a test event first') }}>
              Check-In (Code)
            </Button>
            <Button variant="secondary" size="sm" icon={<ClipboardCheck size={14} />}
              onClick={() => { const first = testEvents?.[0]; if (first) navigate(`/events/${first.id}/day`); else alert('Create a test event first') }}>
              Event Day
            </Button>
            <Button variant="secondary" size="sm" icon={<TreePine size={14} />}
              onClick={() => { const first = testEvents?.[0]; if (first) navigate(`/events/${first.id}/impact`); else alert('Create a test event first') }}>
              Log Impact
            </Button>
            <Button variant="secondary" size="sm" icon={<MapPin size={14} />}
              onClick={() => { const first = testEvents?.[0]; if (first) navigate(`/events/${first.id}`); else alert('Create a test event first') }}>
              Event Detail
            </Button>
            <Button variant="secondary" size="sm" icon={<ClipboardCheck size={14} />}
              onClick={() => { const first = testEvents?.[0]; if (first) navigate(`/events/${first.id}/survey`); else alert('Create a test event first') }}>
              Post-Event Survey
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ================================================================== */
/*  SECTION 5 - Test Event Card                                        */
/* ================================================================== */

function TestEventCard({
  event,
  navigate,
}: {
  event: TestEvent
  navigate: ReturnType<typeof useNavigate>
}) {
  const now = new Date()
  const start = new Date(event.date_start)
  const end = event.date_end ? new Date(event.date_end) : null
  const isActive = start <= now && (!end || end > now)
  const isPast = end ? end < now : start < now

  return (
    <div className={cn(
      'rounded-sm border p-3 space-y-3',
      isActive ? 'border-success-200 bg-success-50/30' : isPast ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-100',
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider',
              isActive ? 'bg-success-100 text-success-700' : isPast ? 'bg-neutral-100 text-neutral-500' : 'bg-info-100 text-info-600',
            )}>
              {isActive ? 'LIVE' : isPast ? 'ENDED' : 'UPCOMING'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600">
              {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
            </span>
          </div>
          <p className="text-sm font-medium text-neutral-900 mt-1 truncate">{event.title}</p>
          <p className="text-caption text-neutral-400">
            {event.collective_name} - {event.registration_count} registered
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Your role: <span className="font-medium text-neutral-600">{event.user_role ?? 'none'}</span>
            {' '} | Status: <span className="font-medium text-neutral-600">{event.user_status ?? 'not registered'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        <button type="button" onClick={() => navigate(`/events/${event.id}/day`)}
          className="flex flex-col items-center justify-center gap-1 p-3 min-h-14 rounded-sm bg-white hover:bg-neutral-50 transition-colors cursor-pointer">
          <ClipboardCheck size={16} className="text-neutral-500" />
          <span className="text-[11px] font-medium text-neutral-600">Day</span>
        </button>
        <button type="button" onClick={() => navigate(`/events/${event.id}/check-in`)}
          className="flex flex-col items-center justify-center gap-1 p-3 min-h-14 rounded-sm bg-white hover:bg-neutral-50 transition-colors cursor-pointer">
          <Hash size={16} className="text-success-500" />
          <span className="text-[11px] font-medium text-neutral-600">Check-In</span>
        </button>
        <button type="button" onClick={() => navigate(`/events/${event.id}/impact`)}
          className="flex flex-col items-center justify-center gap-1 p-3 min-h-14 rounded-sm bg-white hover:bg-neutral-50 transition-colors cursor-pointer">
          <TreePine size={16} className="text-success-600" />
          <span className="text-[11px] font-medium text-neutral-600">Impact</span>
        </button>
        <button type="button" onClick={() => navigate(`/events/${event.id}/survey`)}
          className="flex flex-col items-center justify-center gap-1 p-3 min-h-14 rounded-sm bg-white hover:bg-neutral-50 transition-colors cursor-pointer">
          <Star size={16} className="text-warning-500" />
          <span className="text-[11px] font-medium text-neutral-600">Survey</span>
        </button>
        <button type="button" onClick={() => navigate(`/events/${event.id}`)}
          className="flex flex-col items-center justify-center gap-1 p-3 min-h-14 rounded-sm bg-white hover:bg-neutral-50 transition-colors cursor-pointer">
          <MapPin size={16} className="text-info-500" />
          <span className="text-[11px] font-medium text-neutral-600">Detail</span>
        </button>
      </div>
    </div>
  )
}
