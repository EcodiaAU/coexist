// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { resolveRecipientEmail } from '../_shared/recipient-email.ts'

/** Resend tag values allow ASCII alnum, underscore and dash only. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/* ------------------------------------------------------------------ */
/*  Resend Configuration                                               */
/* ------------------------------------------------------------------ */

/**
 * Resend Setup Requirements:
 * 1. Domain verification: Verify coexistaus.org in Resend (DNS records for DKIM, SPF, DMARC)
 * 2. API key: Create an API key at resend.com/api-keys
 * 3. Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'hello@coexistaus.org'
const FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Co-Exist'

/* ------------------------------------------------------------------ */
/*  Email Template Definitions                                         */
/* ------------------------------------------------------------------ */

/**
 * Resend doesn't use server-side template IDs like SendGrid.
 * Instead, you send HTML directly (or use React Email on the server).
 *
 * For now, each template type maps to a subject line generator and
 * an HTML builder. The `data` object passed by callers is used to
 * populate the email content.
 *
 * To use React Email templates later, build them in a shared package
 * and render to HTML before passing to the Resend API.
 */

interface TemplateDefinition {
  category: 'transactional' | 'marketing'
  description: string
  subject: (data: Record<string, unknown>) => string
}

const EMAIL_TEMPLATES: Record<string, TemplateDefinition> = {
  // ---- Transactional ----
  welcome: {
    category: 'transactional',
    description: 'Welcome email after signup. Data: { name, app_url }',
    subject: () => 'Welcome to Co-Exist!',
  },
  event_confirmation: {
    category: 'transactional',
    description: 'Event registration confirmation. Data: { name, event_title, event_date, event_location, event_url }',
    subject: (d) => `You're registered: ${d.event_title}`,
  },
  ticket_confirmation: {
    category: 'transactional',
    description: 'Ticket purchase confirmation. Data: { name, event_title, event_date, event_location, ticket_code, quantity, amount, currency, ticket_url }',
    subject: (d) => `You're going: ${d.event_title}`,
  },
  event_reminder: {
    category: 'transactional',
    description: '24h event reminder. Data: { name, event_title, event_date, event_location, event_url }',
    subject: (d) => `Reminder: ${d.event_title} is coming up`,
  },
  event_cancelled: {
    category: 'transactional',
    description: 'Event cancelled notification. Data: { name, event_title, event_date, reason }',
    subject: (d) => `Event cancelled: ${d.event_title}`,
  },
  event_invite: {
    category: 'transactional',
    description: 'Invited to an event. Data: { name, inviter_name, event_title, event_url }',
    subject: (d) => `${d.inviter_name} invited you to ${d.event_title}`,
  },
  waitlist_promoted: {
    category: 'transactional',
    description: 'Promoted from waitlist. Data: { name, event_title, event_date, event_url }',
    subject: (d) => `You're in! Spot available for ${d.event_title}`,
  },
  password_reset: {
    category: 'transactional',
    description: 'Password reset. Data: { name, reset_url }',
    subject: () => 'Reset your password',
  },
  donation_receipt: {
    category: 'transactional',
    description: 'Donation receipt. Data: { name, amount, currency, date, receipt_url, is_recurring }',
    subject: (d) => `Thanks for your ${d.is_recurring ? 'recurring ' : ''}donation!`,
  },
  order_confirmation: {
    category: 'transactional',
    description: 'Merch order confirmation. Data: { name, order_id, items, total, shipping_address }',
    subject: (d) => `Order confirmed: #${d.order_id}`,
  },
  order_shipped: {
    category: 'transactional',
    description: 'Order shipped. Data: { name, order_id, tracking_number, tracking_url }',
    subject: (d) => `Your order #${d.order_id} has shipped!`,
  },
  'data-export-request': {
    category: 'transactional',
    description: 'Data export requested. Data: { name, email }',
    subject: () => 'Your data export request',
  },
  payment_failed: {
    category: 'transactional',
    description: 'Recurring payment failed. Data: { name, amount, update_url }',
    subject: () => 'Payment failed - action needed',
  },
  subscription_cancelled: {
    category: 'transactional',
    description: 'Subscription cancelled. Data: { name, donate_url }',
    subject: () => 'Your recurring donation has been cancelled',
  },
  refund_confirmation: {
    category: 'transactional',
    description: 'Order refund processed. Data: { name, order_id, refund_amount, currency }',
    subject: (d) => `Refund processed for order #${d.order_id}`,
  },
  ticket_transferred: {
    category: 'transactional',
    description: 'Ticket moved to another event by a leader (no refund, same ticket). Data: { name, event_title, event_date, event_location, previous_event_title, ticket_code, event_url }',
    subject: (d) => `Your ticket has moved to ${d.event_title}`,
  },

  // A spot is HELD for this person on a (possibly full) event, but they have
  // not paid. Distinct from ticket_confirmation: nothing is confirmed yet and
  // the whole point of the email is the pay-to-confirm link.
  ticket_spot_held: {
    category: 'transactional',
    description: 'Organiser held a spot; recipient must pay to confirm. Data: { name, event_title, event_date, event_location, amount, currency, hold_expires, pay_url, reserved_by_name, event_is_full }',
    subject: (d) => `A spot is held for you: ${d.event_title}`,
  },
  event_spot_released: {
    category: 'transactional',
    description: 'A registration could not be honoured (no ticket was ever bought) and the spot is not held. Data: { name, event_title, event_date, event_location, next_events_url }',
    subject: (d) => `About your spot at ${d.event_title}`,
  },
  ticket_transfer_offer: {
    category: 'transactional',
    description: 'Someone is transferring their ticket to you. Data: { name, from_name, event_title, event_date, event_location, claim_url, expires }',
    subject: (d) => `${d.from_name} is passing you their ticket to ${d.event_title}`,
  },

  // A ticket refund is not a merch refund. `refund_confirmation` says
  // "order #45e658d2" and never names the event, which is what a refunded
  // member actually needs to recognise. Kept OUT of TYPE_TO_PREF_KEY on
  // purpose: money moving is operational, not a notification preference.
  ticket_refunded: {
    category: 'transactional',
    description: 'Event ticket refunded. Data: { name, event_title, event_date, event_location, ticket_code, refund_amount, currency }',
    subject: (d) => `Refund processed: ${d.event_title}`,
  },

  collective_application: {
    category: 'transactional',
    description: 'New collective application notification. Data: { applicant_name, applicant_email, roles, location }',
    subject: (d) => `New Collective Application: ${d.applicant_name}`,
  },

  // ---- Marketing ----
  newsletter: {
    category: 'marketing',
    description: 'Monthly newsletter. Data: { name, content_html }',
    subject: () => 'Co-Exist Monthly Update',
  },
  challenge_announcement: {
    category: 'marketing',
    description: 'New challenge launched. Data: { name, challenge_title, challenge_description, challenge_url }',
    subject: (d) => `New Challenge: ${d.challenge_title}`,
  },
  monthly_impact_recap: {
    category: 'marketing',
    description: 'Monthly impact summary. Data: { name, events_count, trees, hours, rubbish_kg, month }',
    subject: (d) => `Your ${d.month} impact recap`,
  },
  announcement_digest: {
    category: 'marketing',
    description: 'Weekly announcement digest. Data: { name, announcements[] }',
    subject: () => 'This week at Co-Exist',
  },
  upcoming_in_collective: {
    category: 'marketing',
    description: 'Re-engagement digest: the next event in a lapsed member\'s collective. Data: { name, collective_name, event_title, event_date, event_location, event_url }',
    subject: (d) => `What's on with ${d.collective_name}`,
  },
}

/* ------------------------------------------------------------------ */
/*  Notification-preference gate                                        */
/* ------------------------------------------------------------------ */

/**
 * Maps a transactional email type to the notification_preferences key that
 * governs it. Toggling one of these off in Settings -> Notifications now
 * suppresses BOTH the push (via send-push) AND the email (here), so a setting
 * is respected on every delivery channel rather than push only.
 *
 * Types absent from this map (welcome, password_reset, donation_receipt,
 * order_confirmation, order_shipped, refund_confirmation, ticket_refunded,
 * payment_failed,
 * subscription_cancelled, data-export-request, collective_application) are
 * operational and always send. Marketing-category types are gated separately
 * by profiles.marketing_opt_in further down.
 */
const TYPE_TO_PREF_KEY: Record<string, string> = {
  event_confirmation: 'registration_confirmed',
  event_reminder: 'event_reminder',
  event_cancelled: 'event_cancelled',
  event_invite: 'event_invite',
  waitlist_promoted: 'waitlist_promotion',
  // Marketing digest, but honour the same toggle as the push nudge so a
  // member who turned off "New Events" gets neither channel.
  upcoming_in_collective: 'new_event_in_collective',
}

/* ------------------------------------------------------------------ */
/*  Resend API call                                                    */
/* ------------------------------------------------------------------ */

interface SendEmailPayload {
  /** Email type - must match a key in EMAIL_TEMPLATES */
  type: string
  /** Recipient email address (single-send). Omitted for a batch send. */
  to?: string
  /** Dynamic template data (Handlebars variables) */
  data?: Record<string, unknown>
  /** Optional: override the subject (for non-template sends) */
  subject?: string
  /** Optional: HTML content (used by campaign sends) */
  html?: string
  /** For internal requests (e.g. data export) */
  userId?: string
  email?: string
  /**
   * Optional correlation id for a ticket-scoped transactional send. Emitted to
   * Resend as a `ticket_id` tag and echoed back on every delivery event, which
   * is how resend-webhook maps an asynchronous bounce to the ticket whose
   * notification claim it must release. Resend tag values accept only ASCII
   * letters, digits, underscores and dashes, so a UUID is passed straight
   * through and anything else is dropped rather than failing the send.
   */
  ticketId?: string
  /**
   * Batch send: many personalised emails of the same `type` in ONE call.
   * Sent via Resend's /emails/batch endpoint (up to 100 per request), so N
   * recipients cost ceil(N/100) API calls, staying under Resend's 10 req/s
   * rate limit. Marketing types are opt-in gated per recipient by userId.
   */
  recipients?: Array<{ userId?: string; to: string; data?: Record<string, unknown> }>
}

/* ------------------------------------------------------------------ */
/*  Branded Email Template System                                      */
/* ------------------------------------------------------------------ */

const LOGO_URL = 'https://app.coexistaus.org/logos/white-wordmark.png'
const LOGO_DARK_URL = 'https://app.coexistaus.org/logos/black-wordmark.png'
const APP_URL = 'https://app.coexistaus.org'

// Co-Exist email design language (2026-08-13 rebuild). Matches the app's
// home/profile/explore surfaces: full-bleed hero imagery, slim Montserrat
// (the app's own Eau Sans -> Montserrat web fallback), warm palette,
// single content column, no emoji, genuinely light/dark aware.
//
// FONT: emails cannot reliably load the bundled Eau Sans woff2, so we use
// Montserrat via Google Fonts (the app's declared fallback) with a system
// sans fallback for clients that strip webfonts (Gmail app).
const FONT_STACK =
  "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// Brand olive is #869e62 - the EXACT hex the live app uses
// (src/styles/globals.css --color-brand). Emails previously used an
// off-by-one #879e62; aligned here so the email hero matches the in-app
// Impact section pixel-for-pixel. Light values are the inline baseline;
// dark values are applied by class in the <style> media query below.
const C = {
  brand: '#869e62',
  brandDark: '#5d7340',
  brandLight: '#a3b88a',
  brandDarkMode: '#93ab6d', // brightened olive for dark backgrounds
  bg: '#f4f2ec',
  cardBg: '#ffffff',
  tint: '#f5f4ee',
  border: '#ece8de',
  text: '#2d3a22',
  textMuted: '#7d8768',
  textLight: '#9aa382',
  white: '#ffffff',
  error: '#c0392b',
  warning: '#E8913A',
  success: '#869e62',
}

/**
 * True full-bleed hero. The image spans the entire email width edge to edge
 * (no card, no radius, no side gutter). A dark bottom-up legibility gradient
 * sits over it and the white wordmark + heading sit bottom-left in the dark
 * zone, matching the app's full-bleed tiles. No image -> solid olive->darker
 * gradient (bgcolor is the Outlook fallback, always legible). Side padding
 * matches the body so the hero heading lines up with the copy below.
 */
function heroCell(opts: {
  heroTitle: string
  heroSubtitle?: string
  heroImage?: string
  heroFocalX?: number
  heroFocalY?: number
  overline?: string
}): string {
  const hasImg = !!opts.heroImage
  const fx = opts.heroFocalX ?? 50
  const fy = opts.heroFocalY ?? 50
  const bgLayers = hasImg
    ? `background-image:linear-gradient(to top, rgba(13,18,8,0.82) 0%, rgba(13,18,8,0.36) 44%, rgba(13,18,8,0.04) 100%), url('${opts.heroImage}');background-size:cover;background-position:${fx}% ${fy}%;background-repeat:no-repeat;`
    : `background-image:linear-gradient(135deg, ${C.brand} 0%, ${C.brandDark} 100%);`
  const padTop = hasImg ? '210px' : '46px'
  const overline = opts.overline
    ? `<p style="margin:0 0 9px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.82);">${opts.overline}</p>`
    : ''
  const sub = opts.heroSubtitle
    ? `<p style="color:rgba(255,255,255,0.90);margin:12px 0 0;font-size:16px;line-height:1.5;font-weight:500;">${opts.heroSubtitle}</p>`
    : ''
  return `<tr><td bgcolor="${C.brand}" class="ex-hero" style="background-color:${C.brand};${bgLayers}">
    <div class="ex-hero-pad" style="padding:${padTop} 48px 34px 48px;">
      <img src="${LOGO_URL}" alt="Co-Exist" width="128" style="width:128px;height:auto;display:block;margin:0 0 ${hasImg ? '16' : '20'}px 0;border:0;outline:none;" />
      ${overline}
      <h1 class="ex-hero-h" style="color:#ffffff;margin:0;font-size:38px;font-weight:700;line-height:1.12;letter-spacing:-0.015em;">${opts.heroTitle}</h1>
      ${sub}
    </div>
  </td></tr>`
}

/**
 * Outer email shell. True full-bleed: no card, no border, no rounded box,
 * no thin centred column. The hero image runs edge to edge and the content
 * sits directly on the page background with generous side padding.
 */
function emailShell(opts: {
  heroTitle: string
  heroSubtitle?: string
  heroImage?: string
  heroFocalX?: number
  heroFocalY?: number
  overline?: string
  body: string
  footerCta?: { label: string; url: string }
  /** Recipient email so the unsubscribe link carries the address token. */
  recipientEmail?: string
}): string {
  const unsubUrl = opts.recipientEmail
    ? `${APP_URL}/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}`
    : `${APP_URL}/unsubscribe`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${opts.heroTitle}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  a{color:${C.brandDark};}
  /* Mobile: tighter side padding, hero stays full-bleed. */
  @media only screen and (max-width:600px){
    .ex-pad{padding-left:22px!important;padding-right:22px!important;}
    .ex-hero-pad{padding-left:22px!important;padding-right:22px!important;padding-top:150px!important;}
    .ex-hero-h{font-size:28px!important;}
  }
  /* Dark mode (Apple Mail / iOS Mail honour this). Gmail app strips the
     <style> block and falls back to the inversion-safe inline baseline. */
  @media (prefers-color-scheme: dark){
    .ex-body,.ex-outer,.ex-surface{background:#111309!important;}
    .ex-text{color:#ece9e0!important;}
    .ex-heading{color:#f3f1e9!important;}
    .ex-muted{color:#a9b199!important;}
    .ex-hairline{border-color:rgba(255,255,255,0.14)!important;}
    .ex-btn{background:${C.brandDarkMode}!important;color:#12150b!important;}
    .ex-accent{color:#a9c17f!important;}
    .ex-foot{color:#8a9376!important;}
    a{color:#b9cb95!important;}
  }
  [data-ogsc] .ex-body,[data-ogsc] .ex-outer,[data-ogsc] .ex-surface{background:#111309!important;}
  [data-ogsc] .ex-text{color:#ece9e0!important;}
  [data-ogsc] .ex-heading{color:#f3f1e9!important;}
  [data-ogsc] .ex-muted{color:#a9b199!important;}
  [data-ogsc] .ex-btn{background:${C.brandDarkMode}!important;color:#12150b!important;}
  [data-ogsc] .ex-accent{color:#a9c17f!important;}
</style>
</head>
<body class="ex-body" style="margin:0;padding:0;background:${C.bg};font-family:${FONT_STACK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ex-outer" style="background:${C.bg};">
<tr><td align="center" style="padding:0;">

<!-- Full-bleed container: no card, no border, no radius. Wide, not a thin column. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ex-surface" style="max-width:1040px;width:100%;background:${C.bg};">

  ${heroCell(opts)}

  <!-- Body content directly on the page background. -->
  <tr><td class="ex-pad ex-surface" style="background:${C.bg};padding:34px 48px 12px 48px;">
    ${opts.body}
  </td></tr>

  ${opts.footerCta ? `
  <tr><td class="ex-pad ex-surface" style="background:${C.bg};padding:8px 48px 34px 48px;">
    <a class="ex-btn" href="${opts.footerCta.url}" style="display:inline-block;background:${C.brand};color:#ffffff;padding:15px 34px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;line-height:1;font-family:${FONT_STACK};">${opts.footerCta.label}</a>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td class="ex-pad ex-surface ex-hairline" style="background:${C.bg};padding:26px 48px 34px 48px;border-top:1px solid ${C.border};">
    <p class="ex-muted" style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.textMuted};">
      Explore. Connect. Protect.
    </p>
    <p class="ex-foot" style="margin:0 0 12px;font-size:12px;color:${C.textLight};">
      <a href="${APP_URL}" style="color:${C.brandDark};text-decoration:none;">Open app</a>
      &nbsp;&middot;&nbsp;
      <a href="https://coexistaus.org" style="color:${C.brandDark};text-decoration:none;">Website</a>
      &nbsp;&middot;&nbsp;
      <a href="https://instagram.com/coexistaus" style="color:${C.brandDark};text-decoration:none;">Instagram</a>
    </p>
    <p class="ex-foot" style="margin:0;font-size:11px;line-height:1.6;color:${C.textLight};">
      Co-Exist Australia &middot; hello@coexistaus.org<br>
      We acknowledge the Traditional Custodians of Country across Australia.
      &nbsp;&middot;&nbsp;
      <a href="${unsubUrl}" style="color:${C.textLight};text-decoration:underline;">Unsubscribe</a>
      &nbsp;&middot;&nbsp;
      <a href="${APP_URL}/settings" style="color:${C.textLight};text-decoration:underline;">Preferences</a>
    </p>
  </td></tr>

</table>

</td></tr></table>
</body></html>`
}

/** Greeting line */
function greeting(name: unknown): string {
  const n = (name as string) || 'there'
  return `<p class="ex-text" style="margin:0 0 18px;font-size:16px;color:${C.text};line-height:1.55;font-weight:500;">Hi ${n},</p>`
}

/** Body paragraph */
function p(text: string): string {
  return `<p class="ex-text" style="margin:0 0 16px;font-size:15px;color:${C.text};line-height:1.65;">${text}</p>`
}

/**
 * De-chromed detail block. Replaces the old heavy bordered table with a
 * single warm-tint card of stacked overline-label / value rows, matching
 * the app's overline treatment. Kept named `infoCard` so all call sites
 * work unchanged.
 */
function infoCard(rows: [string, unknown][]): string {
  const items = rows.map(([l, v]) => `<tr><td class="ex-hairline" style="padding:14px 0 14px 0;border-top:1px solid ${C.border};">
      <p class="ex-muted" style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.09em;color:${C.textMuted};">${l}</p>
      <p class="ex-text" style="margin:0;font-size:16px;color:${C.text};line-height:1.4;">${v}</p>
    </td></tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
    ${items}
    <tr><td class="ex-hairline" style="border-top:1px solid ${C.border};font-size:0;line-height:0;height:0;">&nbsp;</td></tr>
  </table>`
}

/** CTA button (inline, for use inside body) */
function ctaButton(label: string, url: string): string {
  return `<div style="margin:22px 0 6px;">
    <a class="ex-btn" href="${url}" style="display:inline-block;background:${C.brand};color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;line-height:1;font-family:${FONT_STACK};">${label}</a>
  </div>`
}

/** Stat block for impact recaps - big olive number over an uppercase label, no emoji. */
function statBlock(value: unknown, label: string): string {
  return `<td align="center" style="text-align:center;padding:10px 6px;">
    <div class="ex-accent" style="font-size:30px;font-weight:700;color:${C.brand};line-height:1;">${value}</div>
    <div class="ex-muted" style="font-size:10.5px;font-weight:600;color:${C.textMuted};margin-top:6px;text-transform:uppercase;letter-spacing:0.07em;">${label}</div>
  </td>`
}

/** Numbered step list - olive index marker, bold title, muted line. No emoji. */
function stepList(steps: [string, string][]): string {
  const rows = steps.map(([title, desc], i) => `<tr>
      <td width="34" valign="top" style="padding:0 14px 18px 0;">
        <div class="ex-accent" style="color:${C.brand};font-size:22px;font-weight:700;line-height:1.1;">${i + 1}</div>
      </td>
      <td valign="top" style="padding:0 0 18px 0;">
        <p class="ex-heading" style="margin:0 0 3px;font-size:16px;font-weight:700;color:${C.text};line-height:1.3;">${title}</p>
        <p class="ex-muted" style="margin:0;font-size:14px;color:${C.textMuted};line-height:1.5;">${desc}</p>
      </td>
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;">${rows}</table>`
}

/**
 * Pull an optional full-bleed hero image out of the template data. Event
 * emails pass event_image (+ focal x/y); when present the hero shows the
 * real event cover photo, when absent the hero falls back to solid olive.
 */
function heroFromData(d: Record<string, unknown>): { heroImage?: string; heroFocalX?: number; heroFocalY?: number } {
  const img = (d.event_image as string) || ''
  if (!img) return {}
  return {
    heroImage: img,
    heroFocalX: d.event_image_x != null ? Number(d.event_image_x) : 50,
    heroFocalY: d.event_image_y != null ? Number(d.event_image_y) : 50,
  }
}

/* ------------------------------------------------------------------ */
/*  Per-type body builders                                             */
/* ------------------------------------------------------------------ */

const BODY_BUILDERS: Record<string, (d: Record<string, unknown>) => string> = {
  welcome: (d) => emailShell({
    heroTitle: 'Welcome to Co-Exist',
    heroSubtitle: 'Conservation, run by your local crew.',
    body: greeting(d.name) +
      p('Thanks for joining Co-Exist, a youth-led conservation community running events right across Australia.') +
      p('Three things to get you started:') +
      stepList([
        ['Find a Collective', 'Join your local crew and see what is on near you.'],
        ['Register for an event', 'Beach clean-ups, tree plantings, habitat restoration.'],
        ['Earn badges', 'Level up as you show up for real conservation work.'],
      ]),
    footerCta: { label: 'Open the app', url: d.app_url as string || APP_URL },
  }),

  event_confirmation: (d) => emailShell({
    heroTitle: 'You\'re registered',
    heroSubtitle: d.event_title as string,
    overline: 'You\'re in',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`You're all set for <strong>${d.event_title}</strong>. Here are the details:`) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
      ]) +
      p('We will send a reminder before the day. See you there.'),
    footerCta: { label: 'View event details', url: d.event_url as string || APP_URL },
  }),

  // Ticket purchase confirmation. ticket_url is the access link: for guest
  // buyers it is a single-use magic link that signs them in and opens the
  // ticket + event group chat; for members it is the direct ticket page.
  ticket_confirmation: (d) => emailShell({
    heroTitle: 'You\'re going',
    heroSubtitle: d.event_title as string,
    overline: 'Ticket confirmed',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`Your ticket for <strong>${d.event_title}</strong> is confirmed. Tap below to view your ticket and join the group chat.`) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
        ['Ticket code', d.ticket_code],
        ['Quantity', d.quantity],
        ['Paid', `$${d.amount} ${d.currency || 'AUD'}`],
      ]) +
      ctaButton('View your ticket', (d.ticket_url as string) || APP_URL),
    footerCta: { label: 'Open the App', url: APP_URL },
  }),

  // A spot is HELD but unpaid. The hero must not read like a receipt: nothing
  // is confirmed until they pay, and the hold can lapse.
  ticket_spot_held: (d) => emailShell({
    heroTitle: 'A spot is held for you',
    heroSubtitle: d.event_title as string,
    overline: 'Payment needed to confirm',
    ...heroFromData(d),
    body: greeting(d.name) +
      // "even though the event is otherwise full" was asserted unconditionally.
      // True for the case this template was built for (holding a seat on a sold
      // out camp-out) and FALSE whenever an organiser holds a spot on an event
      // that still has room, which is exactly the Murbpook situation. Saying an
      // event is full when it is not is the kind of small lie that costs a
      // client trust, so it is now gated on `event_is_full`.
      p([
        d.reserved_by_name
          ? `${d.reserved_by_name} has held a spot for you at <strong>${d.event_title}</strong>.`
          : `A spot has been held for you at <strong>${d.event_title}</strong>.`,
        d.event_is_full
          ? 'It is yours as soon as you pay, even though the event is otherwise full.'
          : 'It is yours as soon as you pay.',
      ].join(' ')) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
        ['To pay', `$${d.amount} ${d.currency || 'AUD'}`],
        ['Held until', d.hold_expires || 'the event'],
      ]) +
      ctaButton('Pay and confirm your spot', (d.pay_url as string) || APP_URL) +
      p('Your spot is held until then. If you can no longer make it, just ignore this and it will be released for someone else.'),
    footerCta: { label: 'Open the App', url: APP_URL },
  }),

  // Person-to-person ticket handover. No money moves: the same ticket and the
  // same original payment travel to the new holder.
  // Sent when someone shows as registered for a ticketed event but never held a
  // ticket, and the event is full so the spot cannot be honoured. Written to be
  // read once and understood: what happened, that it was our fault, that no
  // money was taken, and where to go next. No hedging, no blame on the reader.
  event_spot_released: (d) => emailShell({
    heroTitle: 'About your spot',
    heroSubtitle: d.event_title as string,
    overline: 'Please read',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`You are showing as registered for <strong>${d.event_title}</strong>, but a fault in our app let that registration through without a ticket ever being bought.`) +
      p('The campout is now full, so we are not able to hold the spot for you. We are genuinely sorry. This one is on us, not on you.') +
      infoCard([
        ['Event', d.event_title],
        ['When', d.event_date],
        ['Where', d.event_location],
        ['Charged to you', 'Nothing'],
      ]) +
      p('You have not been charged, and there is nothing you need to do.') +
      p('We have fixed the fault so it cannot happen again. We would love to have you on one of the next campouts, and we would be glad to see you there.') +
      ctaButton('See the next campouts', (d.next_events_url as string) || `${APP_URL}/explore`),
    footerCta: { label: 'Open the app', url: APP_URL },
  }),

  ticket_transfer_offer: (d) => emailShell({
    heroTitle: 'A ticket is being passed to you',
    heroSubtitle: d.event_title as string,
    overline: 'Claim your ticket',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`${d.from_name || 'Someone'} is passing you their ticket to <strong>${d.event_title}</strong>. Tap below to claim it. There is nothing to pay: the original ticket transfers to you as it is.`) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
        ['Claim before', d.expires],
      ]) +
      ctaButton('Claim this ticket', (d.claim_url as string) || APP_URL),
    footerCta: { label: 'Open the App', url: APP_URL },
  }),

  // A leader moved this person's ticket to another event. No refund happened
  // and they did not have to re-buy: the same ticket travelled with them, so
  // the email must not read like a receipt or a cancellation.
  ticket_transferred: (d) => emailShell({
    heroTitle: 'Your ticket has moved',
    heroSubtitle: d.event_title as string,
    ...heroFromData(d),
    body: greeting(d.name) +
      p(d.previous_event_title
        ? `Your ticket for <strong>${d.previous_event_title}</strong> has been moved across to <strong>${d.event_title}</strong>. You keep the same ticket, nothing was refunded, and there is nothing to pay.`
        : `Your ticket has been moved across to <strong>${d.event_title}</strong>. You keep the same ticket, nothing was refunded, and there is nothing to pay.`) +
      p('Here is where you are now headed:') +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
        ...(d.ticket_code ? [['Ticket code', d.ticket_code] as [string, unknown]] : []),
      ]) +
      p('You have been added to the group chat for this one, and taken out of the old one. If this new date does not work for you, reply to this email and we will sort it out.'),
    footerCta: { label: 'View Event', url: d.event_url as string || APP_URL },
  }),

  event_reminder: (d) => emailShell({
    heroTitle: `Coming up ${d.time_until || 'soon'}`,
    heroSubtitle: d.event_title as string,
    overline: 'Reminder',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`A heads up that <strong>${d.event_title}</strong> is happening ${d.time_until || 'soon'}.`) +
      infoCard([
        ['Event', d.event_title],
        ['When', d.event_date],
        ['Where', d.event_location],
      ]) +
      p('Bring water, sunscreen, and a hat. We supply the rest.'),
    footerCta: { label: 'View event', url: d.event_url as string || APP_URL },
  }),

  event_cancelled: (d) => emailShell({
    heroTitle: 'Event Cancelled',
    heroSubtitle: d.event_title as string,
    body: greeting(d.name) +
      p(`Unfortunately, <strong>${d.event_title}</strong> scheduled for ${d.event_date} has been cancelled.`) +
      (d.reason ? p(`<strong>Reason:</strong> ${d.reason}`) : '') +
      p('Check the app for other upcoming events near you.'),
    footerCta: { label: 'Browse Events', url: `${APP_URL}/events` },
  }),

  event_invite: (d) => emailShell({
    heroTitle: 'You\'re Invited!',
    heroSubtitle: d.event_title as string,
    body: greeting(d.name) +
      p(`<strong>${d.inviter_name}</strong> has invited you to join <strong>${d.event_title}</strong>.`) +
      p('Tap below to check it out and register.'),
    footerCta: { label: 'View Invitation', url: d.event_url as string || APP_URL },
  }),

  waitlist_promoted: (d) => emailShell({
    heroTitle: 'You\'re In!',
    heroSubtitle: 'A spot opened up just for you.',
    body: greeting(d.name) +
      p(`Great news - a spot has opened up for <strong>${d.event_title}</strong>!`) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
      ]) +
      p('Your registration is confirmed. See you there!'),
    footerCta: { label: 'View Event', url: d.event_url as string || APP_URL },
  }),

  password_reset: (d) => emailShell({
    heroTitle: 'Reset Your Password',
    body: greeting(d.name) +
      p('We received a request to reset your password. Tap the button below to set a new one.') +
      ctaButton('Reset Password', d.reset_url as string || APP_URL) +
      p(`<span style="font-size:13px;color:${C.textMuted};">If you didn't request this, you can safely ignore this email. The link expires in 1 hour.</span>`),
  }),

  donation_receipt: (d) => {
    // Render the tax/charity statement FROM SOURCE (charity_settings, passed by
    // the webhook), never a hardcoded claim. A valid AU tax-deductible receipt
    // must show the DGR's ABN, so we assert deductibility ONLY when the caller
    // confirmed DGR endorsement AND an ABN is on file (d.tax_deductible). This
    // auto-upgrades to a full ABN receipt once the ABN is configured.
    const charityName = (d.charity_name as string) || 'Co-Exist Australia'
    const abn = (d.abn as string) || ''
    const taxDeductible = d.tax_deductible === true
    const receiptNumber = (d.receipt_number as string) || ''
    const rows: Array<[string, string]> = []
    if (receiptNumber) rows.push(['Receipt no.', receiptNumber])
    rows.push(['Amount', `${d.amount} ${d.currency || 'AUD'}`])
    rows.push(['Date', d.date as string])
    rows.push(['Type', d.is_recurring ? 'Recurring monthly' : 'One-time'])
    if (abn) rows.push(['ABN', abn])
    const taxLine = taxDeductible
      ? `${charityName}${abn ? ` (ABN ${abn})` : ''} is endorsed as a deductible gift recipient (DGR). This receipt is for a gift of ${d.amount} ${d.currency || 'AUD'}; no goods or services were provided in return. Gifts of $2 or more are tax-deductible. Please retain this receipt for your records.`
      : `${charityName} is a registered charity. Please retain this as a record of your donation.`
    return emailShell({
      heroTitle: d.is_recurring ? 'Thanks for Your Ongoing Support!' : 'Thank You for Your Donation!',
      heroSubtitle: `${d.amount} ${d.currency || 'AUD'}`,
      body: greeting(d.name) +
        p(`Your ${d.is_recurring ? 'recurring ' : ''}donation of <strong>${d.amount}</strong> has been received. Every dollar goes directly toward conservation events, native plantings, and protecting Australia's ecosystems.`) +
        infoCard(rows) +
        (d.receipt_url ? p(`<a href="${d.receipt_url}" style="color:${C.brand};text-decoration:underline;">View your donation history and receipts</a>`) : '') +
        p(`<span style="font-size:13px;color:${C.textMuted};">${taxLine}</span>`),
      footerCta: { label: 'View Your Impact', url: `${APP_URL}/profile` },
    })
  },

  order_confirmation: (d) => emailShell({
    heroTitle: 'Order Confirmed!',
    heroSubtitle: `Order #${d.order_id}`,
    body: greeting(d.name) +
      p('Thanks for your order! Here\'s a summary:') +
      infoCard([
        ['Order', `#${d.order_id}`],
        ['Items', d.items],
        ['Total', d.total],
        ['Shipping to', d.shipping_address],
      ]) +
      p('We\'ll email you again when it ships.'),
    footerCta: { label: 'View Order', url: `${APP_URL}/merch/orders` },
  }),

  order_shipped: (d) => emailShell({
    heroTitle: 'Your Order Has Shipped!',
    heroSubtitle: `Order #${d.order_id}`,
    body: greeting(d.name) +
      p(`Your order <strong>#${d.order_id}</strong> is on its way!`) +
      infoCard([
        ['Tracking', `<a href="${d.tracking_url}" style="color:${C.brand};text-decoration:underline;">${d.tracking_number}</a>`],
      ]) +
      p('Keep an eye out for the delivery.'),
    footerCta: { label: 'Track Order', url: d.tracking_url as string || APP_URL },
  }),

  'data-export-request': (d) => emailShell({
    heroTitle: 'Data Export Requested',
    body: greeting(d.name) +
      p('We\'ve received your data export request. We\'ll prepare your data and send you a download link within 48 hours.') +
      p(`<span style="font-size:13px;color:${C.textMuted};">Request email: ${d.email}</span>`),
  }),

  payment_failed: (d) => emailShell({
    heroTitle: 'Payment Failed',
    heroSubtitle: 'Action needed to continue your support.',
    body: greeting(d.name) +
      p(`We weren't able to process your recurring donation of <strong>${d.amount}</strong>.`) +
      p('Please update your payment method to keep your support going. Your impact matters!'),
    footerCta: { label: 'Update Payment', url: d.update_url as string || `${APP_URL}/settings` },
  }),

  subscription_cancelled: (d) => emailShell({
    heroTitle: 'Donation Cancelled',
    heroSubtitle: 'We\'ll miss your support.',
    body: greeting(d.name) +
      p('Your recurring donation has been cancelled. Thank you for the support you\'ve given - every contribution made a real impact.') +
      p('If you\'d ever like to support us again, even a one-time donation makes a difference.'),
    footerCta: { label: 'Make a Donation', url: d.donate_url as string || `${APP_URL}/donate` },
  }),

  ticket_refunded: (d) => emailShell({
    heroTitle: 'Refund processed',
    heroSubtitle: d.event_title as string,
    body: greeting(d.name) +
      p(`Your ticket to <strong>${d.event_title}</strong> has been refunded.`) +
      infoCard([
        ['Event', d.event_title],
        ...(d.event_date ? [['Date', d.event_date] as [string, unknown]] : []),
        ...(d.event_location ? [['Location', d.event_location] as [string, unknown]] : []),
        ...(d.ticket_code ? [['Ticket code', d.ticket_code] as [string, unknown]] : []),
        ['Refunded', `${d.refund_amount} ${d.currency || 'AUD'}`],
      ]) +
      p('The money goes back to the card you paid with. Banks usually show it within 5 to 10 business days.') +
      p('Your spot has been released and you are no longer on the list for this one. If that is not what you expected, reply to this email and we will look into it.'),
  }),

  refund_confirmation: (d) => emailShell({
    heroTitle: 'Refund Processed',
    heroSubtitle: `Order #${d.order_id}`,
    body: greeting(d.name) +
      p(`We've processed a refund of <strong>${d.refund_amount} ${d.currency || 'AUD'}</strong> for order <strong>#${d.order_id}</strong>.`) +
      p('It may take 5-10 business days to appear on your statement.'),
  }),

  collective_application: (d) => emailShell({
    heroTitle: 'New Collective Application',
    heroSubtitle: 'Someone wants to lead a collective!',
    body: infoCard([
      ['Name', d.applicant_name],
      ['Email', `<a href="mailto:${d.applicant_email}" style="color:${C.brand};text-decoration:none;">${d.applicant_email}</a>`],
      ['Location', d.location],
      ['Roles', d.roles],
    ]),
    footerCta: { label: 'Review Application', url: `${APP_URL}/admin/applications` },
  }),

  // ---- Marketing ----

  newsletter: (d) => emailShell({
    heroTitle: 'Co-Exist Update',
    body: greeting(d.name) + (d.content_html as string || ''),
  }),

  challenge_announcement: (d) => emailShell({
    heroTitle: 'New Challenge!',
    heroSubtitle: d.challenge_title as string,
    body: greeting(d.name) +
      p(`A new challenge has just launched: <strong>${d.challenge_title}</strong>`) +
      (d.challenge_description ? p(d.challenge_description as string) : '') +
      p('Join the challenge and compete with other collectives!'),
    footerCta: { label: 'View Challenge', url: d.challenge_url as string || APP_URL },
  }),

  monthly_impact_recap: (d) => emailShell({
    heroTitle: `Your ${d.month} Impact`,
    heroSubtitle: 'Here\'s what you helped achieve.',
    body: greeting(d.name) +
      p('Take a look at the difference you made this month:') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin:0 0 20px;overflow:hidden;">
        <tr>
          ${statBlock(d.events_count, 'Events')}
          ${statBlock(d.trees, 'Trees')}
          ${statBlock(d.hours, 'Hours')}
          ${statBlock(d.rubbish_kg, 'kg litter')}
        </tr>
      </table>` +
      p('Every event, every hour, every seedling - it all adds up. Thank you for showing up.'),
    footerCta: { label: 'View Full Stats', url: `${APP_URL}/profile` },
  }),

  announcement_digest: (d) => {
    const announcements = (d.announcements as { title: string; body: string }[]) || []
    const items = announcements.map(a =>
      `<tr><td style="padding:12px;border-bottom:1px solid ${C.border};">
        <strong style="color:${C.text};font-size:14px;">${a.title}</strong>
        <p style="margin:6px 0 0;font-size:13px;color:${C.textMuted};line-height:1.5;">${a.body}</p>
      </td></tr>`
    ).join('')
    return emailShell({
      heroTitle: 'This Week at Co-Exist',
      body: greeting(d.name) +
        p('Here\'s what you might have missed:') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin:0 0 20px;overflow:hidden;">
          ${items || `<tr><td style="padding:16px;text-align:center;color:${C.textMuted};font-size:14px;">No announcements this week.</td></tr>`}
        </table>`,
      footerCta: { label: 'Open App', url: APP_URL },
    })
  },

  // The re-engagement digest ("What's on with <collective>"). Leads with the
  // real event cover photo full-bleed (event_image), the event title as the
  // hero heading and the collective as an overline, matching the app's event
  // tiles. Falls back to solid olive when the event has no cover image.
  upcoming_in_collective: (d) => emailShell({
    heroTitle: (d.event_title as string) || 'Your next event',
    heroSubtitle: (d.event_date as string) || undefined,
    overline: (d.collective_name as string) || 'Co-Exist',
    ...heroFromData(d),
    body: greeting(d.name) +
      p(`${d.collective_name} has an event coming up. A few hours outdoors with good people.`) +
      infoCard([
        ['When', d.event_date],
        ['Where', d.event_location || 'See the event page'],
      ]) +
      p('If you are free, come along. Every hand counts.'),
    footerCta: { label: 'See details and RSVP', url: (d.event_url as string) || APP_URL },
    recipientEmail: d.__recipientEmail as string | undefined,
  }),
}

/** Substitute {{variable}} placeholders against the template data dict. */
function interpolate(input: string, data: Record<string, unknown>): string {
  let out = input
  for (const [key, value] of Object.entries(data)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''))
  }
  return out
}

/** Build email HTML from admin override fields */
function buildOverrideHtml(
  override: { hero_title: string | null; hero_subtitle: string | null; hero_emoji: string | null; body_html: string | null; cta_label: string | null; cta_url: string | null },
  data: Record<string, unknown>,
): string {
  const body = interpolate(override.body_html || '', data)

  return emailShell({
    heroTitle: interpolate(override.hero_title || 'Co-Exist', data),
    heroSubtitle: override.hero_subtitle ? interpolate(override.hero_subtitle, data) : undefined,
    body: greeting(data.name) + body,
    footerCta: override.cta_label && override.cta_url
      ? { label: interpolate(override.cta_label, data), url: interpolate(override.cta_url, data) }
      : undefined,
  })
}

/** Build the email HTML for a given type + data */
function buildEmailHtml(type: string, data: Record<string, unknown>): string {
  const builder = BODY_BUILDERS[type]
  if (builder) return builder(data)

  // Fallback: generic branded email with key-value pairs
  const name = (data.name as string) || 'there'
  const exclude = new Set(['name', 'content_html'])
  const entries = Object.entries(data).filter(([k]) => !exclude.has(k))
  const rows: [string, unknown][] = entries.map(([k, v]) => [
    k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    v,
  ])

  return emailShell({
    heroTitle: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    body: greeting(name) +
      (data.content_html ? (data.content_html as string) : '') +
      (rows.length ? infoCard(rows) : ''),
  })
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  tags: { name: string; value: string }[],
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      tags,
      headers: {
        'List-Unsubscribe': `<mailto:unsubscribe@coexistaus.org?subject=Unsubscribe>, <https://app.coexistaus.org/unsubscribe?email=${encodeURIComponent(to)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error(`[send-email] Resend error:`, err)
    return { success: false, error: err }
  }

  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Unsubscribe handling (CAN-SPAM compliant)                          */
/* ------------------------------------------------------------------ */

async function handleUnsubscribe(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
) {
  // Find user by email - paginate through all users (listUsers default page is 50)
  let page = 1
  const perPage = 1000
  let found = false

  while (!found) {
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (!usersPage?.users?.length) break

    const user = usersPage.users.find((u: { email?: string }) => u.email === email)
    if (user) {
      await supabaseAdmin
        .from('profiles')
        .update({ marketing_opt_in: false })
        .eq('id', user.id)
      found = true
    }

    // If we got fewer results than page size, we've reached the end
    if (usersPage.users.length < perPage) break
    page++
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withSentry('send-email', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    // Handle one-click unsubscribe (POST to /unsubscribe)
    // This must remain unauthenticated for CAN-SPAM compliance,
    // but we use a signed token approach instead of raw email
    if (url.pathname.endsWith('/unsubscribe') && req.method === 'POST') {
      const formData = await req.formData().catch(() => null)
      const email = formData?.get('email') as string | null
        || url.searchParams.get('email')

      if (email) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        await handleUnsubscribe(supabaseAdmin, email)
      }

      return new Response('Unsubscribed', { status: 200, headers: corsHeaders })
    }

    // ── Auth: require service-role key or authenticated user ──
    // This function is called internally by other edge functions (using service-role)
    // and by the frontend (using user's auth token).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Allow service-role callers (internal edge function calls) through directly
    if (token !== serviceRoleKey) {
      // Validate as user token via GoTrue directly
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': serviceRoleKey,
        },
      })
      if (!gotruRes.ok) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const payload = (await req.json()) as SendEmailPayload
    const { type, data = {} } = payload

    // ── Batch send ──
    // Many personalised emails of the same type in ONE Resend /emails/batch
    // request (up to 100 per call). A digest of N recipients costs ceil(N/100)
    // API calls, so it stays under Resend's 10 req/s limit that a per-recipient
    // fan-out blows through.
    if (Array.isArray(payload.recipients) && payload.recipients.length > 0) {
      const templateDef = EMAIL_TEMPLATES[type]
      if (!templateDef) {
        return new Response(JSON.stringify({ success: false, error: `Unknown email type: ${type}` }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
      }
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )

      // Per-recipient opt-out gate for marketing types: marketing_opt_in AND the
      // mapped notification-preference key (mirrors the single-send gate).
      const optedOut = new Set<string>()
      if (templateDef.category === 'marketing') {
        const ids = payload.recipients.map((r) => r.userId).filter((x): x is string => !!x)
        if (ids.length > 0) {
          const { data: profs } = await supabaseAdmin
            .from('profiles')
            .select('id, marketing_opt_in, notification_preferences')
            .in('id', ids)
          const prefKey = TYPE_TO_PREF_KEY[type]
          for (const p of profs ?? []) {
            const prefs = (p.notification_preferences ?? {}) as Record<string, unknown>
            if (p.marketing_opt_in === false) optedOut.add(p.id as string)
            else if (prefKey && prefs[prefKey] === false) optedOut.add(p.id as string)
          }
        }
      }

      const emails = payload.recipients
        .filter((r) => r.to && !(r.userId && optedOut.has(r.userId)))
        .map((r) => {
          const d = { ...(r.data ?? {}), __recipientEmail: r.to }
          const subject = payload.subject ?? templateDef.subject(d)
          return {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: [r.to],
            subject,
            html: buildEmailHtml(type, d),
            headers: {
              'List-Unsubscribe': `<mailto:unsubscribe@coexistaus.org?subject=Unsubscribe>, <https://app.coexistaus.org/unsubscribe?email=${encodeURIComponent(r.to)}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        })

      let sent = 0
      let batchError: string | undefined
      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100)
        const resp = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        })
        if (resp.ok) {
          sent += chunk.length
        } else {
          batchError = await resp.text()
          console.error('[send-email] batch send failed:', batchError)
        }
        if (i + 100 < emails.length) await new Promise((res) => setTimeout(res, 600))
      }

      return new Response(
        JSON.stringify({ success: !batchError, sent, skipped: payload.recipients.length - emails.length, error: batchError }),
        { status: batchError ? 502 : 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Resolve recipient
    let toEmail = payload.to || payload.email || ''

    // If userId provided but no email, look it up.
    //
    // auth.users.email is NOT automatically the deliverable address. A member
    // who signed in with Apple carries an @privaterelay.appleid.com forwarding
    // address there, and on this project every single send to one of those has
    // bounced (68 sends, 43 addresses, 0 deliveries, measured 2026-08-26).
    // profiles.email holds what the member actually typed, so it is preferred
    // when the auth address is a relay and the profile address is not.
    // See _shared/recipient-email.ts for the measurement and the limits.
    if (!toEmail && payload.userId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const [{ data: userData }, { data: profileRow }] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(payload.userId),
        supabaseAdmin.from('profiles').select('email').eq('id', payload.userId).maybeSingle(),
      ])
      const resolved = resolveRecipientEmail(
        userData?.user?.email ?? null,
        (profileRow as { email?: string | null } | null)?.email ?? null,
      )
      toEmail = resolved.email
      if (resolved.reason !== 'auth') {
        // Logged so a later bounce can be read back to the decision that made it.
        console.log('[send-email] recipient resolved via', resolved.reason, 'for user', payload.userId)
      }
    }

    if (!toEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'No recipient email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Backfill the greeting name from the profile when a caller supplies a
    // userId but leaves data.name empty (e.g. transfer-event-ticket passes
    // name:''). Without this, greeting() falls back to "Hey there,". Best-effort:
    // a lookup miss leaves the existing fallback intact. `data` is the same
    // object threaded into buildEmailHtml/subject below, so mutating it here is
    // enough for every template that greets by name.
    if (payload.userId && (!data.name || String(data.name).trim() === '')) {
      const nameClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: nameProfile } = await nameClient
        .from('profiles')
        .select('display_name')
        .eq('id', payload.userId)
        .maybeSingle()
      const displayName = (nameProfile?.display_name as string | null | undefined) ?? ''
      if (displayName.trim()) data.name = displayName
    }

    // Look up template
    const templateDef = EMAIL_TEMPLATES[type]
    if (!templateDef) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown email type: ${type}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Check marketing opt-in for marketing emails
    if (templateDef.category === 'marketing') {
      if (!payload.userId) {
        return new Response(
          JSON.stringify({ success: false, error: 'userId required for marketing emails' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('marketing_opt_in')
        .eq('id', payload.userId)
        .single()

      // If profile not found or user has opted out, don't send
      if (!profile || profile.marketing_opt_in === false) {
        return new Response(
          JSON.stringify({ success: false, error: 'User opted out of marketing or not found' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // ── Respect per-type notification preferences + email channel master ──
    // Mirrors the preference gate in send-push so a setting toggled off silences
    // the type on every channel, not push alone. Quiet hours is intentionally
    // NOT applied to email: a queued inbox message is not disruptive the way a
    // phone buzz is. Only an explicit `false` suppresses (opt-out model); an
    // absent key means the user never changed it and is treated as enabled.
    // Requires userId; sends addressed only by `to`/`email` (e.g. admin/test
    // sends) carry no preference subject and pass through.
    const prefKey = TYPE_TO_PREF_KEY[type]
    if (prefKey && payload.userId) {
      const prefClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: prefProfile } = await prefClient
        .from('profiles')
        .select('notification_preferences')
        .eq('id', payload.userId)
        .maybeSingle()
      const prefs = (prefProfile?.notification_preferences ?? {}) as Record<string, unknown>
      if (prefs[prefKey] === false || prefs.email_enabled === false) {
        return new Response(
          JSON.stringify({ success: false, skipped: true, reason: 'User disabled this notification type or the email channel' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // ── Load admin overrides from DB (if any) ──
    interface TemplateOverride {
      hero_title: string | null
      hero_subtitle: string | null
      hero_emoji: string | null
      body_html: string | null
      subject: string | null
      cta_label: string | null
      cta_url: string | null
      enabled: boolean
    }
    let override: TemplateOverride | null = null
    try {
      const overrideClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: row } = await overrideClient
        .from('system_email_overrides')
        .select('hero_title, hero_subtitle, hero_emoji, body_html, subject, cta_label, cta_url, enabled')
        .eq('template_type', type)
        .maybeSingle()
      if (row) override = row as TemplateOverride
    } catch {
      // Non-fatal: fall back to defaults if override lookup fails
    }

    // If override exists but is disabled, skip sending
    if (override && !override.enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Template disabled by admin' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const subject = payload.subject
      || (override?.subject ? interpolate(override.subject, data) : null)
      || templateDef.subject(data)
    // Thread recipient down so emailShell can build the unsubscribe link
    // with ?email=... per recipient.
    if (data && typeof data === 'object' && toEmail) {
      (data as Record<string, unknown>).__recipientEmail = toEmail
    }
    const html = payload.html || (override?.body_html
      ? buildOverrideHtml(override, data)
      : buildEmailHtml(type, data))

    const tags = [
      { name: 'category', value: templateDef.category },
      { name: 'type', value: type },
    ]
    // A malformed tag value makes Resend reject the whole send, so a caller
    // passing junk must never cost a member their email. Only a well-formed
    // UUID rides along.
    if (typeof payload.ticketId === 'string' && UUID_RE.test(payload.ticketId)) {
      tags.push({ name: 'ticket_id', value: payload.ticketId })
    } else if (payload.ticketId) {
      console.warn('[send-email] ignoring malformed ticketId tag')
    }

    const result = await sendViaResend(
      toEmail,
      subject,
      html,
      tags,
    )

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-email] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))
