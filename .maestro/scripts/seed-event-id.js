// Maestro runScript helper. Picks the next upcoming FREE public event from
// the live Supabase substrate and exposes its id + title to subsequent flow
// steps as ${output.eventId} / ${output.eventTitle}. Used by event-detail
// deep-walk + RSVP-cleanup flows where the explore-card tap surface is
// unstable (the activity-type chip is not the card tap target and matches
// multiple nodes).
//
// Anon key is the same publishable key shipped in the app bundle (the app's
// network config exposes it to anyone with the IPA / AAB), so embedding it
// here adds no leakage. RLS gates everything on the server.
//
// is_ticketed=false because the ticketed RSVP path drops you in Stripe
// checkout; we want the free Register-for-Event button to be the CTA.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const params = [
  'select=id,title,is_ticketed,date_start,is_public',
  'date_start=gt.now()',
  'is_public=eq.true',
  'is_ticketed=eq.false',
  'order=date_start.asc',
  'limit=1',
].join('&')

const res = http.get(SUPABASE_URL + '/rest/v1/events?' + params, {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + ANON,
  },
})

if (res.status !== 200) {
  throw new Error('seed-event-id: supabase returned ' + res.status + ' ' + res.body)
}

const rows = json(res.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-event-id: no upcoming free public events found in DB')
}

output.eventId = rows[0].id
output.eventTitle = rows[0].title
