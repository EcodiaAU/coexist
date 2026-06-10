// Maestro runScript helper. Picks an active merch_products row (the
// same query useProducts() and useProduct(slug) drive in the app) and
// exposes its slug + name to the flow. Used by /shop/<slug> + the
// /shop/checkout cart-add flow. Auth-password required: the
// merch_products_select_all RLS policy is TO authenticated, so the
// anon key returns zero rows.

const SUPABASE_URL = 'https://tjutlbzekfouwsiaplbr.supabase.co'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U'

const email = MAESTRO_CX_EMAIL
const password = MAESTRO_CX_PASSWORD
if (!email || !password) {
  throw new Error('seed-product-slug: MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD must be set')
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
  throw new Error('seed-product-slug: auth/token returned ' + tokenRes.status + ' ' + tokenRes.body)
}
const tok = json(tokenRes.body)
const access = tok.access_token
if (!access) {
  throw new Error('seed-product-slug: no access_token in auth response')
}

const params = [
  'select=id,slug,name,base_price_cents,is_active,status',
  'is_active=eq.true',
  'status=eq.active',
  'order=created_at.desc',
  'limit=1',
].join('&')

const res = http.get(SUPABASE_URL + '/rest/v1/merch_products?' + params, {
  headers: {
    apikey: ANON,
    Authorization: 'Bearer ' + access,
  },
})
if (res.status !== 200) {
  throw new Error('seed-product-slug: merch_products returned ' + res.status + ' ' + res.body)
}

const rows = json(res.body)
if (!rows || rows.length === 0) {
  throw new Error('seed-product-slug: no active merch_products found')
}

output.productSlug = rows[0].slug
output.productName = rows[0].name
output.productId = rows[0].id
