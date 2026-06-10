// Maestro runScript helper. Inserts a sentinel `events` row owned by the
// test account (code@ecodia.au) on the Sunshine Coast collective so the
// admin events list can prove a server-side insert lands on the UI. The
// sentinel title carries a millisecond suffix so concurrent or repeated
// runs do not collide. Exposes ${output.eventId} + ${output.eventTitle}
// to the flow.
//
// Pairs with cleanup-admin-event.js (which deletes by the sentinel title
// prefix `MAESTRO-92-PROBE-` so orphans from killed runs self-heal on the
// next pass).
//
// RLS: admin-tier session can INSERT into events. The status='published'
// + date_start>>now path lands the row on the default UPCOMING admin view
// without needing a draft-filter tap.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('seed-admin-event: MAESTRO_CX_EMAIL/PASSWORD must be set')
}

const auth = http.post(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email, password: password }),
})
if (auth.status !== 200) {
  throw new Error('seed-admin-event: auth failed ' + auth.status + ' ' + auth.body)
}
const session = json(auth.body)
const accessToken = session.access_token
const userId = session.user && session.user.id
if (!accessToken || !userId) {
  throw new Error('seed-admin-event: auth missing access_token or user.id')
}

// Sunshine Coast: the leader collective for the test account (probed
// 2026-06-11; if this collective is archived this id has to be repointed).
const COLLECTIVE_ID = 'e8184908-fa00-4a2e-a642-3aa6f9aebabe'

// 28 days out keeps it well clear of "starting soon" UX states; the
// Date.now() suffix dedupes parallel + retry runs.
const ts = Date.now()
const dateStart = new Date(ts + 28 * 24 * 60 * 60 * 1000).toISOString()
const title = 'MAESTRO-92-PROBE-' + ts

const insert = http.post(SUPABASE_URL + '/rest/v1/events', {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    collective_id: COLLECTIVE_ID,
    created_by: userId,
    title: title,
    activity_type: 'clean_up',
    date_start: dateStart,
    is_public: false,
    is_ticketed: false,
    status: 'published',
  }),
})
if (insert.status !== 201) {
  throw new Error('seed-admin-event: insert returned ' + insert.status + ' ' + insert.body)
}
const rows = json(insert.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-admin-event: insert succeeded but returned no rows')
}

output.eventId = rows[0].id
output.eventTitle = rows[0].title
