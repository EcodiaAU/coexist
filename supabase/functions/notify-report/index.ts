// Deno Edge Function - notify admins when a content report is created
import { withSentry } from "../_shared/sentry.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(withSentry("notify-report", async (req) => {
  try {
    const payload = await req.json()

    // Payload comes from database webhook trigger (pg_net) or direct invocation
    const record = payload.record ?? payload

    if (!record?.id || !record?.content_type || !record?.reason) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch reporter name
    let reporterName = 'A user'
    if (record.reporter_id) {
      const { data: reporter } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', record.reporter_id)
        .single()
      if (reporter?.display_name) reporterName = reporter.display_name
    }

    const contentLabel: Record<string, string> = {
      chat_message: 'a chat message',
      photo: 'a photo',
      profile: 'a user',
      post: 'a post',
    }
    const what = contentLabel[record.content_type] ?? 'content'

    // Find all staff/admin users to notify
    const { data: staff } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['national_leader', 'manager', 'admin'])

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
      body: `${reporterName} reported ${what}: "${record.reason}"`,
      data: JSON.stringify({
        url: '/admin/moderation',
        report_id: record.id,
        content_type: record.content_type,
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
      await supabase.functions.invoke('send-push', {
        body: {
          userIds: staffIds,
          title: 'Content Report',
          body: `${reporterName} reported ${what}. Review needed.`,
          data: { type: 'report_alert', route: '/admin/moderation' },
        },
      })
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
