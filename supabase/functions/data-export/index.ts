/**
 * data-export - Supabase Edge Function
 *
 * GDPR data export: collects all user data across tables and returns as JSON.
 * Called from Settings > Your Data & Privacy > Request Data Export.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withSentry('data-export', async (req: Request) => {
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

    // ---- Additional user-keyed tables (Phase 1 export completion, 2026-07-14) ----
    // Every table + column below was verified to exist and be user-keyed via a
    // live pg_constraint / information_schema probe on project tjutlbzekfouwsiaplbr.
    // `col` is the column that owns the row to this user. Goal: the export is
    // genuinely ALL of the user's data, so the in-app "export ALL your data (GDPR)"
    // claim is true. Missing one is a compliance failure. Add to this list (not a
    // silent gap) whenever a new user-keyed table lands.
    const extraTables: { key: string; table: string; col: string }[] = [
      // Tickets, payments, memberships, applications
      { key: 'event_tickets', table: 'event_tickets', col: 'user_id' },
      { key: 'payments', table: 'payments', col: 'user_id' },
      { key: 'memberships', table: 'memberships', col: 'user_id' },
      { key: 'collective_members', table: 'collective_members', col: 'user_id' },
      { key: 'collective_applications', table: 'collective_applications', col: 'user_id' },
      { key: 'referral_codes', table: 'referral_codes', col: 'user_id' },
      { key: 'return_requests', table: 'return_requests', col: 'user_id' },
      // Carpool
      { key: 'carpool_widgets', table: 'carpool_widgets', col: 'driver_id' },
      { key: 'carpool_seats', table: 'carpool_seats', col: 'passenger_id' },
      // Chat / social activity
      { key: 'chat_channel_members', table: 'chat_channel_members', col: 'user_id' },
      { key: 'chat_read_receipts', table: 'chat_read_receipts', col: 'user_id' },
      { key: 'chat_poll_votes', table: 'chat_poll_votes', col: 'user_id' },
      { key: 'message_reactions', table: 'message_reactions', col: 'user_id' },
      { key: 'chat_announcement_responses', table: 'chat_announcement_responses', col: 'user_id' },
      { key: 'user_blocks', table: 'user_blocks', col: 'blocker_id' },
      { key: 'update_reads', table: 'update_reads', col: 'user_id' },
      // Events / photos / todos / surveys / contact
      { key: 'event_photos', table: 'event_photos', col: 'uploaded_by' },
      { key: 'leader_todos', table: 'leader_todos', col: 'user_id' },
      { key: 'post_event_survey_responses', table: 'post_event_survey_responses', col: 'user_id' },
      { key: 'contact_submissions', table: 'contact_submissions', col: 'user_id' },
      // Learning / development modules progress
      { key: 'dev_assignments', table: 'dev_assignments', col: 'user_id' },
      { key: 'dev_quiz_attempts', table: 'dev_quiz_attempts', col: 'user_id' },
      { key: 'dev_user_module_progress', table: 'dev_user_module_progress', col: 'user_id' },
      { key: 'dev_user_section_progress', table: 'dev_user_section_progress', col: 'user_id' },
      // Profile / account state / comms delivered
      { key: 'profile_tags', table: 'profile_tags', col: 'profile_id' },
      { key: 'staff_roles', table: 'staff_roles', col: 'user_id' },
      { key: 'push_tokens', table: 'push_tokens', col: 'user_id' },
      { key: 'cart_reservations', table: 'cart_reservations', col: 'user_id' },
      { key: 'campaign_recipients', table: 'campaign_recipients', col: 'profile_id' },
      { key: 'notification_recipients', table: 'notification_recipients', col: 'user_id' },
    ]

    const extraResults = await Promise.all(
      extraTables.map(({ table, col }) =>
        supabase.from(table).select('*').eq(col, userId).limit(10000),
      ),
    )
    const extra: Record<string, unknown[]> = {}
    extraTables.forEach(({ key }, i) => {
      extra[key] = extraResults[i].data ?? []
    })

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
      ...extra,
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
