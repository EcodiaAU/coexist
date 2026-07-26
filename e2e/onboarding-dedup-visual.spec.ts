import { test, expect } from '@playwright/test'

/*
 * Visual + behavioural proof of the 2026-07-26 onboarding dedup:
 *  - the name is captured at sign-up, so onboarding must NOT re-ask it: the
 *    first onboarding step is Location, not "What should we call you?".
 *  - phone is folded INTO the flow (no post-onboarding PhoneGate ambush).
 * Screenshots are written to e2e/__artifacts__/ for eyes-on review.
 */

const SHOT_DIR = 'e2e/__artifacts__'

test('deduped onboarding: name not re-asked, phone folded in (iPhone)', async ({ page }, testInfo) => {
  const email = `dedupe+${Date.now()}@coexist.dev`

  // --- Sign up (name captured HERE) ---
  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: /join the movement/i })).toBeVisible()

  // Dismiss the cookie-consent banner (fixed, z-60) so it can't intercept taps
  // lower in the form.
  const acceptCookies = page.getByRole('button', { name: /accept all/i })
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click()
  }

  await page.getByLabel('Display name').fill('Jess Rivera')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/password/i).first().fill('SecurePass123!')
  await page.getByLabel(/date of birth/i).fill('14/03/1996')
  // Toggle terms by clicking the visual checkbox box (the native input is
  // visually hidden; clicking the Terms/Privacy links inside the label would
  // navigate away). Playwright scrolls it into view first.
  await page.locator('[data-eos-id="src/components/checkbox.tsx#2"]').click()
  await expect(page.locator('input[type="checkbox"]')).toBeChecked()
  await page.screenshot({ path: `${SHOT_DIR}/00-signup-filled.png` })
  await page.getByRole('button', { name: /create account/i }).click()

  // Autoconfirm projects drop straight to the app; route-guard then bounces an
  // un-onboarded user through /accept-terms and on to /onboarding. If the
  // project requires email verify we can't proceed through the UI.
  await page.waitForURL(/\/(onboarding|accept-terms|verify-email|verify|email)/, { timeout: 20_000 })
  if (/verify|email/.test(page.url()) && !page.url().includes('onboarding')) {
    await page.screenshot({ path: `${SHOT_DIR}/verify-email-wall.png` })
    test.skip(true, `Signup landed on ${page.url()} (email verification required in this env); cannot walk onboarding via UI`)
  }

  // In-app Terms gate (separate from the signup checkbox).
  if (page.url().includes('accept-terms')) {
    await page.locator('[data-eos-id="src/components/checkbox.tsx#2"]').click()
    await page.getByRole('button', { name: /accept & continue|accept and continue/i }).click()
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 })
  }

  // --- Onboarding step 1 must be LOCATION, not the name re-ask (the dedup) ---
  await expect(page.getByRole('heading', { name: /where are you based/i })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /what should we call you/i })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOT_DIR}/01-onboarding-first-step-location.png` })

  // Type a suburb (sets the query so Continue enables; place resolution via
  // Google isn't needed for this assertion).
  await page.getByLabel(/suburb or city/i).fill('Melbourne VIC')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // --- Phone step is now part of the flow ---
  await expect(page.getByRole('heading', { name: /what's your mobile number/i })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOT_DIR}/02-onboarding-phone-step.png` })
  await page.getByLabel('Mobile number').fill('0400123456')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // --- Collective step ---
  await expect(page.getByRole('heading', { name: /join a collective/i })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOT_DIR}/03-onboarding-collective-step.png` })
  await page.getByRole('button', { name: /skip for now/i }).click()

  // --- First event step ---
  await expect(page.getByRole('heading', { name: /find your first event/i })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOT_DIR}/04-onboarding-first-event-step.png` })
  await page.getByRole('button', { name: /^continue$/i }).click()

  // --- Celebration (onboarding done, no phone gate ambush) ---
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOT_DIR}/05-onboarding-complete.png` })

  await testInfo.attach('final-url', { body: page.url() })
})
