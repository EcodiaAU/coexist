/* One-shot verification of the QA sweep batch against the local stack.
   Run: node verify-qa.mjs   (dev server on :5215, supabase local on :54421) */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5215'
const PASS = 'Passw0rd!123'
const results = []
const ok = (id, pass, evidence) => {
  results.push({ id, pass, evidence })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${evidence}`)
}

const browser = await chromium.launch()

async function newAuthedPage(email, consoleFilters = []) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hits = []
  page.on('console', (msg) => {
    const t = msg.text()
    for (const f of consoleFilters) {
      if (f.re.test(t)) hits.push({ tag: f.tag, url: page.url(), text: t.slice(0, 200) })
    }
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'coexist-cookie-consent',
      JSON.stringify({ version: '1.0', consent: { necessary: true, analytics: false, marketing: false }, timestamp: Date.now() }),
    )
  })
  if (email) {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3500)
    // If the PhoneGate blocking modal is up (test user without a phone on
    // file), satisfy it for real - it validates + persists, keeping state sane.
    const gate = page.locator('[aria-labelledby="phone-gate-title"]')
    if (await gate.count()) {
      await gate.locator('input').first().fill('0400 000 001').catch(() => {})
      await gate.locator('button', { hasText: /save/i }).first().click().catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  return { ctx, page, hits }
}

const NEST = { tag: 'nesting', re: /descendant|validateDOMNesting/i }
const PATTERN = { tag: 'pattern', re: /pattern.*(?:not a valid|invalid)|invalid character in character class|Unable to check.*pattern/i }

/* ---------- P3-6: settings/privacy zero nesting errors, toggles work ---- */
{
  const { ctx, page, hits } = await newAuthedPage('participant@test.local', [NEST])
  await page.goto(BASE + '/settings/privacy', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // interact: click the visibility toggle and the row
  const toggles = page.locator('button[role="switch"], [role="switch"]')
  const tcount = await toggles.count()
  if (tcount > 0) { await toggles.first().click().catch(() => {}) }
  await page.waitForTimeout(800)
  ok('P3-6 privacy nesting', hits.length === 0, `console nesting errors=${hits.length} toggles=${tcount} ${hits.map(h => h.text).join(' | ').slice(0, 150)}`)
  await ctx.close()
}

/* ---------- P3-4: authed unknown route -> 404, visitor -> Welcome ------- */
{
  const { ctx, page } = await newAuthedPage('participant@test.local')
  await page.goto(BASE + '/definitely-not-a-real-page', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const body = await page.textContent('body')
  ok('P3-4 authed 404', /Page not found/i.test(body), `body has "Page not found"=${/Page not found/i.test(body)}; welcome-leak=${/create an account|sign up/i.test(body)}`)
  await ctx.close()

  const { ctx: c2, page: p2 } = await newAuthedPage(null)
  await p2.goto(BASE + '/definitely-not-a-real-page', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1200)
  const b2 = await p2.textContent('body')
  ok('P3-4 visitor welcome', !/Page not found/i.test(b2), `visitor sees welcome (no 404 text)=${!/Page not found/i.test(b2)}`)
  await c2.close()
}

/* ---------- P3-1: contact subject required + asterisk ------------------- */
{
  const { ctx, page } = await newAuthedPage('participant@test.local')
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  // asterisk next to Subject label
  const subjectLabel = page.locator('label', { hasText: 'Subject' }).first()
  const asterisk = await subjectLabel.locator('span.text-error').count()
  // fill everything except subject
  const inputs = page.locator('input[type="text"], input:not([type])')
  await page.fill('input[placeholder*="name" i], input[autocomplete="name"]', 'QA Tester').catch(() => {})
  const submit = page.locator('button[type="submit"]').last()
  // find fields by label order: Name, Email, Subject(dropdown), Message
  const allInputs = await page.locator('form input').all()
  for (const inp of allInputs) {
    const type = await inp.getAttribute('type')
    if (type === 'email') await inp.fill('qa@test.local')
    else if (!type || type === 'text') { const v = await inp.inputValue(); if (!v) await inp.fill('QA Tester') }
  }
  await page.locator('form textarea').first().fill('QA verification message body')
  await page.waitForTimeout(400)
  const disabledBefore = await submit.isDisabled()
  // choose a subject via the Dropdown trigger
  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.waitForTimeout(500)
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(400)
  const disabledAfter = await submit.isDisabled()
  ok('P3-1 contact subject', asterisk > 0 && disabledBefore && !disabledAfter,
    `asterisk=${asterisk > 0} disabledWithoutSubject=${disabledBefore} enabledWithSubject=${!disabledAfter}`)
  await ctx.close()
}

/* ---------- P3-2: DOB pattern regex valid on sign-up -------------------- */
{
  const { ctx, page, hits } = await newAuthedPage(null, [PATTERN, NEST])
  await page.goto(BASE + '/signup', { waitUntil: 'networkidle' }).catch(() => {})
  let dob = await page.locator('input[inputmode="numeric"][maxlength="10"]').count()
  if (dob === 0) {
    await page.goto(BASE + '/sign-up', { waitUntil: 'networkidle' }).catch(() => {})
    dob = await page.locator('input[inputmode="numeric"][maxlength="10"]').count()
  }
  // type into the DOB field to force pattern evaluation
  if (dob > 0) {
    await page.locator('input[inputmode="numeric"][maxlength="10"]').first().fill('01/01/2000').catch(() => {})
  }
  await page.waitForTimeout(800)
  const patt = await page.locator('input[inputmode="numeric"][maxlength="10"]').first().getAttribute('pattern').catch(() => null)
  const patternErrors = hits.filter((h) => h.tag === 'pattern')
  ok('P3-2 DOB pattern', dob > 0 && patternErrors.length === 0 && patt === '[0-9\\/]*',
    `dobFieldFound=${dob > 0} pattern="${patt}" consolePatternErrors=${patternErrors.length}`)
  await ctx.close()
}

/* ---------- P3-3: legal page fetch failure -> error state, not skeleton - */
{
  const { ctx, page } = await newAuthedPage(null)
  await page.route('**/rest/v1/legal_pages*', (route) => route.abort())
  await page.goto(BASE + '/privacy', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9500) // covers the 8s timeout escape
  const body = await page.textContent('body')
  const hasError = /For questions contact/i.test(body)
  const skeletons = await page.locator('.animate-pulse, [class*="skeleton" i]').count()
  ok('P3-3 legal error state', hasError, `errorText=${hasError} skeletonNodes=${skeletons}`)
  await ctx.close()
}

/* ---------- P2-3: legacy variant cart - fallback price + disabled CTA --- */
{
  const { ctx, page } = await newAuthedPage('participant@test.local')
  // seed a persisted cart holding both legacy shapes
  await page.evaluate(() => {
    const legacyTee = {
      product: { id: 'aaaaaaaa-1111-2222-3333-444444444401', name: 'QA Legacy Tee', slug: 'qa-legacy-tee', description: '', images: [], category: 'apparel', status: 'active', base_price_cents: 2500, variants: [], created_at: '', updated_at: '' },
      variant: { key: 'default', label: 'Default' }, // legacy shape: no price_cents
      quantity: 2,
    }
    const orphanCap = {
      product: { id: 'aaaaaaaa-1111-2222-3333-444444444402', name: 'QA Orphan Cap', slug: 'qa-orphan-cap', description: '', images: [], category: 'apparel', status: 'active', base_price_cents: null, variants: [], created_at: '', updated_at: '' },
      variant: { key: 'os', label: 'One Size' }, // legacy shape, no fallback either
      quantity: 1,
    }
    localStorage.setItem('coexist-cart', JSON.stringify({ state: { items: [legacyTee, orphanCap], promoCode: null }, version: 0 }))
  })
  await page.goto(BASE + '/shop/cart', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body = await page.textContent('body')
  const noNaN = !body.includes('NaN')
  const fallbackPrice = body.includes('$50.00') // 2500c x2 via base_price_cents fallback
  const unavailable = body.includes('Price unavailable')
  const warning = /missing a price/i.test(body)
  const checkoutBtn = page.locator('button', { hasText: 'Checkout' }).last()
  const ctaDisabled = await checkoutBtn.isDisabled().catch(() => false)
  ok('P2-3 legacy cart', noNaN && fallbackPrice && unavailable && warning && ctaDisabled,
    `noNaN=${noNaN} baseFallback$50=${fallbackPrice} priceUnavailable=${unavailable} warn=${warning} ctaDisabled=${ctaDisabled}`)

  // remove the orphan line -> CTA re-enables with real money only
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('coexist-cart'))
    raw.state.items = raw.state.items.filter((i) => i.product.id !== 'aaaaaaaa-1111-2222-3333-444444444402')
    localStorage.setItem('coexist-cart', JSON.stringify(raw))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const body2 = await page.textContent('body')
  const cta2 = await page.locator('button', { hasText: 'Checkout' }).last().isDisabled().catch(() => true)
  ok('P2-3 priced-only cart', !body2.includes('NaN') && body2.includes('$50.00') && !cta2,
    `noNaN=${!body2.includes('NaN')} shows$50=${body2.includes('$50.00')} ctaEnabled=${!cta2}`)
  await ctx.close()
}

/* ---------- P3-5: ticket checkout edge failure -> human toast ----------- */
{
  const { ctx, page } = await newAuthedPage('participant@test.local')
  await page.route('**/functions/v1/create-checkout**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }))
  await page.goto(BASE + '/events/22222222-0000-0000-0000-000000000003', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  // dismiss dietary gate if it appears
  const noDiet = page.locator('button', { hasText: /No dietary requirements/i })
  if (await noDiet.count()) { await noDiet.first().click().catch(() => {}); await page.waitForTimeout(800) }
  // select the ticket type (a button row showing name + price), then hit the CTA
  const typeRow = page.locator('button', { hasText: /General/ }).first()
  if (await typeRow.count()) await typeRow.click().catch(() => {})
  await page.waitForTimeout(500)
  const cta = page.locator('button', { hasText: /Get Ticket/i }).first()
  const ctaVisible = await cta.count()
  if (ctaVisible) await cta.click().catch(() => {})
  await page.waitForTimeout(2500)
  const body = await page.textContent('body')
  const human = /Payment could not start\. Nothing was charged/i.test(body)
  const raw = /non-2xx|FunctionsHttpError|Edge Function/i.test(body)
  ok('P3-5 human checkout error', ctaVisible > 0 && human && !raw,
    `ctaFound=${ctaVisible > 0} humanToast=${human} rawLeak=${raw}`)
  await ctx.close()
}

/* ---------- P2-1: leader lands on permitted page (probe /admin/events) -- */
{
  const { ctx, page } = await newAuthedPage('leader@test.local')
  await page.goto(BASE + '/admin/events', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body = await page.textContent('body')
  const restricted = /access restricted|not authorized|permission/i.test(body)
  await page.goto(BASE + '/leader/events', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body2 = await page.textContent('body')
  const leaderOk = !/access restricted|not authorized/i.test(body2)
  ok('P2-1 destinations', restricted && leaderOk,
    `adminEventsRestrictedForLeader=${restricted} leaderEventsAccessible=${leaderOk}`)
  await ctx.close()
}

/* ---------- summary ------------------------------------------------------ */
const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} gates green`)
await browser.close()
process.exit(fails.length ? 1 : 0)
