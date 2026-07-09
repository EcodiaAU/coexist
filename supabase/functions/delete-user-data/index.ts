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
    const deleted: string[] = []

    // ---- Delete selected categories ----
    const ops: Promise<unknown>[] = []

    if (has('chat_messages')) {
      ops.push(supabase.from('chat_messages').delete().eq('user_id', userId))
      deleted.push('chat_messages')
    }

    if (has('event_history')) {
      ops.push(supabase.from('event_registrations').delete().eq('user_id', userId))
      ops.push(supabase.from('event_impact').delete().eq('logged_by', userId))
      deleted.push('event_registrations', 'event_impact')
    }

    if (has('notifications')) {
      ops.push(supabase.from('notifications').delete().eq('user_id', userId))
      deleted.push('notifications')
    }

    if (has('points')) {
      ops.push(supabase.from('points_ledger').delete().eq('user_id', userId))
      deleted.push('points_ledger')
    }

    if (has('survey_responses')) {
      ops.push(supabase.from('survey_responses').delete().eq('user_id', userId))
      deleted.push('survey_responses')
    }

    if (has('social')) {
      ops.push(supabase.from('post_likes').delete().eq('user_id', userId))
      ops.push(supabase.from('post_comments').delete().eq('user_id', userId))
      ops.push(supabase.from('posts').delete().eq('user_id', userId))
      deleted.push('posts', 'post_comments', 'post_likes')
    }

    if (has('reports')) {
      ops.push(supabase.from('content_reports').delete().eq('reporter_id', userId))
      deleted.push('content_reports')
    }

    if (has('invites')) {
      ops.push(supabase.from('invites').delete().eq('inviter_id', userId))
      deleted.push('invites')
    }

    if (has('challenges')) {
      ops.push(supabase.from('challenge_participants').delete().eq('user_id', userId))
      ops.push(supabase.from('offer_redemptions').delete().eq('user_id', userId))
      deleted.push('challenge_participants', 'offer_redemptions')
    }

    await Promise.all(ops)

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
