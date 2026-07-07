/**
 * data-export - Supabase Edge Function
 *
 * GDPR data export: collects all user data across tables and returns as JSON.
 * Called from Settings > Your Data & Privacy > Request Data Export.
 */

import { withSentry } from "../_shared/sentry.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withSentry("data-export", async (req: Request) => {
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
    const caller = await gotruRes.json() as { id: string; email?: string }

    // Users can only export their own data
    const userId = caller.id

    // Collect all user data in parallel
    const [
      profileRes,
      postsRes,
      commentsRes,
      likesRes,
      pointsRes,
      notificationsRes,
      chatMessagesRes,
      eventRegsRes,
      eventImpactRes,
      donationsRes,
      recurringDonationsRes,
      ordersRes,
      surveyResponsesRes,
      reportsRes,
      invitesRes,
      offerRedemptionsRes,
      challengeParticipationRes,
    ] = await Promise.all([
      // GDPR: must export ALL user data - use explicit high limits to avoid default 1000 truncation
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000),
      supabase.from('post_comments').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000),
      supabase.from('post_likes').select('post_id, created_at').eq('user_id', userId).limit(10000),
      supabase.from('points_ledger').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000),
      supabase.from('chat_messages').select('id, collective_id, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000),
      supabase.from('event_registrations').select('*, events(title, date_start)').eq('user_id', userId).limit(10000),
      supabase.from('event_impact').select('*, events(title)').eq('logged_by', userId).order('logged_at', { ascending: false }).limit(10000),
      supabase.from('donations').select('*').eq('user_id', userId).limit(10000),
      supabase.from('recurring_donations').select('*').eq('user_id', userId).limit(10000),
      supabase.from('merch_orders').select('*').eq('user_id', userId).limit(10000),
      supabase.from('survey_responses').select('*, surveys(title)').eq('user_id', userId).limit(10000),
      supabase.from('content_reports').select('*').eq('reporter_id', userId).limit(10000),
      supabase.from('invites').select('*').eq('inviter_id', userId).limit(10000),
      supabase.from('offer_redemptions').select('*, partner_offers(partner_name)').eq('user_id', userId).limit(10000),
      supabase.from('challenge_participants').select('*, challenges(title)').eq('user_id', userId).limit(10000),
    ])

    // Strip sensitive fields from profile
    const profile = profileRes.data
    if (profile) {
      delete (profile as Record<string, unknown>).suspended_reason
      delete (profile as Record<string, unknown>).suspended_until
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      profile,
      posts: postsRes.data ?? [],
      comments: commentsRes.data ?? [],
      likes: likesRes.data ?? [],
      points_history: pointsRes.data ?? [],
      notifications: notificationsRes.data ?? [],
      chat_messages: chatMessagesRes.data ?? [],
      event_registrations: eventRegsRes.data ?? [],
      event_impact_logs: eventImpactRes.data ?? [],
      donations: donationsRes.data ?? [],
      recurring_donations: recurringDonationsRes.data ?? [],
      orders: ordersRes.data ?? [],
      survey_responses: surveyResponsesRes.data ?? [],
      content_reports: reportsRes.data ?? [],
      invites: invitesRes.data ?? [],
      offer_redemptions: offerRedemptionsRes.data ?? [],
      challenge_participation: challengeParticipationRes.data ?? [],
    }

    // Record the export request
    await supabase.from('data_export_requests').insert({
      user_id: userId,
      status: 'completed',
      completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    })

    return new Response(JSON.stringify(exportData), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="coexist-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    console.error('[data-export] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Export failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
}))
