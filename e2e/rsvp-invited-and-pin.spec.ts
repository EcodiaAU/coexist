/**
 * Targeted E2E for two prod bug reports (2026-07-06 investigation):
 *
 * Bug A: RSVP for a user whose event_registrations row is status='invited'
 *        (seeded exactly as the bulk-invite path writes it, via PostgREST
 *        as the leader). Drives the real event-detail UI.
 *
 * Bug B: An edit that touches ONLY the title must not drop / mutate
 *        events.location_point (bit-identical WKB before vs after).
 *        Plus: the duplicate (?from=) prefill must carry the pin.
 *
 * Runs against the local supabase stack (127.0.0.1:54421) + vite dev
 * server. Seeding/asserting DB state uses psql on 127.0.0.1:54422.
 */
import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

const URL_REST = 'http://127.0.0.1:54421'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'Passw0rd!123'
const PARTICIPANT = 'participant@test.local'
const LEADER = 'leader@test.local'
const PARTICIPANT_ID = '1fc713e4-32fa-4533-affd-418fa888256f'
const EVENT_INVITED = '22222222-0000-0000-0000-000000000001' // Geelong Beach Cleanup
const COLLECTIVE = '11111111-0000-0000-0000-000000000001'
const LEADER_ID = '1a86a25d-86b7-47de-adf9-30febd6f2ceb'
const PIN_EVENT = '22222222-0000-0000-0000-00000000e2e1'
const EXACT_POINT = 'SRID=4326;POINT(144.9849827 -37.770437)'

function psql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim()
  return execSync(
    `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres -Atc ${JSON.stringify(oneLine)}`,
    { encoding: 'utf8' },
  ).trim()
}

async function restLogin(email: string): Promise<string> {
  const res = await fetch(`${URL_REST}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error(`login failed for ${email}`)
  return json.access_token
}

async function uiLogin(page: Page, email: string) {
  // Pre-seed cookie consent so the banner never intercepts clicks
  await page.addInitScript(() => {
    localStorage.setItem(
      'coexist-cookie-consent',
      JSON.stringify({
        version: '1.0',
        consent: { necessary: true, analytics: false },
        timestamp: Date.now(),
      }),
    )
  })
  await page.goto('/login')
  await page.getByRole('textbox', { name: /email/i }).fill(email)
  await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD)
  // Submit via Enter on the form field: a transient full-screen overlay
  // (z-[100]) can intercept pointer events, and force-clicks would land
  // on the overlay instead of the button.
  await page.getByRole('textbox', { name: /password/i }).press('Enter')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

async function completePhoneGateIfShown(page: Page) {
  const gate = page.locator('[aria-labelledby="phone-gate-title"]')
  const shown = await gate
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (!shown) return
  await page.getByRole('textbox', { name: /mobile number/i }).fill('0404 111 222')
  await page.getByRole('button', { name: /save and continue/i }).click()
  await gate.waitFor({ state: 'hidden', timeout: 15000 })
}

test.describe('Bug A: invited user RSVP', () => {
  test.beforeAll(async () => {
    // Clean slate, then seed the invited row EXACTLY as the bulk-invite
    // path writes it: PostgREST upsert as the leader, ignore-duplicates.
    psql(
      `DELETE FROM event_registrations WHERE event_id='${EVENT_INVITED}' AND user_id='${PARTICIPANT_ID}'`,
    )
    // Reproduce the stuck prod cohort faithfully: phone-less member
    // (59-66 percent of the stuck invitees in Geelong/Brighton had no phone)
    psql(`UPDATE profiles SET phone=NULL WHERE id='${PARTICIPANT_ID}'`)
    const leaderToken = await restLogin(LEADER)
    const res = await fetch(
      `${URL_REST}/rest/v1/event_registrations?on_conflict=event_id%2Cuser_id`,
      {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${leaderToken}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify([
          {
            event_id: EVENT_INVITED,
            user_id: PARTICIPANT_ID,
            status: 'invited',
            invited_at: new Date().toISOString(),
          },
        ]),
      },
    )
    expect(res.status).toBe(201)
    expect(psql(
      `SELECT status FROM event_registrations WHERE event_id='${EVENT_INVITED}' AND user_id='${PARTICIPANT_ID}'`,
    )).toBe('invited')
  })

  test('invited participant sees Accept & Register and lands registered', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    const failedRegWrites: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('event_registrations') && r.request().method() !== 'GET' && r.status() >= 400) {
        failedRegWrites.push(`${r.request().method()} ${r.url()} -> ${r.status()}`)
      }
    })

    await uiLogin(page, PARTICIPANT)
    await page.goto(`/events/${EVENT_INVITED}`)

    // The required-mobile safety gate (non-dismissable, shipped 2026-06-29,
    // 8823b79) blocks EVERY surface for phone-less members. This is the real
    // prod journey for the stuck invitees: complete the gate first.
    await completePhoneGateIfShown(page)

    // Invited CTA must render (not the plain Register, not "You're registered")
    await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 15000 })
    const accept = page.getByRole('button', { name: /accept & register/i })
    await expect(accept).toBeVisible()
    await accept.click()

    // UI lands in registered state
    await expect(
      page.getByText(/You're registered|Check-in opens at|Check In Now/i).first(),
    ).toBeVisible({ timeout: 15000 })

    // DB row transitioned invited -> registered, invited_at preserved
    await expect
      .poll(
        () =>
          psql(
            `SELECT status || '|' || (invited_at IS NOT NULL) FROM event_registrations WHERE event_id='${EVENT_INVITED}' AND user_id='${PARTICIPANT_ID}'`,
          ),
        { timeout: 10000 },
      )
      .toBe('registered|true')

    expect(failedRegWrites, `registration writes failed: ${failedRegWrites.join('; ')}`).toHaveLength(0)
  })

  test('regression: plain RSVP (no invited row) still works', async ({ page }) => {
    psql(
      `DELETE FROM event_registrations WHERE event_id='${EVENT_INVITED}' AND user_id='${PARTICIPANT_ID}'`,
    )
    await uiLogin(page, PARTICIPANT)
    await page.goto(`/events/${EVENT_INVITED}`)
    await completePhoneGateIfShown(page)
    const register = page.getByRole('button', { name: /register for event/i }).first()
    await expect(register).toBeVisible({ timeout: 15000 })
    await register.click()
    await expect(
      page.getByText(/You're registered|Check-in opens at|Check In Now/i).first(),
    ).toBeVisible({ timeout: 15000 })
    await expect
      .poll(
        () =>
          psql(
            `SELECT status FROM event_registrations WHERE event_id='${EVENT_INVITED}' AND user_id='${PARTICIPANT_ID}'`,
          ),
        { timeout: 10000 },
      )
      .toBe('registered')
  })
})

test.describe('Bug B: exact map pin survives unrelated edits', () => {
  test.beforeAll(() => {
    psql(`DELETE FROM events WHERE id='${PIN_EVENT}'`)
    psql(
      `INSERT INTO events (id, collective_id, created_by, title, description, activity_type, date_start, status, is_public, address, location_point)
       VALUES ('${PIN_EVENT}', '${COLLECTIVE}', '${LEADER_ID}', 'Pin Survival Test', 'e2e fixture', 'clean_up', now() + interval '10 days', 'published', true, 'Northcote, Victoria', '${EXACT_POINT}')`,
    )
  })

  test('editing ONLY the title keeps location_point bit-identical', async ({ page }) => {
    const before = psql(`SELECT location_point FROM events WHERE id='${PIN_EVENT}'`)
    expect(before).not.toBe('')

    await uiLogin(page, LEADER)
    await page.goto(`/events/${PIN_EVENT}/edit`)

    const title = page.getByLabel(/title/i).first()
    await expect(title).toHaveValue('Pin Survival Test', { timeout: 15000 })
    // Give the prefill effect time to hydrate lat/lng from the WKB parse
    await page.waitForTimeout(1000)
    await title.fill('Pin Survival Test EDITED')

    await page.getByRole('button', { name: /save/i }).first().click()
    await page.waitForURL(`**/events/${PIN_EVENT}`, { timeout: 15000 })

    await expect
      .poll(() => psql(`SELECT title FROM events WHERE id='${PIN_EVENT}'`), { timeout: 10000 })
      .toBe('Pin Survival Test EDITED')

    const after = psql(`SELECT location_point FROM events WHERE id='${PIN_EVENT}'`)
    expect(after).toBe(before)
  })

  test('duplicate (?from=) prefill parse: PostgREST wire format -> parseLocationPoint', async () => {
    // The historic pin-drop (Merri Mornings, created 2026-04-23) happened
    // because parseLocationPoint could not read the WKB hex PostgREST
    // returns for geography columns until a512ceb (2026-05-01). This test
    // pins the exact data path the duplicate/edit prefill uses: fetch the
    // row over PostgREST as the leader (same select('*') the flow runs),
    // then parse the raw location_point with the app's own parser.
    const { parseLocationPoint } = await import('../src/lib/geo')
    const leaderToken = await restLogin(LEADER)
    const res = await fetch(
      `${URL_REST}/rest/v1/events?id=eq.${PIN_EVENT}&select=*`,
      { headers: { apikey: ANON, Authorization: `Bearer ${leaderToken}` } },
    )
    const rows = (await res.json()) as Array<{ location_point: unknown }>
    expect(rows).toHaveLength(1)
    const pos = parseLocationPoint(rows[0].location_point)
    expect(pos).not.toBeNull()
    expect(pos!.lng).toBeCloseTo(144.9849827, 6)
    expect(pos!.lat).toBeCloseTo(-37.770437, 6)
  })
})
