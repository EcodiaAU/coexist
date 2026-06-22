import { NextResponse } from 'next/server'
import { getPublicSupabase } from '@/lib/supabase-public'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: { name?: string; email?: string; topic?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }

  const name = (body.name ?? '').trim().slice(0, 120)
  const email = (body.email ?? '').trim().toLowerCase()
  const topic = (body.topic ?? '').trim().slice(0, 80) || null
  const message = (body.message ?? '').trim().slice(0, 4000)

  if (!name || !message || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'missing or invalid fields' }, { status: 400 })
  }

  // contact_messages was added by the P4 migration and is not yet in the
  // generated database.types (regenerated in P6) - cast for this insert only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getPublicSupabase() as any
  // return=minimal (no .select()) so anon's INSERT-only policy is satisfied.
  const { error } = await supabase
    .from('contact_messages')
    .insert({ name, email, topic, message, source: 'website' })

  if (error) {
    return NextResponse.json({ ok: false, error: 'could not send' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
