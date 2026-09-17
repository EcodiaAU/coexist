import { test, expect } from '@playwright/test'

/*
 * Regression guard for the 2026-09-14 onboarding scroll-clip.
 *
 * Every ancestor in the onboarding tree is overflow-hidden (the h-dvh outer and
 * the flex-1 relative step viewport), so the step content itself is the only
 * possible scroll container. When it was not scrollable, the safety step -
 * 1164px of content against a 590px viewport in mobile Safari - put BOTH its
 * "Continue" and "I'll do this later" buttons permanently off-screen. Users
 * could only finish by pinch-zooming out, and onboarding completion fell from
 * ~96% to ~87% the week that step shipped (2026-08-30).
 *
 * This asserts the property that actually matters to a user: on a phone-sized
 * viewport, the step's primary action can be REACHED and is genuinely hittable
 * (not merely present in the DOM, and not covered by anything).
 */

const SHOT_DIR = 'e2e/__artifacts__'

test('safety step actions are reachable on a phone viewport', async ({ page }, testInfo) => {
  const email = `safety-reach+${Date.now()}@coexist.dev`

  // The cookie banner is fixed bottom / z-60 and intercepts taps on anything
  // beneath it, so it is dismissed after every navigation, not just once.
  const dismissCookies = async () => {
    const b = page.getByRole('button', { name: /accept all/i })
    if (await b.isVisible().catch(() => false)) {
      await b.click()
      await b.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
  }

  await page.goto('/signup')
  await dismissCookies()

  await page.getByLabel('Display name').fill('Reach Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/password/i).first().fill('SecurePass123!')
  await page.getByLabel(/date of birth/i).fill('14/03/1996')
  await page.locator('[data-eos-id="src/components/checkbox.tsx#2"]').click()
  await page.getByRole('button', { name: /create account/i }).click()

  await page.waitForURL(/\/(onboarding|accept-terms|verify-email|verify|email)/, { timeout: 20_000 })
  if (/verify|email/.test(page.url()) && !page.url().includes('onboarding')) {
    test.skip(true, `Signup landed on ${page.url()} (email verification required); cannot walk onboarding via UI`)
  }
  if (page.url().includes('accept-terms')) {
    await dismissCookies()
    await page.locator('[data-eos-id="src/components/checkbox.tsx#2"]').click()
    await page.getByRole('button', { name: /accept & continue|accept and continue/i }).click()
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 })
  }

  // Location -> phone -> safety.
  await expect(page.getByRole('heading', { name: /where are you based/i })).toBeVisible({ timeout: 15_000 })
  await page.getByLabel(/suburb or city/i).fill('Melbourne VIC')
  await page.getByRole('button', { name: /^continue$/i }).click()

  await expect(page.getByRole('heading', { name: /what's your mobile number/i })).toBeVisible({ timeout: 10_000 })
  await page.getByLabel('Mobile number').fill('0400123456')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // --- The safety step: the tallest step in onboarding ---
  await expect(page.getByRole('heading', { name: /a few things for event day/i })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOT_DIR}/safety-step-top.png` })

  const skip = page.getByRole('button', { name: /i'll do this later/i })

  // There must be a real scroll container: content taller than its box, able to scroll.
  const scrollable = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('*')]
    return els.some((el) => {
      const oy = getComputedStyle(el).overflowY
      return /(auto|scroll)/.test(oy) && el.scrollHeight > el.clientHeight + 1
    })
  })
  expect(scrollable, 'onboarding step content must be scrollable').toBe(true)

  // The action must be reachable AND actually hittable once scrolled to.
  await skip.scrollIntoViewIfNeeded()
  await expect(skip).toBeInViewport()
  const hittable = await skip.evaluate((btn) => {
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit === btn || btn.contains(hit as Node)
  })
  expect(hittable, 'the skip action must not be covered by another element').toBe(true)

  await page.screenshot({ path: `${SHOT_DIR}/safety-step-actions-reachable.png` })
  await testInfo.attach('final-url', { body: page.url() })
})
