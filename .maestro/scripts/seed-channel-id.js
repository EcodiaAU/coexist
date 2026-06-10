// Maestro runScript helper. Signs into Supabase as the test account
// (env-injected MAESTRO_CX_EMAIL/PASSWORD) and returns the first
// staff_channel_memberships row's channel_id, plus the channel name
// for assertion. Exposes ${output.channelId} and ${output.channelName}
// to subsequent flow steps.
//
// Why auth-password not anon: chat_channels + staff_channel_memberships
// are RLS-gated to channel members, so the anon key returns zero rows.
// The test account is a Sunshine Coast leader and a member of at least
// one staff channel; querying with its access_token reads only the
// rows it can already see in-app.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('seed-channel-id: MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD must be set')
}

const tokenRes = http.post(
  SUPABASE_URL + '/auth/v1/token?grant_type=password',
  {
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email, password: password }),
  },
)
if (tokenRes.status !== 200) {
  throw new Error('seed-channel-id: auth/token returned ' + tokenRes.status + ' ' + tokenRes.body)
}
const tok = json(tokenRes.body)
const access = tok.access_token
if (!access) {
  throw new Error('seed-channel-id: no access_token in auth response')
}

const params = [
  'select=channel_id,chat_channels(id,name,type,state)',
  'limit=10',
].join('&')

const res = http.get(SUPABASE_URL + '/rest/v1/chat_channel_members?' + params, {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + access,
  },
})
if (res.status !== 200) {
  throw new Error('seed-channel-id: memberships returned ' + res.status + ' ' + res.body)
}

const rows = json(res.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-channel-id: no chat_channel_members rows found for test account')
}

const live = rows.find(function (r) {
  const ch = r.chat_channels
  return ch && (ch.state === 'active' || ch.state == null)
}) || rows[0]

const ch = live.chat_channels || {}
output.channelId = live.channel_id
output.channelName = ch.name || 'Staff Chat'
