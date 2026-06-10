// Maestro runScript helper. Picks any existing surveys row and exposes
// its id + title to subsequent flow steps as ${output.surveyId} and
// ${output.surveyTitle}. Used by /admin/surveys/:id/edit render.
// Auth-password required because the surveys table is RLS-gated.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('seed-survey-id: MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD must be set')
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
  throw new Error('seed-survey-id: auth/token returned ' + tokenRes.status + ' ' + tokenRes.body)
}
const tok = json(tokenRes.body)
const access = tok.access_token
if (!access) {
  throw new Error('seed-survey-id: no access_token in auth response')
}

const params = [
  'select=id,title',
  'order=created_at.desc',
  'limit=1',
].join('&')

const res = http.get(SUPABASE_URL + '/rest/v1/surveys?' + params, {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + access,
  },
})
if (res.status !== 200) {
  throw new Error('seed-survey-id: surveys returned ' + res.status + ' ' + res.body)
}

const rows = json(res.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-survey-id: no surveys rows found')
}

output.surveyId = rows[0].id
output.surveyTitle = rows[0].title
