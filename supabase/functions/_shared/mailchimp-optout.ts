/* eslint-disable @typescript-eslint/no-explicit-any */
// One opt-out, used by the Mailchimp webhook and by the sync when Mailchimp
// already holds someone as unsubscribed. It calls unsubscribe_by_email, the RPC
// the Unsubscribe link in Co-Exist's own emails uses, so the opt-out paths
// cannot drift apart, and closes any newsletter-only signup for the address.

// ilike with the address escaped: an unescaped '_' or '%' in an email is a LIKE
// wildcard, and "a_b@x.org" would also match "axb@x.org".
export function exactInsensitive(email: string): string {
  return email.replace(/[\\%_]/g, (c) => '\\' + c)
}

function must<T>(r: { data: T; error: any }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

export async function optOutEverywhere(admin: any, email: string): Promise<{ profiles: number; newsletter: number }> {
  must(await admin.rpc('unsubscribe_by_email', { p_email: email }), 'unsubscribe_by_email')
  const profiles = must(
    await admin.from('profiles').select('id').ilike('email', exactInsensitive(email)).eq('marketing_opt_in', false),
    'count profiles',
  ) as any[]
  const nl = must(
    await admin.from('newsletter_subscribers').update({ status: 'unsubscribed' }).ilike('email', exactInsensitive(email)).select('id'),
    'newsletter unsubscribe',
  ) as any[]
  return { profiles: profiles.length, newsletter: nl.length }
}
