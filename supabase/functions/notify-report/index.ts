// Deno Edge Function - notify admins when a content report is created
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { sanitizeReportReason } from '../_shared/d3-guards.ts'
import { reportInvokeError } from '../_shared/invoke-report.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(withSentry('notify-report', async (req) => {
  try {
    const payload = await req.json()

    // Payload is sent by the reporter's client right after it inserts the
    // content_report (use-report-content / use-user-blocks / offline-sync).
    const record = payload.record ?? payload

    if (!record?.id) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ---- Authenticate the caller ----
    // This function is deployed with --no-verify-jwt, so the platform performs
    // NO auth: this in-function check is the ONLY gate. Before it, any anonymous
    // caller could POST an arbitrary { record: { reason } } and spam every staff
    // member with attacker-controlled text (in-app + push). Require a valid
    // authenticated user and bind the alert to a report that user actually filed.
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const gotruRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_SERVICE_ROLE_KEY },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const caller = await gotruRes.json() as { id: string }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ---- Bind to a report the caller filed; use the STORED reason ----
    // Never trust the client-supplied reason/content_type: read the canonical
    // row and confirm the caller is its reporter. This stops a signed-in user
    // injecting arbitrary text into staff notifications for someone else's (or a
    // fabricated) report.
    let contentType = ''
    let reason = ''
    const { data: report } = await supabase
      .from('content_reports')
      .select('reporter_id, content_type, reason')
      .eq('id', record.id)
      .maybeSingle()
    if (report) {
      if (report.reporter_id !== caller.id) {
        return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      contentType = String(report.content_type ?? '')
      reason = String(report.reason ?? '')
    } else {
      // Row not visible yet (rare read-after-write) or absent: fall back to the
      // body, but still require the caller to be the claimed reporter.
      if (record.reporter_id !== caller.id) {
        return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      contentType = String(record.content_type ?? '')
      reason = String(record.reason ?? '')
    }

    if (!contentType) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Sanitize the user-authored reason before it reaches staff surfaces:
    // collapse whitespace/newlines and cap length so it cannot inject structure
    // into the notification body or a push payload.
    const safeReason = sanitizeReportReason(reason)

    // Fetch reporter name (the authenticated caller).
    let reporterName = 'A user'
    {
      const { data: reporter } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', caller.id)
        .single()
      if (reporter?.display_name) reporterName = reporter.display_name
    }

    const contentLabel: Record<string, string> = {
      chat_message: 'a chat message',
      photo: 'a photo',
      profile: 'a user',
      post: 'a post',
    }
    const what = contentLabel[contentType] ?? 'content'

    // Find all staff to notify. 'national_leader' removed 2026-08-10 (D3): it is
    // not a live role, so it matched nobody - the effective recipients have
    // always been manager+admin (the national moderation team).
    const { data: staff } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['manager', 'admin'])

    if (!staff || staff.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const staffIds = staff.map((s: { id: string }) => s.id)

    // Create in-app notifications for all staff
    const notifications = staffIds.map((userId: string) => ({
      user_id: userId,
      type: 'moderation',
      title: 'New content report',
      body: `${reporterName} reported ${what}: "${safeReason}"`,
      data: JSON.stringify({
        url: '/admin/moderation',
        report_id: record.id,
        content_type: contentType,
      }),
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error('Failed to create notifications:', notifError)
    }

    // Also send push notifications to staff
    try {
      const { error: invokeErr } = await supabase.functions.invoke('send-push', {
        // supabase-js >= 2.112.2 drops the Authorization header when the project
        // key is new-format (sb_secret_), so send-push answers a silent 401. Set it
        // explicitly. patterns/unpinned-cdn-import-plus-key-format-migration-is-a-two-input-latent-bug-2026-08-26.md
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: {
          userIds: staffIds,
          title: 'Content Report',
          body: `${reporterName} reported ${what}. Review needed.`,
          data: { type: 'report_alert', route: '/admin/moderation' },
        },
      })
      await reportInvokeError('notify-report', 'send-push', invokeErr)
    } catch (pushErr) {
      // Push is best-effort - don't fail the function
      console.error('Push notification failed:', pushErr)
    }

    return new Response(
      JSON.stringify({ ok: true, notified: staffIds.length }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('notify-report error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))
