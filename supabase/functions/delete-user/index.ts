// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { outranks } from '../_shared/d3-guards.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * delete-user - GDPR-compliant user deletion
 *
 * Called from Admin > User Management when an admin (or manager) deletes a user
 * account. Removes all user data across tables, then deletes the auth user.
 *
 * Authorization: the caller must be admin/manager AND strictly outrank the
 * target (rank guard) - a manager cannot delete an admin, no lateral or
 * upward deletes, no self-deletion. GDPR deletion is irreversible.
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

    // ---- Rank guard: the caller must STRICTLY outrank the target ----
    // Without this, the ['admin','manager'] gate above let a manager (rank 4)
    // delete an admin (rank 5), and allowed lateral deletes (manager deleting a
    // peer manager). GDPR deletion is irreversible, so only a strictly-higher
    // ranked actor may perform it (mirrors the collective member-removal rule).
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!outranks(callerProfile.role, targetProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'You cannot delete an account with equal or higher privileges' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---- Delete user data across all tables ----
    // Each op is awaited and its {error} inspected. supabase-js RESOLVES (does
    // NOT throw) on a row-level failure, so an unchecked Promise.all silently
    // swallows FK/constraint errors and the function would report success on a
    // partial delete (a GDPR false-positive). We aggregate every failure and
    // refuse to proceed to the profile/auth delete if anything failed.
    const failures: string[] = []
    const run = async (label: string, p: PromiseLike<{ error: unknown }>) => {
      const { error } = await p
      if (error) {
        failures.push(`${label}: ${(error as { message?: string })?.message ?? 'unknown error'}`)
      }
    }

    // Dependent user rows. Most CASCADE on the auth delete, but chat_messages
    // is ON DELETE SET NULL and several are belt-and-suspenders; delete
    // explicitly so a GDPR erasure actually removes the content.
    await Promise.all([
      run('notifications', supabase.from('notifications').delete().eq('user_id', userId)),
      run('points_ledger', supabase.from('points_ledger').delete().eq('user_id', userId)),
      run('chat_messages', supabase.from('chat_messages').delete().eq('user_id', userId)),
      run('event_registrations', supabase.from('event_registrations').delete().eq('user_id', userId)),
      run('survey_responses', supabase.from('survey_responses').delete().eq('user_id', userId)),
      run('content_reports', supabase.from('content_reports').delete().eq('reporter_id', userId)),
      run('invites', supabase.from('invites').delete().eq('inviter_id', userId)),
      run('offer_redemptions', supabase.from('offer_redemptions').delete().eq('user_id', userId)),
      run('challenge_participants', supabase.from('challenge_participants').delete().eq('user_id', userId)),
      run('data_export_requests', supabase.from('data_export_requests').delete().eq('user_id', userId)),
    ])

    // Financial records: kept for accounting, anonymized.
    await Promise.all([
      run('donations', supabase
        .from('donations')
        .update({ donor_name: 'Deleted User', donor_email: null, user_id: null })
        .eq('user_id', userId)),
      run('recurring_donations', supabase
        .from('recurring_donations')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)),
      run('merch_orders', supabase
        .from('merch_orders')
        .update({ shipping_name: 'Deleted User', shipping_address: null, shipping_city: null, shipping_state: null, shipping_postcode: null })
        .eq('user_id', userId)),
    ])

    // ---- Clear the references that would otherwise BLOCK the profile delete ----
    // profiles.id -> auth.users is ON DELETE CASCADE, so deleting the auth user
    // cascades to the profile. But these columns reference profiles with ON
    // DELETE NO ACTION, so if the target authored/updated any of them BOTH the
    // profile delete AND the cascading auth delete are refused - and the
    // account is left half-deleted (child rows already gone) and never
    // converges on retry. This was the offboarding failure: managers/admins
    // are exactly the campaign/template authors. Clear them first - NULL the
    // nullable authorship/updater columns, and reassign the one NOT-NULL column
    // (task_templates.created_by) to the deleting admin so the org content
    // survives, re-owned. Enumerated from the live pg_constraint set (every FK
    // to public.profiles with confdeltype='a').
    await Promise.all([
      run('app_images.updated_by', supabase.from('app_images').update({ updated_by: null }).eq('updated_by', userId)),
      run('email_campaigns.created_by', supabase.from('email_campaigns').update({ created_by: null }).eq('created_by', userId)),
      run('email_templates.created_by', supabase.from('email_templates').update({ created_by: null }).eq('created_by', userId)),
      run('event_walk_ins.created_by_user_id', supabase.from('event_walk_ins').update({ created_by_user_id: null }).eq('created_by_user_id', userId)),
      run('event_walk_ins.linked_user_id', supabase.from('event_walk_ins').update({ linked_user_id: null }).eq('linked_user_id', userId)),
      run('legal_pages.updated_by', supabase.from('legal_pages').update({ updated_by: null }).eq('updated_by', userId)),
      run('task_instances.assigned_user_id', supabase.from('task_instances').update({ assigned_user_id: null }).eq('assigned_user_id', userId)),
      run('task_instances.completed_by', supabase.from('task_instances').update({ completed_by: null }).eq('completed_by', userId)),
      run('task_templates.created_by', supabase.from('task_templates').update({ created_by: caller.id }).eq('created_by', userId)),
    ])

    // ---- Second blocker class: ON DELETE SET NULL FKs onto NOT NULL columns ----
    // These reference profiles with ON DELETE SET NULL, but the referencing
    // column is NOT NULL, so the cascade tries to write NULL into a NOT NULL
    // column and fails with a not-null violation (23502) - a self-contradictory
    // schema. chat_messages.user_id is in this class too but is already deleted
    // above (GDPR erasure of personal messages). The remaining four are shared
    // chat/org artifacts (a poll, announcement, broadcast log, or collaborator
    // invite the user created); deleting them would erase content other members
    // interacted with, so instead reassign authorship to the deleting admin,
    // which satisfies NOT NULL, preserves the artifact, and lets the profile
    // delete converge. (The deeper schema inconsistency - a SET NULL FK on a
    // NOT NULL column - is surfaced separately for a future migration.)
    await Promise.all([
      run('chat_polls.created_by', supabase.from('chat_polls').update({ created_by: caller.id }).eq('created_by', userId)),
      run('chat_announcements.created_by', supabase.from('chat_announcements').update({ created_by: caller.id }).eq('created_by', userId)),
      run('chat_broadcast_log.sent_by', supabase.from('chat_broadcast_log').update({ sent_by: caller.id }).eq('sent_by', userId)),
      run('collective_event_collaborators.invited_by_user', supabase.from('collective_event_collaborators').update({ invited_by_user: caller.id }).eq('invited_by_user', userId)),
    ])

    if (failures.length > 0) {
      console.error('[delete-user] Pre-delete cleanup failures:', failures)
      return new Response(
        JSON.stringify({ error: 'Deletion could not complete cleanly; no account was removed. Please retry.', failures }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Delete profile - now that the blocking references are cleared - and
    // inspect the result rather than swallowing it.
    const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', userId)
    if (profileDeleteError) {
      console.error('[delete-user] Profile delete failed:', profileDeleteError)
      return new Response(
        JSON.stringify({ error: 'Profile deletion failed; account not removed. Please retry.', detail: profileDeleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

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
