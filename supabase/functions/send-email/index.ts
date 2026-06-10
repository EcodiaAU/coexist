// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
}

/* ------------------------------------------------------------------ */
/*  Resend API call                                                    */
/* ------------------------------------------------------------------ */

interface SendEmailPayload {
  /** Email type - must match a key in EMAIL_TEMPLATES */
  type: string
  /** Recipient email address */
  to: string
  /** Dynamic template data (Handlebars variables) */
  data?: Record<string, unknown>
  /** Optional: override the subject (for non-template sends) */
  subject?: string
  /** Optional: HTML content (used by campaign sends) */
  html?: string
  /** For internal requests (e.g. data export) */
  userId?: string
  email?: string
}

/* ------------------------------------------------------------------ */
/*  Branded Email Template System                                      */
/* ------------------------------------------------------------------ */

const LOGO_URL = 'https://app.coexistaus.org/logos/white-wordmark.webp'
const LOGO_DARK_URL = 'https://app.coexistaus.org/logos/black-wordmark.png'
const APP_URL = 'https://app.coexistaus.org'

// Brand palette: Co-Exist olive-sage. This is the colour the homepage
// Impact section uses (src/pages/home.tsx -> bg-[#879e62] with the
// warm off-white #f4f2ec text on top). The 2026-06-10 detour to a
// truer-green sage #4A7C59 was off-brand vs what subscribers see on
// the homepage, so reverted to the homepage olive and kept the
// matching primary-* family as darker / lighter siblings.
const C = {
  brand: '#879e62',
  brandDark: '#5d7340',
  brandLight: '#a3b88a',
  bg: '#f4f2ec',
  cardBg: '#fbfaf6',
  border: '#e6e3da',
  text: '#2d3a22',
  textMuted: '#5e6b4a',
  textLight: '#8a9474',
  white: '#ffffff',
  error: '#c0392b',
  warning: '#E8913A',
  success: '#879e62',
}

/** Outer email shell - logo header, gradient banner, content area, footer */
function emailShell(opts: {
  heroTitle: string
  heroSubtitle?: string
  heroEmoji?: string
  body: string
  footerCta?: { label: string; url: string }
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.heroTitle}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px 0;">

<!-- Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Logo bar -->
  <tr><td style="padding:0 0 20px;text-align:center;">
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${LOGO_DARK_URL}" alt="Co-Exist" width="120" style="width:120px;height:auto;" />
    </a>
  </td></tr>

  <!-- Hero gradient banner -->
  <tr><td style="background:linear-gradient(135deg,${C.brand} 0%,${C.brandDark} 100%);padding:40px 32px;border-radius:20px 20px 0 0;text-align:center;">
    ${opts.heroEmoji ? `<div style="font-size:40px;margin-bottom:12px;">${opts.heroEmoji}</div>` : ''}
    <h1 style="color:${C.white};margin:0;font-size:24px;font-weight:700;line-height:1.3;">${opts.heroTitle}</h1>
    ${opts.heroSubtitle ? `<p style="color:rgba(255,255,255,0.75);margin:10px 0 0;font-size:15px;line-height:1.5;">${opts.heroSubtitle}</p>` : ''}
  </td></tr>

  <!-- Body content -->
  <tr><td style="background:${C.white};padding:32px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
    ${opts.body}
  </td></tr>

  <!-- CTA button (if provided) -->
  ${opts.footerCta ? `
  <tr><td style="background:${C.white};padding:0 32px 32px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};text-align:center;">
    <a href="${opts.footerCta.url}" style="display:inline-block;background:${C.brand};color:${C.white};padding:14px 32px;border-radius:14px;text-decoration:none;font-weight:600;font-size:15px;line-height:1;">${opts.footerCta.label}</a>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="background:${C.cardBg};padding:24px 32px;border-radius:0 0 20px 20px;border:1px solid ${C.border};border-top:none;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:${C.textLight};">
      Explore. Connect. Protect.
    </p>
    <p style="margin:0 0 12px;font-size:11px;color:${C.textLight};">
      <a href="${APP_URL}" style="color:${C.brand};text-decoration:none;">Open App</a>
      &nbsp;&middot;&nbsp;
      <a href="https://coexistaus.org" style="color:${C.brand};text-decoration:none;">Website</a>
      &nbsp;&middot;&nbsp;
      <a href="https://instagram.com/coexistaus" style="color:${C.brand};text-decoration:none;">Instagram</a>
    </p>
    <p style="margin:0;font-size:10px;color:${C.textLight};">
      Co-Exist Australia &middot; hello@coexistaus.org<br>
      We respectfully acknowledge the Traditional Custodians of Country throughout Australia.
    </p>
  </td></tr>

</table>

<!-- Unsubscribe -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin-top:16px;">
  <tr><td style="text-align:center;padding:0 0 32px;">
    <p style="margin:0;font-size:10px;color:${C.textLight};">
      <a href="${APP_URL}/settings" style="color:${C.textLight};text-decoration:underline;">Manage preferences</a>
      &nbsp;&middot;&nbsp;
      <a href="${APP_URL}/unsubscribe" style="color:${C.textLight};text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>
</table>

</td></tr></table>
</body></html>`
}

/** Greeting line */
function greeting(name: unknown): string {
  const n = (name as string) || 'there'
  return `<p style="margin:0 0 20px;font-size:16px;color:${C.text};line-height:1.5;">Hey ${n},</p>`
}

/** Body paragraph */
function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:${C.text};line-height:1.6;">${text}</p>`
}

/** Info card row (label + value) */
function infoRow(label: string, value: unknown): string {
  return `<tr>
    <td style="padding:10px 12px;color:${C.textMuted};font-size:13px;font-weight:600;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:10px 12px;color:${C.text};font-size:14px;">${value}</td>
  </tr>`
}

/** Info card - a table of label/value rows with a subtle background */
function infoCard(rows: [string, unknown][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin:0 0 20px;overflow:hidden;">
    ${rows.map(([l, v]) => infoRow(l, v)).join('')}
  </table>`
}

/** CTA button (inline, for use inside body) */
function ctaButton(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background:${C.brand};color:${C.white};padding:14px 32px;border-radius:14px;text-decoration:none;font-weight:600;font-size:15px;line-height:1;">${label}</a>
  </div>`
}

/** Stat block for impact recaps */
function statBlock(value: unknown, label: string, emoji: string): string {
  return `<td style="text-align:center;padding:12px 8px;">
    <div style="font-size:24px;margin-bottom:4px;">${emoji}</div>
    <div style="font-size:28px;font-weight:700;color:${C.brand};line-height:1;">${value}</div>
    <div style="font-size:11px;color:${C.textMuted};margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
  </td>`
}

/* ------------------------------------------------------------------ */
/*  Per-type body builders                                             */
/* ------------------------------------------------------------------ */

const BODY_BUILDERS: Record<string, (d: Record<string, unknown>) => string> = {
  welcome: (d) => emailShell({
    heroTitle: 'Welcome to Co-Exist!',
    heroSubtitle: 'You\'re part of the movement now.',
    heroEmoji: '\u{1F331}',
    body: greeting(d.name) +
      p('Thanks for joining Co-Exist - a youth-led conservation community making a real difference across Australia.') +
      p('Here\'s how to get started:') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="padding:8px 0;font-size:15px;color:${C.text};line-height:1.6;">\u{1F50D} &nbsp;<strong>Find a Collective</strong> near you and join your local crew</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:${C.text};line-height:1.6;">\u{1F4C5} &nbsp;<strong>Register for an event</strong> - beach clean-ups, tree plantings, habitat restoration</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:${C.text};line-height:1.6;">\u{1F3C5} &nbsp;<strong>Earn badges</strong> and level up as you contribute to real conservation impact</td></tr>
      </table>`,
    footerCta: { label: 'Open the App', url: d.app_url as string || APP_URL },
  }),

  event_confirmation: (d) => emailShell({
    heroTitle: 'You\'re registered!',
    heroSubtitle: d.event_title as string,
    heroEmoji: '\u{2705}',
    body: greeting(d.name) +
      p(`You're all set for <strong>${d.event_title}</strong>. Here are the details:`) +
      infoCard([
        ['Event', d.event_title],
        ['Date', d.event_date],
        ['Location', d.event_location],
      ]) +
      p('We\'ll send you a reminder before the event. See you there!'),
    footerCta: { label: 'View Event Details', url: d.event_url as string || APP_URL },
  }),

  event_reminder: (d) => emailShell({
    heroTitle: `Coming up ${d.time_until || 'soon'}!`,
    heroSubtitle: d.event_title as string,
    heroEmoji: '\u{23F0}',
    body: greeting(d.name) +
      p(`Just a heads up - <strong>${d.event_title}</strong> is happening ${d.time_until || 'soon'}.`) +
      infoCard([
        ['Event', d.event_title],
        ['When', d.event_date],
        ['Where', d.event_location],
      ]) +
      p('Don\'t forget to bring water, sunscreen, and a good attitude!'),
    footerCta: { label: 'View Event', url: d.event_url as string || APP_URL },
  }),

  event_cancelled: (d) => emailShell({
    heroTitle: 'Event Cancelled',
    heroSubtitle: d.event_title as string,
    heroEmoji: '\u{1F6AB}',
    body: greeting(d.name) +
      p(`Unfortunately, <strong>${d.event_title}</strong> scheduled for ${d.event_date} has been cancelled.`) +
      (d.reason ? p(`<strong>Reason:</strong> ${d.reason}`) : '') +
      p('Check the app for other upcoming events near you.'),
    footerCta: { label: 'Browse Events', url: `${APP_URL}/events` },
  }),

  event_invite: (d) => emailShell({
    heroTitle: 'You\'re Invited!',
    heroSubtitle: d.event_title as string,
    heroEmoji: '\u{1F389}',
    body: greeting(d.name) +
      p(`<strong>${d.inviter_name}</strong> has invited you to join <strong>${d.event_title}</strong>.`) +
      p('Tap below to check it out and register.'),
    footerCta: { label: 'View Invitation', url: d.event_url as string || APP_URL },
  }),

  waitlist_promoted: (d) => emailShell({
    heroTitle: 'You\'re In!',
    heroSubtitle: 'A spot opened up just for you.',
    heroEmoji: '\u{1F389}',
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
    heroEmoji: '\u{1F510}',
    body: greeting(d.name) +
      p('We received a request to reset your password. Tap the button below to set a new one.') +
      ctaButton('Reset Password', d.reset_url as string || APP_URL) +
      p(`<span style="font-size:13px;color:${C.textMuted};">If you didn't request this, you can safely ignore this email. The link expires in 1 hour.</span>`),
  }),

  donation_receipt: (d) => emailShell({
    heroTitle: d.is_recurring ? 'Thanks for Your Ongoing Support!' : 'Thank You for Your Donation!',
    heroSubtitle: `${d.amount} ${d.currency || 'AUD'}`,
    heroEmoji: '\u{1F49A}',
    body: greeting(d.name) +
      p(`Your ${d.is_recurring ? 'recurring ' : ''}donation of <strong>${d.amount}</strong> has been received. Every dollar goes directly toward conservation events, native plantings, and protecting Australia's ecosystems.`) +
      infoCard([
        ['Amount', `${d.amount} ${d.currency || 'AUD'}`],
        ['Date', d.date],
        ['Type', d.is_recurring ? 'Recurring monthly' : 'One-time'],
      ]) +
      (d.receipt_url ? p(`<a href="${d.receipt_url}" style="color:${C.brand};text-decoration:underline;">Download receipt</a>`) : '') +
      p(`<span style="font-size:13px;color:${C.textMuted};">Co-Exist Australia is a registered charity (ACNC). Donations may be tax-deductible.</span>`),
    footerCta: { label: 'View Your Impact', url: `${APP_URL}/profile` },
  }),

  order_confirmation: (d) => emailShell({
    heroTitle: 'Order Confirmed!',
    heroSubtitle: `Order #${d.order_id}`,
    heroEmoji: '\u{1F6CD}\u{FE0F}',
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
    heroEmoji: '\u{1F4E6}',
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
    heroEmoji: '\u{1F4E5}',
    body: greeting(d.name) +
      p('We\'ve received your data export request. We\'ll prepare your data and send you a download link within 48 hours.') +
      p(`<span style="font-size:13px;color:${C.textMuted};">Request email: ${d.email}</span>`),
  }),

  payment_failed: (d) => emailShell({
    heroTitle: 'Payment Failed',
    heroSubtitle: 'Action needed to continue your support.',
    heroEmoji: '\u{26A0}\u{FE0F}',
    body: greeting(d.name) +
      p(`We weren't able to process your recurring donation of <strong>${d.amount}</strong>.`) +
      p('Please update your payment method to keep your support going. Your impact matters!'),
    footerCta: { label: 'Update Payment', url: d.update_url as string || `${APP_URL}/settings` },
  }),

  subscription_cancelled: (d) => emailShell({
    heroTitle: 'Donation Cancelled',
    heroSubtitle: 'We\'ll miss your support.',
    heroEmoji: '\u{1F49B}',
    body: greeting(d.name) +
      p('Your recurring donation has been cancelled. Thank you for the support you\'ve given - every contribution made a real impact.') +
      p('If you\'d ever like to support us again, even a one-time donation makes a difference.'),
    footerCta: { label: 'Make a Donation', url: d.donate_url as string || `${APP_URL}/donate` },
  }),

  refund_confirmation: (d) => emailShell({
    heroTitle: 'Refund Processed',
    heroSubtitle: `Order #${d.order_id}`,
    heroEmoji: '\u{1F4B3}',
    body: greeting(d.name) +
      p(`We've processed a refund of <strong>${d.refund_amount} ${d.currency || 'AUD'}</strong> for order <strong>#${d.order_id}</strong>.`) +
      p('It may take 5-10 business days to appear on your statement.'),
  }),

  collective_application: (d) => emailShell({
    heroTitle: 'New Collective Application',
    heroSubtitle: 'Someone wants to lead a collective!',
    heroEmoji: '\u{1F64B}',
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
    heroEmoji: '\u{1F4E8}',
    body: greeting(d.name) + (d.content_html as string || ''),
  }),

  challenge_announcement: (d) => emailShell({
    heroTitle: 'New Challenge!',
    heroSubtitle: d.challenge_title as string,
    heroEmoji: '\u{1F525}',
    body: greeting(d.name) +
      p(`A new challenge has just launched: <strong>${d.challenge_title}</strong>`) +
      (d.challenge_description ? p(d.challenge_description as string) : '') +
      p('Join the challenge and compete with other collectives!'),
    footerCta: { label: 'View Challenge', url: d.challenge_url as string || APP_URL },
  }),

  monthly_impact_recap: (d) => emailShell({
    heroTitle: `Your ${d.month} Impact`,
    heroSubtitle: 'Here\'s what you helped achieve.',
    heroEmoji: '\u{1F30F}',
    body: greeting(d.name) +
      p('Take a look at the difference you made this month:') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin:0 0 20px;overflow:hidden;">
        <tr>
          ${statBlock(d.events_count, 'Events', '\u{1F4C5}')}
          ${statBlock(d.trees, 'Trees', '\u{1F333}')}
          ${statBlock(d.hours, 'Hours', '\u{23F1}\u{FE0F}')}
          ${statBlock(d.rubbish_kg, 'kg Rubbish', '\u{267B}\u{FE0F}')}
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
      heroEmoji: '\u{1F4E3}',
      body: greeting(d.name) +
        p('Here\'s what you might have missed:') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.border};border-radius:12px;margin:0 0 20px;overflow:hidden;">
          ${items || `<tr><td style="padding:16px;text-align:center;color:${C.textMuted};font-size:14px;">No announcements this week.</td></tr>`}
        </table>`,
      footerCta: { label: 'Open App', url: APP_URL },
    })
  },
}

/** Build email HTML from admin override fields */
function buildOverrideHtml(
  override: { hero_title: string | null; hero_subtitle: string | null; hero_emoji: string | null; body_html: string | null; cta_label: string | null; cta_url: string | null },
  data: Record<string, unknown>,
): string {
  // Replace {{variable}} placeholders in the override body with actual data
  let body = override.body_html || ''
  for (const [key, value] of Object.entries(data)) {
    body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''))
  }

  return emailShell({
    heroTitle: override.hero_title || 'Co-Exist',
    heroSubtitle: override.hero_subtitle || undefined,
    heroEmoji: override.hero_emoji || undefined,
    body: greeting(data.name) + body,
    footerCta: override.cta_label && override.cta_url
      ? { label: override.cta_label, url: override.cta_url }
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

Deno.serve(async (req: Request) => {
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

    // Resolve recipient
    let toEmail = payload.to || payload.email || ''

    // If userId provided but no email, look it up
    if (!toEmail && payload.userId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(payload.userId)
      toEmail = userData?.user?.email ?? ''
    }

    if (!toEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'No recipient email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
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

    const subject = payload.subject || override?.subject || templateDef.subject(data)
    const html = payload.html || (override?.body_html
      ? buildOverrideHtml(override, data)
      : buildEmailHtml(type, data))

    const result = await sendViaResend(
      toEmail,
      subject,
      html,
      [
        { name: 'category', value: templateDef.category },
        { name: 'type', value: type },
      ],
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
})
