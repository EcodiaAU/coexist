import { Capacitor } from '@capacitor/core'

/**
 * Donations on the iOS app open Co-Exist's own website in Safari.
 *
 * Apple App Review Guideline 3.2.2(iv): an app may not collect charitable
 * donations inside the app unless the charity is an approved nonprofit, so the
 * iOS store binary must hand the donor to the website instead. Apple rejected
 * 2.3.58 (build 97) on 2026-10-22 for the in-app Stripe form, and approved it
 * only on our commitment that the next binary would link out. Tate, 2026-10-31:
 * "make donate send to the website".
 *
 * Android and the web keep the in-app Stripe checkout.
 */

/** Co-Exist's own donate page (their website, Raisely embed). */
export const COEXIST_WEBSITE_DONATE_URL = 'https://www.coexistaus.org/donate'

/** True only inside the native iOS app. */
export function donationsOpenWebsite(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/**
 * Hand a URL to the system browser. On iOS, `window.open` reaches Capacitor's
 * WebViewDelegationHandler.createWebViewWith, which calls UIApplication.open,
 * so Safari opens. Never use `location.href` or a plain link here: the app's
 * `allowNavigation` covers `*.coexistaus.org` and `*.stripe.com`, so a plain
 * navigation would load the payment page INSIDE the app's web view, which is
 * exactly what Apple refused.
 */
export function openInSystemBrowser(url: string): void {
  window.open(url, '_system')
}

/** Open the Co-Exist website donate page in Safari. */
export function openWebsiteDonate(): void {
  openInSystemBrowser(COEXIST_WEBSITE_DONATE_URL)
}
