// Maestro runScript helper. Signs into Supabase as the test account
// (env-injected MAESTRO_CX_EMAIL/PASSWORD) and returns a NON-SELF
// profile id with a display_name set, plus the display_name for
// assertion. Exposes ${output.peerUserId} and ${output.peerDisplayName}.
//
// Why auth-password not anon: profiles is RLS-gated; anon reads are
// restricted to publicly-listable profile fields and may miss the
// display_name. Using the authed session matches what the app sees.
//
// Filters out the signed-in user's own profile and prefers a profile
// with display_name set so /profile/:userId renders the named heading
// branch instead of the 'Profile' fallback (view-profile.tsx:150
// uses display_name as the Header title; the body h2 also reflects
// display_name).

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('seed-peer-user-id: MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD must be set')
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
  throw new Error('seed-peer-user-id: auth/token returned ' + tokenRes.status + ' ' + tokenRes.body)
}
const tok = json(tokenRes.body)
const access = tok.access_token
const myUserId = tok.user && tok.user.id
if (!access || !myUserId) {
  throw new Error('seed-peer-user-id: no access_token / user.id in auth response')
}

const params = [
  'select=id,display_name',
  'id=neq.' + myUserId,
  'display_name=not.is.null',
  'order=created_at.asc',
  'limit=1',
].join('&')

const res = http.get(SUPABASE_URL + '/rest/v1/profiles?' + params, {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + access,
  },
})
if (res.status !== 200) {
  throw new Error('seed-peer-user-id: profiles returned ' + res.status + ' ' + res.body)
}

const rows = json(res.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-peer-user-id: no non-self profile with display_name found')
}

output.peerUserId = rows[0].id
output.peerDisplayName = rows[0].display_name
