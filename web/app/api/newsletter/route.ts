import { NextResponse } from 'next/server'
import { getPublicSupabase } from '@/lib/supabase-public'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: { email?: string; firstName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const firstName = (body.firstName ?? '').trim().slice(0, 80) || null

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 })
  }

  // newsletter_subscribers/contact_messages were added by the P4 migration and
  // are not yet in the generated database.types (regenerated in P6), so the
  // typed client rejects them - cast for these inserts only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getPublicSupabase() as any
  // Plain INSERT with return=minimal (no .select()): anon has an INSERT policy
  // but no SELECT policy, and PostgREST upsert/ON CONFLICT needs more perms than
  // anon has. A duplicate email (unique violation 23505) just means already
  // subscribed, so treat it as success.
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email, first_name: firstName, source: 'website' })

  if (error && error.code !== '23505') {
    return NextResponse.json({ ok: false, error: 'could not subscribe' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
