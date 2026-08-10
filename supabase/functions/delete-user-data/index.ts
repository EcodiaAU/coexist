/**
 * delete-user-data - Supabase Edge Function
 *
 * Selectively deletes user data categories while keeping the account intact.
 * Called from the public /data-deletion page and in-app Settings > Data & Privacy.
 *
 * Body: { categories: string[] }
 * Valid categories:
 *   - "chat_messages"     → chat messages
 *   - "event_history"     → event registrations & impact logs
 *   - "notifications"     → all notifications
 *   - "points"            → points ledger
 *   - "survey_responses"  → survey answers
 *   - "social"            → posts, comments, likes
 *   - "reports"           → content reports filed by user
 *   - "invites"           → sent invites
 *   - "challenges"        → challenge participation & offer redemptions
 *   - "all"               → all of the above
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_CATEGORIES = new Set([
  'chat_messages',
  'event_history',
  'notifications',
  'points',
  'survey_responses',
  'social',
  'reports',
  'invites',
  'challenges',
  'all',
])

Deno.serve(withSentry('delete-user-data', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const gotruRes = await fetch(`${Deno.env.get('SUPABASE_URL')!}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const user = await gotruRes.json() as { id: string; email?: string }

    const userId = user.id

    // ---- Parse request ----
    const { categories } = await req.json()
    if (!Array.isArray(categories) || categories.length === 0) {
      return new Response(JSON.stringify({ error: 'categories array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    for (const cat of categories) {
      if (!VALID_CATEGORIES.has(cat)) {
        return new Response(JSON.stringify({ error: `Invalid category: ${cat}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const isAll = categories.includes('all')
    const has = (cat: string) => isAll || categories.includes(cat)

    // ---- Delete selected categories ----
    // Each delete carries the table label it removes. A label only lands in
    // `deleted` AFTER its delete returns no {error}; a failed one lands in
    // `failed`. supabase-js RESOLVES (does not throw) on a row-level failure,
    // so the previous version - which pushed every label into `deleted`
    // BEFORE running the ops and never inspected the result - reported data as
    // permanently removed that an FK/constraint/RLS failure had actually left
    // in place (a GDPR false-positive the /data-deletion page then rendered as
    // "Data Deleted"). Now the caller learns exactly what did and did not go.
    const ops: { label: string; run: () => PromiseLike<{ error: unknown }> }[] = []

    if (has('chat_messages')) {
      ops.push({ label: 'chat_messages', run: () => supabase.from('chat_messages').delete().eq('user_id', userId) })
    }
    if (has('event_history')) {
      ops.push({ label: 'event_registrations', run: () => supabase.from('event_registrations').delete().eq('user_id', userId) })
      ops.push({ label: 'event_impact', run: () => supabase.from('event_impact').delete().eq('logged_by', userId) })
    }
    if (has('notifications')) {
      ops.push({ label: 'notifications', run: () => supabase.from('notifications').delete().eq('user_id', userId) })
    }
    if (has('points')) {
      ops.push({ label: 'points_ledger', run: () => supabase.from('points_ledger').delete().eq('user_id', userId) })
    }
    if (has('survey_responses')) {
      ops.push({ label: 'survey_responses', run: () => supabase.from('survey_responses').delete().eq('user_id', userId) })
    }
    if (has('social')) {
      ops.push({ label: 'post_likes', run: () => supabase.from('post_likes').delete().eq('user_id', userId) })
      ops.push({ label: 'post_comments', run: () => supabase.from('post_comments').delete().eq('user_id', userId) })
      ops.push({ label: 'posts', run: () => supabase.from('posts').delete().eq('user_id', userId) })
    }
    if (has('reports')) {
      ops.push({ label: 'content_reports', run: () => supabase.from('content_reports').delete().eq('reporter_id', userId) })
    }
    if (has('invites')) {
      ops.push({ label: 'invites', run: () => supabase.from('invites').delete().eq('inviter_id', userId) })
    }
    if (has('challenges')) {
      ops.push({ label: 'challenge_participants', run: () => supabase.from('challenge_participants').delete().eq('user_id', userId) })
      ops.push({ label: 'offer_redemptions', run: () => supabase.from('offer_redemptions').delete().eq('user_id', userId) })
    }

    const deleted: string[] = []
    const failed: string[] = []
    const results = await Promise.all(
      ops.map(async (op) => {
        const { error } = await op.run()
        return { label: op.label, error }
      }),
    )
    for (const r of results) {
      if (r.error) {
        failed.push(r.label)
        console.error(`[delete-user-data] ${r.label} failed for user ${userId}:`, r.error)
      } else {
        deleted.push(r.label)
      }
    }

    if (failed.length > 0) {
      // 207 Multi-Status: some categories were removed, some were not. Still a
      // 2xx so supabase-js delivers the body; the page inspects success/failed.
      console.error(`[delete-user-data] Partial failure for user ${userId}: failed=[${failed.join(', ')}]`)
      return new Response(JSON.stringify({ success: false, deleted, failed }), {
        status: 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[delete-user-data] Deleted categories [${deleted.join(', ')}] for user ${userId}`)

    return new Response(JSON.stringify({ success: true, deleted }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[delete-user-data] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Data deletion failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}))
