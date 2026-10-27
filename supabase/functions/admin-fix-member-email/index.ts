// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { outranks } from '../_shared/d3-guards.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * admin-fix-member-email - correct the address on a member who gets no email.
 *
 * Called from Admin > Email > Delivery > Unreachable when an admin has checked
 * the right address with the member (Yee Zhao, 2026-10-27: "it would be cool if
 * these typos could be changed ... or us edit it ourselves"). Members cannot do
 * this themselves: secure email change wants a click from the OLD address, and
 * the old address is the one that bounces.
 *
 * SCOPE IS DELIBERATELY NARROW. The target must be on admin_unreachable_members()
 * right now, read under the CALLER's own JWT. That one call proves the caller
 * holds the same gate as the page (is_admin_or_staff + has_cap('manage_email'))
 * AND limits this function to accounts whose mail is already broken, so it can
 * never re-point the sign-in of a healthy account.
 *
 * The new address is refused when the sender would skip it, when it still looks
 * like a typo, when it is suppressed, or when another account already holds it.
 * auth.users.email is changed through the admin API (which also moves the email
 * identity a password sign-in resolves through); sync_auth_email_to_profile
 * copies it onto profiles.email, and this function reads that back.
 */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface UnreachableRow {
  user_id: string
  auth_email: string | null
  profile_email: string | null
  judged_email: string | null
  reasons: string[]
}

Deno.serve(withSentry('admin-fix-member-email', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization' }, 401)
    const token = authHeader.replace('Bearer ', '')

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey
    const admin = createClient(url, serviceKey)

    const gotruRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    })
    if (!gotruRes.ok) return json({ error: 'Invalid or expired token' }, 401)
    const caller = await gotruRes.json() as { id: string }

    let body: { user_id?: unknown; email?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Send JSON: { user_id, email }' }, 400)
    }
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!userId) return json({ error: 'user_id is required' }, 400)
    if (!newEmail) return json({ error: 'Enter the new email address' }, 400)
    if (userId === caller.id) {
      return json({ error: 'Change your own email in Settings, not here' }, 400)
    }

    // ---- Gate + scope in one call, under the caller's own identity ----
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: unreachable, error: listErr } = await asCaller.rpc('admin_unreachable_members')
    if (listErr) {
      // 42501 is the body's own refusal for a caller without manage_email.
      const denied = (listErr as { code?: string }).code === '42501'
      return json({ error: denied ? 'You need email admin access to do this' : 'Could not check this member' }, denied ? 403 : 500)
    }
    const target = (unreachable as UnreachableRow[] | null)?.find((r) => r.user_id === userId)
    if (!target) {
      return json({ error: 'This member is not on the unreachable list any more. Refresh the page.' }, 409)
    }

    const [{ data: callerProfile }, { data: targetProfile }] = await Promise.all([
      admin.from('profiles').select('role').eq('id', caller.id).single(),
      admin.from('profiles').select('role').eq('id', userId).single(),
    ])
    if (targetProfile && outranks(targetProfile.role, callerProfile?.role)) {
      return json({ error: 'You cannot change the email of an account that outranks yours' }, 403)
    }

    const oldEmail = target.auth_email ?? target.profile_email ?? null
    if (oldEmail && oldEmail.trim().toLowerCase() === newEmail) {
      return json({ error: 'That is the address already on the account' }, 400)
    }

    // ---- Would the sender actually use the new address? ----
    const [sendableRes, typoRes, suppressedRes] = await Promise.all([
      admin.rpc('coexist_email_sendable', { p_email: newEmail }),
      admin.rpc('coexist_email_typo_suggestion', { p_email: newEmail }),
      admin.from('email_suppressions').select('reason').ilike('email', newEmail).limit(1),
    ])
    if (sendableRes.error || typoRes.error || suppressedRes.error) {
      return json({ error: 'Could not check the new address' }, 500)
    }
    if (sendableRes.data !== true) {
      return json({ error: `${newEmail} is not a valid email address` }, 400)
    }
    if (typoRes.data) {
      return json({ error: `${newEmail} still looks like a typo. Did they mean ${typoRes.data}?` }, 400)
    }
    if (suppressedRes.data && suppressedRes.data.length > 0) {
      return json({ error: `${newEmail} has bounced or blocked our email before, so it would not fix anything` }, 400)
    }

    const { data: taken, error: takenErr } = await admin
      .from('profiles').select('id').ilike('email', newEmail).neq('id', userId).limit(1)
    if (takenErr) return json({ error: 'Could not check the new address' }, 500)
    if (taken && taken.length > 0) {
      return json({ error: `Another account already uses ${newEmail}. Ask Ecodia to merge the two.` }, 409)
    }

    // ---- Change it ----
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })
    if (updErr) {
      const msg = (updErr.message ?? '').toLowerCase()
      if (msg.includes('already') || (updErr as { code?: string }).code === 'email_exists') {
        return json({ error: `Another account already uses ${newEmail}. Ask Ecodia to merge the two.` }, 409)
      }
      console.error('[admin-fix-member-email] updateUserById failed:', updErr.message)
      return json({ error: 'Could not change the email' }, 500)
    }

    // sync_auth_email_to_profile copies the address onto profiles.email. Read it
    // back, and write it here only if the trigger did not.
    const { data: after } = await admin.from('profiles').select('email').eq('id', userId).single()
    if (after?.email?.toLowerCase() !== newEmail) {
      const { error: profErr } = await admin.from('profiles').update({ email: newEmail }).eq('id', userId)
      if (profErr) console.error('[admin-fix-member-email] profiles.email write failed:', profErr.message)
    }

    // Best-effort: the change is made and reversible, so an audit failure is logged, not fatal.
    const { error: auditErr } = await admin.from('audit_log').insert({
      user_id: caller.id,
      action: 'member_email_corrected',
      target_type: 'profile',
      target_id: userId,
      details: { old_email: oldEmail, new_email: newEmail, reasons: target.reasons },
    })
    if (auditErr) console.error('[admin-fix-member-email] audit_log insert failed:', auditErr.message)

    return json({ user_id: userId, old_email: oldEmail, email: newEmail })
  } catch (err) {
    console.error('[admin-fix-member-email] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
