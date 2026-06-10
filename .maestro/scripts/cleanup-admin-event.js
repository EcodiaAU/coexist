// Maestro runScript cleanup partner for seed-admin-event.js. Deletes
// every events row whose title carries the `MAESTRO-92-PROBE-` sentinel
// prefix - sweeping orphans from earlier killed runs at the same time it
// finishes the canonical create-assert-delete-assert-gone round trip.
// Does not touch output.eventTitle so 92 can still assert-not-visible
// against it after this script runs.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('cleanup-admin-event: MAESTRO_CX_EMAIL/PASSWORD must be set')
}

const auth = http.post(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email, password: password }),
})
if (auth.status !== 200) {
  throw new Error('cleanup-admin-event: auth failed ' + auth.status + ' ' + auth.body)
}
const accessToken = json(auth.body).access_token
if (!accessToken) {
  throw new Error('cleanup-admin-event: auth missing access_token')
}

const del = http.delete(
  SUPABASE_URL + '/rest/v1/events?title=like.MAESTRO-92-PROBE-*',
  {
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + accessToken,
      Prefer: 'return=representation',
    },
  },
)
if (del.status !== 200 && del.status !== 204) {
  throw new Error('cleanup-admin-event: delete returned ' + del.status + ' ' + del.body)
}
