// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * delete-user - GDPR-compliant user deletion
 *
 * Called from Admin > User Management when an admin deletes a user account.
 * Removes all user data across tables, then deletes the auth user.
 */

Deno.serve(withSentry('delete-user', async (req: Request) => {
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

    // Verify caller is an admin
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

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Parse request ----
    const { userId } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Delete user data across all tables ----
    // Order matters: delete dependent rows first to avoid FK violations
    await Promise.all([
      supabase.from('notifications').delete().eq('user_id', userId),
      supabase.from('points_ledger').delete().eq('user_id', userId),
      supabase.from('chat_messages').delete().eq('user_id', userId),
      supabase.from('event_registrations').delete().eq('user_id', userId),
      supabase.from('survey_responses').delete().eq('user_id', userId),
      supabase.from('content_reports').delete().eq('reporter_id', userId),
      supabase.from('invites').delete().eq('inviter_id', userId),
      supabase.from('offer_redemptions').delete().eq('user_id', userId),
      supabase.from('challenge_participants').delete().eq('user_id', userId),
      supabase.from('data_export_requests').delete().eq('user_id', userId),
    ])

    // Delete financial records (keep for accounting but anonymize)
    await Promise.all([
      supabase
        .from('donations')
        .update({ donor_name: 'Deleted User', donor_email: null, user_id: null })
        .eq('user_id', userId),
      supabase
        .from('recurring_donations')
        .update({ status: 'cancelled' })
        .eq('user_id', userId),
      supabase
        .from('merch_orders')
        .update({ shipping_name: 'Deleted User', shipping_address: null, shipping_city: null, shipping_state: null, shipping_postcode: null })
        .eq('user_id', userId),
    ])

    // Delete profile
    await supabase.from('profiles').delete().eq('id', userId)

    // Finally, delete the auth user
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      console.error('[delete-user] Auth deletion error:', deleteAuthError)
      return new Response(
        JSON.stringify({ error: 'User data removed but auth deletion failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[delete-user] User ${userId} deleted by admin ${caller.id}`)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[delete-user] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Deletion failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}))
