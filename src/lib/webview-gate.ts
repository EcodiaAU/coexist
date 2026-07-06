/* ------------------------------------------------------------------ */
/*  Pre-React WebView capability gate for old Android System WebViews.  */
/*                                                                     */
/*  The es2019 build.target + polyfills.ts fix (2026-07-05) removed the */
/*  JS *crash* class on old WebViews, but the app's TRUE floor is set   */
/*  by its CSS framework, not its JS. Co-Exist uses Tailwind v4         */
/*  (`@import "tailwindcss"`), which HARD-REQUIRES color-mix() and      */
/*  @property - Chrome 111+ / Safari 16.4+ / Firefox 128+ - and these   */
/*  CANNOT be transpiled or polyfilled. On any engine below that floor  */
/*  `position:fixed` utilities and modern colours silently do not       */
/*  apply, so the layout collapses (verified 2026-07-05: the PhoneGate  */
/*  rendered ~21,000px off-screen on a Chrome 91 WebView, in BOTH the   */
/*  old and the JS-fixed builds). Any user old enough to have hit the   */
/*  JS crash is also below this CSS floor, so the JS fix alone leaves   */
/*  them with a broken (not crashing, but unusable) app.                */
/*                                                                     */
/*  So we detect the exact missing feature Tailwind v4 needs and, on an */
/*  under-floor engine, render a plain update screen (inline styles     */
/*  only - NO Tailwind, NO color-mix/oklch/dvh/@property, so it renders */
/*  on the broken engine) and skip the React mount entirely.           */
/* ------------------------------------------------------------------ */

// Co-Exist brand palette (from src/styles/globals.css). Inline hex only - the
// update screen must not depend on any CSS variable or Tailwind utility.
const BRAND_OLIVE = '#869e62' // --color-brand
const OLIVE_600 = '#5d7340' // --color-primary-600 (button, readable on white)
const FOREST = '#3d4d33' // --color-secondary-700 (heading)
const INK = '#333f2b' // --color-secondary-800 (body text)
const CREAM = '#f8f9f5' // index.html body background
const PLAY_WEBVIEW_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.webview'
const WEB_APP_URL = 'https://app.coexistaus.org'

/**
 * True on any engine that meets the Tailwind v4 floor, false only on a
 * genuinely old engine. `color-mix(in oklab, ...)` is exactly what Tailwind v4
 * emits and what Chrome 111 / Safari 16.4 first shipped, so this is a precise
 * capability probe, not UA sniffing. On every current browser it is true.
 */
export function isEngineSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.CSS &&
    typeof CSS.supports === 'function' &&
    CSS.supports('color', 'color-mix(in oklab, white, black)')
  )
}

/** UA-based Android check, used only to choose the primary CTA copy/target. */
function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/**
 * Paints the full-screen "update your browser engine" message into #root using
 * plain inline styles. Safe to call on the broken engine: it touches only
 * flexbox + hex colours + px/vh, all supported far below the Tailwind v4 floor.
 */
export function renderUnsupportedGate(): void {
  const root = document.getElementById('root')
  if (!root) return

  const android = isAndroid()

  // Neutralise the app viewport and paint the brand background.
  try {
    document.body.style.margin = '0'
    document.body.style.backgroundColor = CREAM
  } catch {
    // best-effort
  }

  const btnBase =
    'display:block;width:100%;box-sizing:border-box;padding:14px 18px;' +
    'border-radius:12px;font-size:16px;font-weight:600;text-align:center;' +
    'text-decoration:none;margin-top:12px;line-height:1.3;'
  const primaryBtn =
    btnBase + 'background:' + OLIVE_600 + ';color:#ffffff;border:1px solid ' + OLIVE_600 + ';'
  const secondaryBtn =
    btnBase +
    'background:#ffffff;color:' +
    FOREST +
    ';border:1px solid ' +
    BRAND_OLIVE +
    ';'

  const primaryCta = android
    ? '<a href="' + PLAY_WEBVIEW_URL + '" style="' + primaryBtn + '">Update Android System WebView</a>'
    : ''

  const nonAndroidLine = android
    ? ''
    : '<p style="margin:0 0 4px 0;font-size:15px;color:' +
      INK +
      ';line-height:1.5;">Please update your browser, or your phone software, to the latest version.</p>'

  root.innerHTML =
    '<div style="position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:' +
    CREAM +
    ';display:flex;align-items:center;justify-content:center;' +
    'padding:24px;box-sizing:border-box;overflow:auto;' +
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:400px;width:100%;text-align:center;">' +
    '<div style="width:56px;height:56px;border-radius:16px;background:' +
    BRAND_OLIVE +
    ';margin:0 auto 20px auto;"></div>' +
    '<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:' +
    FOREST +
    ';line-height:1.3;">Co-Exist needs a newer browser engine</h1>' +
    '<p style="margin:0 0 16px 0;font-size:15px;color:' +
    INK +
    ';line-height:1.5;">Your phone\'s built-in browser is a few versions behind what Co-Exist needs to display properly. A quick update gets you back in.</p>' +
    nonAndroidLine +
    primaryCta +
    '<a href="' +
    WEB_APP_URL +
    '" style="' +
    secondaryBtn +
    '">Open the web version</a>' +
    '</div>' +
    '</div>'
}
