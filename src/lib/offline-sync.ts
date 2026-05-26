import { supabase } from '@/lib/supabase'
import { formatEventLong } from '@/lib/date-format'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PendingCheckIn {
  eventId: string
  userId: string
  timestamp: string
}

/**
 * All action types that can be safely queued for offline sync.
 *
 * NOT queued (require real-time validation):
 *  - Stock reservation / purchase flow
 *  - Promo code validation
 *  - Event registration (capacity check)
 *  - Admin operations
 *  - Payment / checkout flows
 */
export type OfflineActionType =
  | 'check-in'
  | 'bulk-check-in'
  | 'promote-waitlist'
  | 'chat-message'
  | 'profile-update'
  | 'task-complete'
  | 'task-update-notes'
  | 'task-undo-complete'
  | 'task-skip'
  | 'todo-create'
  | 'todo-update'
  | 'todo-toggle'
  | 'todo-delete'
  | 'report-content'
  | 'block-user'
  | 'unblock-user'
  | 'mark-notification-read'
  | 'mark-all-notifications-read'
  | 'log-impact'
  | 'survey-response'
  | 'announcement-response'
  | 'poll-vote'
  | 'module-progress'
  | 'section-progress'
  | 'quiz-submit'

export interface OfflineAction {
  id: string
  type: OfflineActionType
  payload: Record<string, unknown>
  createdAt: string
  retries: number
}

export interface ChatDraft {
  collectiveId: string
  content: string
  replyToId?: string
  updatedAt: string
}

export interface SyncResult {
  synced: number
  failed: number
  conflicts: string[]
}

/* ------------------------------------------------------------------ */
/*  Storage keys                                                       */
/* ------------------------------------------------------------------ */

const QUEUE_KEY = 'coexist-offline-checkin-queue'
const ACTION_QUEUE_KEY = 'coexist-offline-action-queue'
const DRAFT_KEY = 'coexist-chat-drafts'
const CACHE_KEY = 'coexist-query-cache'
const LAST_SYNC_KEY = 'coexist-last-sync'

/* ------------------------------------------------------------------ */
/*  Generic helpers                                                    */
/* ------------------------------------------------------------------ */

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function safeSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Storage full - try evicting query cache first (action queue is higher priority)
    if (key !== CACHE_KEY) {
      try {
        localStorage.removeItem(CACHE_KEY)
        localStorage.setItem(key, JSON.stringify(value))
        return true
      } catch {
        // Still full even after cache eviction
      }
    }
    // Dispatch event so UI can show a warning
    window.dispatchEvent(new CustomEvent('coexist:storage-full'))
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Offline check-in queue (legacy, still used by check-in page)       */
/* ------------------------------------------------------------------ */

function getQueue(): PendingCheckIn[] {
  return safeGet<PendingCheckIn[]>(QUEUE_KEY, [])
}

function saveQueue(queue: PendingCheckIn[]) {
  safeSet(QUEUE_KEY, queue)
}

/** Add a check-in to the offline queue */
export function queueOfflineCheckIn(eventId: string, userId: string) {
  const queue = getQueue()
  if (queue.some((q) => q.eventId === eventId && q.userId === userId)) return
  queue.push({ eventId, userId, timestamp: new Date().toISOString() })
  saveQueue(queue)
}

/** Sync all queued check-ins to Supabase. Returns number successfully synced. */
export async function syncOfflineCheckIns(): Promise<number> {
  const queue = getQueue()
  if (queue.length === 0) return 0

  let synced = 0
  const remaining: PendingCheckIn[] = []

  const BATCH = 5
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        // Legacy queue is self check-in only (queueOfflineCheckIn callers
        // all pass user.id). UPSERT so a walk-up who never registered
        // before losing wifi still lands as 'attended' on replay. The BE
        // day-of trigger is BEFORE UPDATE - INSERTs bypass it, UPDATEs
        // still get the day-of guard. Per Tate 2026-05-23 Co-Exist.
        const { error, count } = await supabase
          .from('event_registrations')
          .upsert(
            {
              event_id: item.eventId,
              user_id: item.userId,
              status: 'attended',
              checked_in_at: item.timestamp,
              registered_at: item.timestamp,
            },
            { onConflict: 'event_id,user_id' },
          )
        return { item, error, count }
      }),
    )
    for (const r of results) {
      if (r.status === 'rejected') {
        remaining.push(batch[results.indexOf(r)])
      } else if (r.value.error) {
        remaining.push(r.value.item)
      } else {
        synced++
      }
    }
  }

  saveQueue(remaining)
  return synced
}

/** How many check-ins are waiting to be synced */
export function getPendingCheckInCount(): number {
  return getQueue().length
}

/* ------------------------------------------------------------------ */
/*  Generic offline action queue                                       */
/* ------------------------------------------------------------------ */

function getActionQueue(): OfflineAction[] {
  return safeGet<OfflineAction[]>(ACTION_QUEUE_KEY, [])
}

function saveActionQueue(queue: OfflineAction[]): boolean {
  return safeSet(ACTION_QUEUE_KEY, queue)
}

/** Generate an idempotency UUID for server-side replay dedup. */
function newClientActionId(): string {
  // crypto.randomUUID is universally available in Capacitor 6 + modern browsers.
  // Fallback to a v4-shape hex if we ever land on a runtime without it (paranoia).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  const b = new Uint8Array(16)
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, hex).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Queue any offline action.
 *
 * If the payload does not already include a `client_action_id`, one is
 * generated. This UUID survives every retry attempt (created on enqueue,
 * not per processAction), so server-side INSERT/UPDATE handlers can use
 * the partial UNIQUE indexes on `client_action_id IS NOT NULL` (migration
 * 20260509100000) to make replay a hard no-op on duplicate. Bulletproof
 * dedup vs the existing per-table content/window heuristics.
 */
export function queueOfflineAction(
  type: OfflineActionType,
  payload: Record<string, unknown>,
) {
  const queue = getActionQueue()
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // Stamp idempotency key onto payload at enqueue time so retries reuse it.
  const stampedPayload =
    'client_action_id' in payload && payload.client_action_id
      ? payload
      : { ...payload, client_action_id: newClientActionId() }
  queue.push({ id, type, payload: stampedPayload, createdAt: new Date().toISOString(), retries: 0 })
  const saved = saveActionQueue(queue)
  if (!saved) {
    console.warn('Offline action could not be saved: device storage is full.')
  }
  return id
}

/** Get count of all pending offline actions (check-ins + generic) */
export function getPendingActionCount(): number {
  return getPendingCheckInCount() + getActionQueue().length
}

/** Get all pending actions for UI display */
export function getPendingActions(): OfflineAction[] {
  return getActionQueue()
}

const MAX_RETRIES = 3

/* ------------------------------------------------------------------ */
/*  Action processors                                                  */
/* ------------------------------------------------------------------ */

async function processChatMessage(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { collectiveId, userId, content, replyToId, client_action_id } = action.payload as {
    collectiveId: string
    userId: string
    content: string
    replyToId?: string
    client_action_id?: string
  }

  // Idempotency-first dedup: if we have a client_action_id and the row
  // already exists for it, skip. Bulletproof vs the older content+5s-window
  // heuristic, which can falsely allow duplicates when a queue drain happens
  // outside the dedup window for a successful-but-failed-to-respond INSERT.
  // The column was added in migration 20260509100000; generated TS types
  // lag the migration so we cast through `any` until types regen.
  if (client_action_id) {
    const { data: existingByKey } = await (supabase as any)
      .from('chat_messages')
      .select('id')
      .eq('client_action_id', client_action_id)
      .limit(1)
    if (existingByKey && existingByKey.length > 0) return { ok: true }
  }

  // Belt + braces: legacy content+window dedup for messages enqueued before
  // 1.8.6 (no client_action_id).
  const dedupeWindow = new Date(
    new Date(action.createdAt).getTime() - 5000,
  ).toISOString()
  const { data: existing } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('user_id', userId)
    .eq('content', content ?? '')
    .gte('created_at', dedupeWindow)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true }

  const { error } = await (supabase as any)
    .from('chat_messages')
    .insert({
      collective_id: collectiveId,
      user_id: userId,
      content,
      reply_to_id: replyToId ?? null,
      ...(client_action_id ? { client_action_id } : {}),
    })
  if (error) {
    // 23505 = UNIQUE violation on the partial index over client_action_id.
    // Means this exact action already landed; treat as success.
    if (error.code === '23505') return { ok: true }
    if (error.code === '23503' || error.code === '42501') {
      return { ok: false, conflict: 'Message to collective could not be sent. Please try again.' }
    }
    return { ok: false }
  }
  return { ok: true }
}

async function processCheckIn(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { eventId, userId, timestamp, client_action_id, isSelf } = action.payload as {
    eventId: string
    userId: string
    timestamp: string
    client_action_id?: string
    isSelf?: boolean
  }
  const { data: existing } = await (supabase as any)
    .from('event_registrations')
    .select('status, client_action_id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()

  // Idempotent: already attended OR same client_action_id already stamped.
  if (existing?.status === 'attended') return { ok: true }
  if (client_action_id && existing?.client_action_id === client_action_id) return { ok: true }

  // SELF check-in path: upsert so a walk-up who queued offline before
  // ever registering still lands as 'attended' on replay. Mirrors the
  // online useCheckIn / useCodeCheckIn upsert path. Per Tate 2026-05-23
  // Co-Exist incident.
  if (isSelf) {
    const { error } = await (supabase as any)
      .from('event_registrations')
      .upsert(
        {
          event_id: eventId,
          user_id: userId,
          status: 'attended',
          checked_in_at: timestamp,
          registered_at: timestamp,
          ...(client_action_id ? { client_action_id } : {}),
        },
        { onConflict: 'event_id,user_id' },
      )
    if (error) {
      if (error.code === '23505') return { ok: true }
      return { ok: false, conflict: 'Check-in sync failed. Please try again.' }
    }
    return { ok: true }
  }

  // LEADER check-in path: UPDATE only. Leaders don't auto-register
  // arbitrary users via this path - the WalkInSheet handles that with
  // explicit confirmation.
  const { error } = await (supabase as any)
    .from('event_registrations')
    .update({
      status: 'attended',
      checked_in_at: timestamp,
      ...(client_action_id ? { client_action_id } : {}),
    })
    .eq('event_id', eventId)
    .eq('user_id', userId)

  if (error) {
    if (error.code === '23505') return { ok: true }
    return { ok: false, conflict: 'Check-in sync failed. Please try again.' }
  }
  return { ok: true }
}

async function processBulkCheckIn(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { eventId, timestamp } = action.payload as {
    eventId: string
    timestamp: string
  }
  // Idempotent: only flip rows still in 'registered' status. If already attended,
  // the WHERE clause matches nothing and we silently succeed.
  const { error } = await supabase
    .from('event_registrations')
    .update({ status: 'attended', checked_in_at: timestamp })
    .eq('event_id', eventId)
    .eq('status', 'registered')
  if (error) return { ok: false, conflict: 'Bulk check-in sync failed. Please try again.' }
  return { ok: true }
}

async function processPromoteWaitlist(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { eventId, userId } = action.payload as {
    eventId: string
    userId: string
  }
  // Idempotent: only flip 'waitlisted' rows; if already 'registered'/'attended'
  // the WHERE clause matches nothing and we silently succeed.
  const { error } = await supabase
    .from('event_registrations')
    .update({ status: 'registered' })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'waitlisted')
  if (error) return { ok: false, conflict: 'Waitlist promotion sync failed.' }
  // Best-effort post-promotion email (skip if function unavailable; sync should
  // not fail just because the notification did).
  try {
    const [{ data: event }, { data: promotedProfile }] = await Promise.all([
      supabase.from('events').select('title, date_start').eq('id', eventId).single(),
      supabase.from('profiles').select('display_name').eq('id', userId).single(),
    ])
    if (event) {
      await supabase.functions.invoke('send-email', {
        body: {
          type: 'waitlist_promoted',
          userId,
          data: {
            name: promotedProfile?.display_name ?? 'there',
            event_title: event.title,
            // Floating local time: stored wall-clock is the wall-clock.
            event_date: formatEventLong(event.date_start),
            event_url: `https://app.coexistaus.org/events/${eventId}`,
          },
        },
      })
    }
  } catch { /* best-effort */ }
  return { ok: true }
}

async function processProfileUpdate(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, updates } = action.payload as {
    userId: string
    updates: Record<string, unknown>
  }
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
  if (error) return { ok: false, conflict: 'Profile update failed. Your changes will be retried.' }
  return { ok: true }
}

async function processTaskComplete(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { instanceId, userId, notes, timestamp } = action.payload as {
    instanceId: string
    userId: string
    notes?: string
    timestamp: string
  }

  // Check if already completed (idempotent)
  const { data: existing } = await supabase
    .from('task_instances')
    .select('status')
    .eq('id', instanceId)
    .single()
  if (existing?.status === 'completed') return { ok: true }

  const { error } = await supabase
    .from('task_instances')
    .update({
      status: 'completed',
      completed_at: timestamp,
      completed_by: userId,
      completion_notes: notes || null,
    })
    .eq('id', instanceId)
  if (error) return { ok: false, conflict: 'Task completion sync failed.' }
  return { ok: true }
}

async function processTaskSkip(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { instanceId } = action.payload as { instanceId: string }

  const { data: existing } = await supabase
    .from('task_instances')
    .select('status')
    .eq('id', instanceId)
    .single()
  if (existing?.status === 'skipped' || existing?.status === 'completed') return { ok: true }

  const { error } = await supabase
    .from('task_instances')
    .update({ status: 'skipped' })
    .eq('id', instanceId)
  if (error) return { ok: false, conflict: 'Task skip sync failed.' }
  return { ok: true }
}

async function processTaskUpdateNotes(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { instanceId, notes } = action.payload as { instanceId: string; notes: string }

  // Notes-only update is safe to apply regardless of current status -
  // if the task was completed offline-then-online we'd still want the note.
  const { error } = await supabase
    .from('task_instances')
    .update({ completion_notes: notes || null })
    .eq('id', instanceId)
  if (error) return { ok: false, conflict: 'Task note sync failed.' }
  return { ok: true }
}

async function processTaskUndoComplete(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { instanceId } = action.payload as { instanceId: string }

  // Idempotent: if already pending, nothing to do.
  const { data: existing } = await supabase
    .from('task_instances')
    .select('status')
    .eq('id', instanceId)
    .single()
  if (existing?.status === 'pending') return { ok: true }

  const { error } = await supabase
    .from('task_instances')
    .update({
      status: 'pending',
      completed_at: null,
      completed_by: null,
    })
    .eq('id', instanceId)
  if (error) return { ok: false, conflict: 'Task undo sync failed.' }
  return { ok: true }
}

async function processTodoCreate(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, title, description, due_date, due_time, priority, source_template_id } = action.payload as {
    userId: string
    title: string
    description?: string
    due_date?: string | null
    due_time?: string | null
    priority?: string
    source_template_id?: string | null
  }

  const { error } = await supabase.from('leader_todos')
    .insert({
      user_id: userId,
      title,
      description: description || null,
      due_date: due_date || null,
      due_time: due_time || null,
      priority: priority ?? 'medium',
      source_template_id: source_template_id || null,
    })
  if (error) return { ok: false, conflict: 'Todo creation failed.' }
  return { ok: true }
}

async function processTodoUpdate(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { id, ...updates } = action.payload as { id: string } & Record<string, unknown>
  const { error } = await supabase.from('leader_todos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, conflict: 'Todo update failed.' }
  return { ok: true }
}

async function processTodoToggle(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { id, completed, timestamp } = action.payload as {
    id: string
    completed: boolean
    timestamp: string
  }
  const { error } = await supabase.from('leader_todos')
    .update({
      status: completed ? 'completed' : 'pending',
      completed_at: completed ? timestamp : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, conflict: 'Todo toggle failed.' }
  return { ok: true }
}

async function processTodoDelete(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { id } = action.payload as { id: string }
  const { error } = await supabase.from('leader_todos')
    .delete()
    .eq('id', id)
  // Already deleted = success
  if (error && error.code !== 'PGRST116') return { ok: false, conflict: 'Todo deletion failed.' }
  return { ok: true }
}

async function processReportContent(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { contentId, contentType, reason, reporterId } = action.payload as {
    contentId: string
    contentType: string
    reason: string
    reporterId: string
  }

  const { data, error } = await supabase
    .from('content_reports')
    .insert({
      content_id: contentId,
      content_type: contentType,
      reason,
      reporter_id: reporterId,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) return { ok: false, conflict: 'Content report failed to sync.' }

  // Best-effort admin notification
  try {
    await supabase.functions.invoke('notify-report', {
      body: {
        record: {
          id: data.id,
          content_id: contentId,
          content_type: contentType,
          reason,
          reporter_id: reporterId,
        },
      },
    })
  } catch { /* best-effort */ }
  return { ok: true }
}

async function processBlockUser(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { blockerId, blockedId, reason } = action.payload as {
    blockerId: string
    blockedId: string
    reason?: string
  }

  const { error: blockError } = await supabase.from('user_blocks')
    .insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: reason ?? null,
    })

  // Unique violation = already blocked, treat as success
  if (blockError && blockError.code !== '23505') {
    return { ok: false, conflict: 'Block user failed to sync.' }
  }

  // Create report (best-effort)
  const reportReason = reason ? `User blocked: ${reason}` : 'User blocked by another member'
  try {
    const { data: reportData } = await supabase
      .from('content_reports')
      .insert({
        content_id: blockedId,
        content_type: 'profile',
        reason: reportReason,
        reporter_id: blockerId,
        status: 'pending',
      })
      .select('id')
      .single()
    if (reportData) {
      await supabase.functions.invoke('notify-report', {
        body: { record: { id: reportData.id, content_id: blockedId, content_type: 'profile', reason: reportReason, reporter_id: blockerId } },
      })
    }
  } catch { /* best-effort */ }
  return { ok: true }
}

async function processUnblockUser(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { blockerId, blockedId } = action.payload as {
    blockerId: string
    blockedId: string
  }

  const { error } = await supabase.from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
  if (error) return { ok: false, conflict: 'Unblock user failed to sync.' }
  return { ok: true }
}

async function processMarkNotificationRead(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { notificationId, timestamp } = action.payload as {
    notificationId: string
    timestamp: string
  }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: timestamp })
    .eq('id', notificationId)
  if (error) return { ok: false }
  return { ok: true }
}

async function processMarkAllNotificationsRead(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, timestamp } = action.payload as {
    userId: string
    timestamp: string
  }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: timestamp })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) return { ok: false }
  return { ok: true }
}

async function processLogImpact(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { impactData, userId, client_action_id } = action.payload as {
    impactData: Record<string, unknown>
    userId: string
    client_action_id?: string
  }

  const { error } = await supabase
    .from('event_impact')
    .upsert(
      {
        ...impactData,
        logged_by: userId,
        ...(client_action_id ? { client_action_id } : {}),
      } as any,
      { onConflict: 'event_id' },
    )
  if (error) {
    if (error.code === '23505') return { ok: true }
    return { ok: false, conflict: 'Impact data failed to sync. Please try again from the event page.' }
  }

  // Mark event as completed
  const { error: statusError } = await supabase
    .from('events')
    .update({ status: 'completed' })
    .eq('id', impactData.event_id as string)
    .in('status', ['published'])
  if (statusError) return { ok: false, conflict: 'Impact saved but event status update failed.' }

  return { ok: true }
}

async function processSurveyResponse(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { surveyId, userId, answers, eventId, client_action_id } = action.payload as {
    surveyId: string
    userId: string
    answers: Record<string, unknown>
    eventId?: string
    client_action_id?: string
  }

  // Idempotency-first dedup. Cast through `any` because generated types
  // lag migration 20260509100000 until regenerated.
  if (client_action_id) {
    const { data: existingByKey } = await (supabase as any)
      .from('survey_responses')
      .select('id')
      .eq('client_action_id', client_action_id)
      .limit(1)
    if (existingByKey && existingByKey.length > 0) return { ok: true }
  }

  // Legacy dedup
  let check = supabase
    .from('survey_responses')
    .select('id')
    .eq('survey_id', surveyId)
    .eq('user_id', userId)
  if (eventId) check = check.eq('event_id', eventId)
  const { data: existing } = await check.limit(1)
  if (existing && existing.length > 0) return { ok: true }

  const row: Record<string, unknown> = {
    survey_id: surveyId,
    user_id: userId,
    answers,
  }
  if (eventId) row.event_id = eventId
  if (client_action_id) row.client_action_id = client_action_id

  const { error } = await supabase
    .from('survey_responses')
    .insert(row as any)
  if (error) {
    if (error.code === '23505') return { ok: true }
    return { ok: false, conflict: 'Survey response failed to sync.' }
  }
  return { ok: true }
}

async function processAnnouncementResponse(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { announcementId, userId, response } = action.payload as {
    announcementId: string
    userId: string
    response: string
  }

  // Remove existing response first (single-choice)
  await supabase
    .from('chat_announcement_responses')
    .delete()
    .eq('announcement_id', announcementId)
    .eq('user_id', userId)

  const { error } = await supabase
    .from('chat_announcement_responses')
    .insert({
      announcement_id: announcementId,
      user_id: userId,
      response,
    })
  if (error) return { ok: false, conflict: 'Announcement response failed to sync.' }
  return { ok: true }
}

async function processPollVote(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { pollId, userId, optionIds, allowMultiple } = action.payload as {
    pollId: string
    userId: string
    optionIds: string[]
    allowMultiple: boolean
  }

  // Remove existing votes if single-choice
  if (!allowMultiple) {
    await supabase
      .from('chat_poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', userId)
  }

  const rows = optionIds.map((optionId) => ({
    poll_id: pollId,
    user_id: userId,
    option_id: optionId,
  }))

  const { error } = await supabase
    .from('chat_poll_votes')
    .upsert(rows, { onConflict: 'poll_id,user_id,option_id' })
  if (error) return { ok: false, conflict: 'Poll vote failed to sync.' }
  return { ok: true }
}

async function processModuleProgress(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, moduleId, status, lastContentId, progressPct, timeSpentSec } = action.payload as {
    userId: string
    moduleId: string
    status?: string
    lastContentId?: string | null
    progressPct?: number
    timeSpentSec?: number
  }

  const now = new Date().toISOString()

  // Check if row exists
  const { data: existing } = await supabase
    .from('dev_user_module_progress')
    .select('id')
    .eq('user_id', userId)
    .eq('module_id', moduleId)
    .maybeSingle()

  const row: Record<string, unknown> = {
    user_id: userId,
    module_id: moduleId,
    status: status ?? 'in_progress',
  }
  if (lastContentId !== undefined) row.last_content_id = lastContentId
  if (progressPct !== undefined) row.progress_pct = progressPct
  if (timeSpentSec !== undefined) row.time_spent_sec = timeSpentSec
  if (status === 'completed') row.completed_at = now

  if (existing) {
    const { error } = await supabase
      .from('dev_user_module_progress')
      .update(row as any)
      .eq('id', existing.id)
    if (error) return { ok: false, conflict: 'Module progress sync failed.' }
  } else {
    row.started_at = now
    const { error } = await supabase
      .from('dev_user_module_progress')
      .insert(row as any)
    if (error) return { ok: false, conflict: 'Module progress sync failed.' }
  }
  return { ok: true }
}

async function processSectionProgress(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, sectionId, status, modulesCompleted, modulesTotal, progressPct } = action.payload as {
    userId: string
    sectionId: string
    status: string
    modulesCompleted: number
    modulesTotal: number
    progressPct: number
  }

  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    user_id: userId,
    section_id: sectionId,
    status,
    modules_completed: modulesCompleted,
    modules_total: modulesTotal,
    progress_pct: progressPct,
  }
  if (status === 'in_progress') row.started_at = now
  if (status === 'completed') row.completed_at = now

  const { error } = await supabase
    .from('dev_user_section_progress')
    .upsert(row as any, { onConflict: 'user_id,section_id' })
  if (error) return { ok: false, conflict: 'Section progress sync failed.' }
  return { ok: true }
}

async function processQuizSubmit(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  const { userId, quizId, moduleId, scorePct, pointsEarned, pointsTotal, passed, timeSpentSec, responses } = action.payload as {
    userId: string
    quizId: string
    moduleId?: string | null
    scorePct: number
    pointsEarned: number
    pointsTotal: number
    passed: boolean
    timeSpentSec: number
    responses: {
      question_id: string
      selected_option_ids: string[]
      text_response?: string
      is_correct: boolean
      points_earned: number
    }[]
  }

  const { data: attempt, error: attemptError } = await supabase
    .from('dev_quiz_attempts')
    .insert({
      user_id: userId,
      quiz_id: quizId,
      module_id: moduleId ?? null,
      score_pct: scorePct,
      points_earned: pointsEarned,
      points_total: pointsTotal,
      passed,
      time_spent_sec: timeSpentSec,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (attemptError) return { ok: false, conflict: 'Quiz submission failed to sync.' }

  if (responses.length > 0) {
    const responseRows = responses.map((r) => ({
      attempt_id: attempt.id,
      question_id: r.question_id,
      selected_option_ids: r.selected_option_ids,
      text_response: r.text_response ?? null,
      is_correct: r.is_correct,
      points_earned: r.points_earned,
    }))
    const { error: respError } = await supabase
      .from('dev_quiz_responses')
      .insert(responseRows)
    if (respError) return { ok: false, conflict: 'Quiz responses failed to sync (attempt was saved).' }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/*  Process a single action - router                                   */
/* ------------------------------------------------------------------ */

async function processAction(action: OfflineAction): Promise<{ ok: boolean; conflict?: string }> {
  switch (action.type) {
    case 'chat-message':
      return processChatMessage(action)
    case 'check-in':
      return processCheckIn(action)
    case 'bulk-check-in':
      return processBulkCheckIn(action)
    case 'promote-waitlist':
      return processPromoteWaitlist(action)
    case 'profile-update':
      return processProfileUpdate(action)
    case 'task-complete':
      return processTaskComplete(action)
    case 'task-update-notes':
      return processTaskUpdateNotes(action)
    case 'task-undo-complete':
      return processTaskUndoComplete(action)
    case 'task-skip':
      return processTaskSkip(action)
    case 'todo-create':
      return processTodoCreate(action)
    case 'todo-update':
      return processTodoUpdate(action)
    case 'todo-toggle':
      return processTodoToggle(action)
    case 'todo-delete':
      return processTodoDelete(action)
    case 'report-content':
      return processReportContent(action)
    case 'block-user':
      return processBlockUser(action)
    case 'unblock-user':
      return processUnblockUser(action)
    case 'mark-notification-read':
      return processMarkNotificationRead(action)
    case 'mark-all-notifications-read':
      return processMarkAllNotificationsRead(action)
    case 'log-impact':
      return processLogImpact(action)
    case 'survey-response':
      return processSurveyResponse(action)
    case 'announcement-response':
      return processAnnouncementResponse(action)
    case 'poll-vote':
      return processPollVote(action)
    case 'module-progress':
      return processModuleProgress(action)
    case 'section-progress':
      return processSectionProgress(action)
    case 'quiz-submit':
      return processQuizSubmit(action)
    default:
      return { ok: false, conflict: `Unknown action type: ${(action as OfflineAction).type}` }
  }
}

/**
 * Ensure the Supabase auth token is fresh before syncing.
 * If the token expired while offline, this refreshes it.
 * Returns true if we have a valid session, false if re-auth failed.
 */
async function ensureFreshAuth(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false

    // Check if token is expired or about to expire (within 60s)
    const expiresAt = session.expires_at ?? 0
    const nowSecs = Math.floor(Date.now() / 1000)
    if (expiresAt > nowSecs + 60) return true

    // Token is expired or nearly expired - force refresh
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) {
      console.warn('[offline-sync] Auth refresh failed:', error?.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Sync all pending actions. Server wins on conflicts, notifies user. */
export async function syncAllOfflineActions(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, conflicts: [] }

  // Refresh auth token before attempting any sync - it may have expired while offline
  const hasAuth = await ensureFreshAuth()
  if (!hasAuth) {
    const totalPending = getPendingCheckInCount() + getActionQueue().length
    if (totalPending > 0) {
      result.failed = totalPending
      result.conflicts.push('Session expired. Please sign in again to sync your pending actions.')
      onSyncIssue?.('auth-expired')
    }
    return result
  }

  // Auth is good - clear any previous auth-expired issue
  onSyncIssue?.(null)

  // Sync legacy check-in queue first
  const checkinsSynced = await syncOfflineCheckIns()
  result.synced += checkinsSynced

  // Sync generic action queue (batched to avoid blocking UI)
  const queue = getActionQueue()
  if (queue.length === 0) return result

  const remaining: OfflineAction[] = []

  const BATCH = 5
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (action) => {
        const res = await processAction(action)
        return { action, ...res }
      }),
    )
    for (const r of results) {
      if (r.status === 'rejected') {
        const action = batch[results.indexOf(r)]
        if (action.retries < MAX_RETRIES) {
          remaining.push({ ...action, retries: action.retries + 1 })
          result.failed++
        } else {
          result.conflicts.push(`Action ${action.type} failed after ${MAX_RETRIES} retries`)
        }
      } else if (r.value.ok) {
        result.synced++
      } else if (r.value.conflict) {
        result.conflicts.push(r.value.conflict)
      } else if (r.value.action.retries < MAX_RETRIES) {
        remaining.push({ ...r.value.action, retries: r.value.action.retries + 1 })
        result.failed++
      } else {
        result.conflicts.push(`Action ${r.value.action.type} failed after ${MAX_RETRIES} retries`)
      }
    }
  }

  saveActionQueue(remaining)
  return result
}

/* ------------------------------------------------------------------ */
/*  Chat draft persistence                                             */
/* ------------------------------------------------------------------ */

function getDrafts(): Record<string, ChatDraft> {
  return safeGet<Record<string, ChatDraft>>(DRAFT_KEY, {})
}

function saveDrafts(drafts: Record<string, ChatDraft>) {
  safeSet(DRAFT_KEY, drafts)
}

/** Save a chat message draft (persists across sessions) */
export function saveChatDraft(collectiveId: string, content: string, replyToId?: string) {
  if (!content.trim()) {
    removeChatDraft(collectiveId)
    return
  }
  const drafts = getDrafts()
  drafts[collectiveId] = {
    collectiveId,
    content,
    replyToId,
    updatedAt: new Date().toISOString(),
  }
  saveDrafts(drafts)
}

/** Get a saved draft for a collective */
export function getChatDraft(collectiveId: string): ChatDraft | null {
  const drafts = getDrafts()
  return drafts[collectiveId] ?? null
}

/** Remove a draft (after sending) */
export function removeChatDraft(collectiveId: string) {
  const drafts = getDrafts()
  delete drafts[collectiveId]
  saveDrafts(drafts)
}

/* ------------------------------------------------------------------ */
/*  Last sync timestamp                                                */
/* ------------------------------------------------------------------ */

export function setLastSyncTime() {
  safeSet(LAST_SYNC_KEY, new Date().toISOString())
}

export function getLastSyncTime(): string | null {
  return safeGet<string | null>(LAST_SYNC_KEY, null)
}

/* ------------------------------------------------------------------ */
/*  Auto-sync on reconnect                                             */
/* ------------------------------------------------------------------ */

let syncListenerAttached = false
let onSyncComplete: ((result: SyncResult) => void) | null = null
let onSyncIssue: ((issue: 'auth-expired' | 'storage-full' | null) => void) | null = null

/** Register a callback for when sync completes (used by the sync provider) */
export function onSyncResult(callback: (result: SyncResult) => void) {
  onSyncComplete = callback
}

/** Register a callback for persistent sync issues (auth expired, storage full) */
export function onSyncIssueChange(callback: (issue: 'auth-expired' | 'storage-full' | null) => void) {
  onSyncIssue = callback
}

/**
 * Attaches a one-time listener that syncs all offline actions
 * when the browser comes back online. Safe to call multiple times.
 *
 * Belt-and-braces: also runs a periodic drain (every 30s) when online + queue
 * non-empty, plus a drain on `visibilitychange` when the tab becomes visible.
 * The bare `online` event isn't always reliable on Capacitor / patchy mobile
 * networks - polling closes the gap during multi-hour event-day sessions
 * where leaders flick in and out of cell coverage.
 */
export function attachOfflineSyncListener() {
  if (syncListenerAttached) return
  syncListenerAttached = true

  let draining = false
  async function drainIfPending(reason: 'online' | 'periodic' | 'visibility' | 'manual') {
    if (draining) return
    if (!navigator.onLine) return
    if (getPendingActionCount() === 0) return
    draining = true
    try {
      const result = await syncAllOfflineActions()
      setLastSyncTime()
      onSyncComplete?.(result)
    } catch {
      // swallow - next tick will retry
    } finally {
      draining = false
    }
    // Telemetry-only - silent on success in production builds
    if (typeof console !== 'undefined' && reason === 'manual') {
      console.info('[offline-sync] manual drain complete')
    }
  }

  window.addEventListener('online', () => { drainIfPending('online') })

  // Periodic poll: every 30s try to drain. Cheap when there's nothing pending
  // (early-return on count===0), useful when network flickers without firing
  // the `online` event.
  setInterval(() => { drainIfPending('periodic') }, 30_000)

  // When the user brings the tab/app foreground after backgrounding, attempt
  // a drain. Mobile browsers commonly suspend timers in background tabs.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') drainIfPending('visibility')
  })

  // Expose a manual trigger that the UI can call (e.g. a "Sync now" button on
  // the event-day page). Stored on the module-level `manualSyncTrigger` so
  // `triggerManualSync` below can dispatch without re-attaching the listener.
  manualSyncTrigger = () => drainIfPending('manual')
}

let manualSyncTrigger: (() => Promise<void>) | null = null

/**
 * Trigger a sync drain manually (e.g. user-initiated from a "sync now" button).
 * Safe to call before attachOfflineSyncListener - returns immediately in that
 * case rather than attempting to sync without the lock.
 */
export async function triggerManualSync(): Promise<void> {
  if (!manualSyncTrigger) return
  await manualSyncTrigger()
}

/* ------------------------------------------------------------------ */
/*  TanStack Query persistence helpers                                 */
/* ------------------------------------------------------------------ */

/** Persist a serialized TanStack Query cache to localStorage */
export function persistQueryCache(dehydratedState: unknown) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dehydratedState))
  } catch {
    // Storage full or unavailable - silently skip
  }
}

/** Restore a previously persisted query cache */
export function restoreQueryCache(): unknown | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
