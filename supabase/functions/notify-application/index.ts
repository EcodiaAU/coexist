// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { resolveRecipientEmail } from '../_shared/recipient-email.ts'
import {
  isEmailSuppressed,
  makeSuppressionFetcher,
  type SuppressionFetcher,
  type SuppressionQueryable,
} from '../_shared/egress-suppression.ts'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotifyPayload {
  applicant_name: string
  applicant_email: string
  roles?: string[]
  suburb?: string
  state?: string
  /**
   * 'submitted' (default): applicant confirmation email + staff notify/push.
   * 'accepted'/'rejected': applicant decision email only (no staff fan-out).
   */
  kind?: 'submitted' | 'accepted' | 'rejected'
}

/* ------------------------------------------------------------------ */
/*  Role labels                                                        */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  social_media: 'Social Media & Content',
  collective_leader: 'Collective Leader',
  assistant_leader: 'Assistant Leader',
  other: 'Other',
}

/* ------------------------------------------------------------------ */
/*  Resend email                                                       */
/* ------------------------------------------------------------------ */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'hello@coexistaus.org'
const FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Co-Exist'

/* ------------------------------------------------------------------ */
/*  Dead-address gate (public.email_suppressions)                      */
/* ------------------------------------------------------------------ */

/**
 * Both senders below build their own `to` and POST Resend directly, so neither
 * inherits the gate in send-email. This function is what they share instead.
 *
 * It covers the staff notification as much as the applicant mail: a staff
 * address that hard-bounces keeps being retried on every application otherwise,
 * and the bounces land on the same sending domain that carries member mail.
 *
 * Fails CLOSED. A lookup error propagates, and the caller's existing try/catch
 * records a failed send rather than an unchecked one.
 * Audit and reasoning: _shared/egress-suppression.ts.
 */
let suppressionFetcher: SuppressionFetcher | null = null
async function isSuppressedAddress(toEmail: string): Promise<boolean> {
  if (!suppressionFetcher) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    suppressionFetcher = makeSuppressionFetcher(admin as unknown as SuppressionQueryable)
  }
  return await isEmailSuppressed(suppressionFetcher, toEmail)
}

async function sendEmailNotification(
  toEmail: string,
  applicantName: string,
  applicantEmail: string,
  roles: string[],
  location: string,
): Promise<boolean> {
  if (await isSuppressedAddress(toEmail)) {
    console.log('[notify-application] refused a suppressed staff address')
    return false
  }

  const roleList = roles.map(r => ROLE_LABELS[r] ?? r).join(', ')

  // Sanitise all user-supplied values before embedding in HTML
  const safeName = sanitizeHtml(applicantName)
  const safeEmail = sanitizeHtml(applicantEmail)
  const safeLocation = sanitizeHtml(location)
  const safeRoleList = sanitizeHtml(roleList)

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [toEmail],
      subject: `New Collective Application: ${safeName}`,
      html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #869e62 0%, #3d4d33 100%); padding: 32px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 22px;">New Collective Application</h1>
                <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">Someone wants to lead a collective!</p>
              </div>
              <div style="background: #f9faf7; padding: 24px; border-radius: 0 0 16px 16px; border: 1px solid #e8eddf;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7a5a; font-size: 13px; font-weight: 600;">Name</td>
                    <td style="padding: 8px 0; color: #2d3a22; font-size: 14px;">${safeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7a5a; font-size: 13px; font-weight: 600;">Email</td>
                    <td style="padding: 8px 0; color: #2d3a22; font-size: 14px;"><a href="mailto:${safeEmail}" style="color: #869e62;">${safeEmail}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7a5a; font-size: 13px; font-weight: 600;">Location</td>
                    <td style="padding: 8px 0; color: #2d3a22; font-size: 14px;">${safeLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7a5a; font-size: 13px; font-weight: 600;">Roles</td>
                    <td style="padding: 8px 0; color: #2d3a22; font-size: 14px;">${safeRoleList}</td>
                  </tr>
                </table>
                <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e8eddf;">
                  <a href="https://app.coexistaus.org/admin/applications" style="display: inline-block; background: #869e62; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    Review Application
                  </a>
                </div>
              </div>
            </div>
          `,
      tags: [
        { name: 'category', value: 'transactional' },
        { name: 'type', value: 'collective_application' },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error(`[notify-application] Resend error:`, err)
    return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/*  Applicant-facing email (confirmation + accept/reject decision)     */
/* ------------------------------------------------------------------ */

async function sendApplicantEmail(
  toEmail: string,
  applicantName: string,
  kind: 'submitted' | 'accepted' | 'rejected',
): Promise<boolean> {
  if (await isSuppressedAddress(toEmail)) {
    console.log('[notify-application] refused a suppressed applicant address for kind', kind)
    return false
  }

  const safeName = sanitizeHtml(applicantName)
  const firstName = safeName.split(' ')[0] || 'there'

  const copy = {
    submitted: {
      subject: "We've received your Co-Exist Collective application",
      heading: 'Application received',
      lede: "Thanks for applying to lead a Co-Exist Collective. We have your application and our team will review it soon.",
      body: "We review every application personally, so it can take a little while. We will be in touch by email with the next steps. In the meantime, come along to an event near you.",
      cta: { label: 'Explore Events', url: 'https://app.coexistaus.org/explore' },
    },
    accepted: {
      subject: 'Great news about your Co-Exist Collective application',
      heading: "You're in!",
      lede: "We would love to have you on the Co-Exist core team. Congratulations, your application has been accepted.",
      body: "Someone from our team will reach out with onboarding and your next steps. Welcome aboard.",
      cta: { label: 'Open Co-Exist', url: 'https://app.coexistaus.org' },
    },
    rejected: {
      subject: 'An update on your Co-Exist Collective application',
      heading: 'Thank you for applying',
      lede: "Thank you for your interest in leading a Co-Exist Collective. After careful consideration, we are not able to move forward with your application at this time.",
      body: "This is not a reflection of your passion for conservation, we simply have limited spots right now. We would love for you to stay involved as a volunteer, and you are welcome to apply again in the future.",
      cta: { label: 'Find an Event', url: 'https://app.coexistaus.org/explore' },
    },
  }[kind]

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [toEmail],
      subject: copy.subject,
      html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #869e62 0%, #3d4d33 100%); padding: 32px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 22px;">${copy.heading}</h1>
              </div>
              <div style="background: #f9faf7; padding: 24px; border-radius: 0 0 16px 16px; border: 1px solid #e8eddf; color: #2d3a22;">
                <p style="font-size: 15px; margin: 0 0 12px;">Hi ${firstName},</p>
                <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">${copy.lede}</p>
                <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #6b7a5a;">${copy.body}</p>
                <a href="${copy.cta.url}" style="display: inline-block; background: #869e62; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">${copy.cta.label}</a>
              </div>
            </div>
          `,
      tags: [
        { name: 'category', value: 'transactional' },
        { name: 'type', value: `collective_application_${kind}` },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error(`[notify-application] applicant email (${kind}) Resend error:`, err)
    return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/*  Push notification via send-push function                           */
/* ------------------------------------------------------------------ */

async function sendPushNotifications(
  supabaseAdmin: ReturnType<typeof createClient>,
  userIds: string[],
  applicantName: string,
  location: string,
): Promise<number> {
  if (userIds.length === 0) return 0

  try {
    const resp = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds,
          title: 'New Collective Application',
          body: `${applicantName} from ${location} has applied to lead a collective.`,
          data: {
            type: 'collective_application',
            route: '/admin/applications',
          },
        }),
      },
    )

    if (!resp.ok) {
      const err = await resp.text()
      console.error('[notify-application] Push error:', err)
      return 0
    }

    const result = await resp.json()
    return result.sent ?? 0
  } catch (err) {
    console.error('[notify-application] Push error:', err)
    return 0
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

/** Sanitise user input for safe inclusion in HTML email */
function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

Deno.serve(withSentry('notify-application', async (req: Request) => {
  try {
    // ── Auth: require authenticated user ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceRoleKey },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const user = await gotruRes.json() as { id: string; email?: string }

    const payload = (await req.json()) as NotifyPayload

    if (!payload.applicant_name || !payload.applicant_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const kind: 'submitted' | 'accepted' | 'rejected' =
      payload.kind === 'accepted' || payload.kind === 'rejected' ? payload.kind : 'submitted'

    // Applicant-facing email (every kind). The applicant used to get NOTHING -
    // no confirmation on submit, no email on accept/reject (backlog 345).
    let applicantEmailSent = false
    try {
      applicantEmailSent = await sendApplicantEmail(
        payload.applicant_email,
        payload.applicant_name,
        kind,
      )
    } catch (err) {
      console.error('[notify-application] applicant email error:', err)
    }

    // Accept/reject is an applicant decision email only - no staff fan-out.
    if (kind !== 'submitted') {
      return new Response(
        JSON.stringify({ applicant_email_sent: applicantEmailSent }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch configured notification recipients
    const { data: recipients } = await supabaseAdmin
      .from('notification_recipients')
      .select('user_id, notify_email, notify_push')
      .eq('event_type', 'collective_application')

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ emails_sent: 0, push_sent: 0, message: 'No recipients configured' }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const location = `${payload.suburb}, ${payload.state}`

    // Get email addresses for recipients who want email
    const emailRecipientIds = recipients
      .filter(r => r.notify_email)
      .map(r => r.user_id)

    let emailsSent = 0
    if (emailRecipientIds.length > 0) {
      // Look up emails. auth.users.email is NOT automatically deliverable: a
      // staff member who signed in with Apple carries an
      // @privaterelay.appleid.com forwarding address there, and every send to
      // one of those bounces (68 of 68 measured 2026-08-26). This path builds
      // its own `to` rather than passing userId to send-email, so it does not
      // inherit the resolver there and has to do the same thing itself.
      const emailPromises = emailRecipientIds.map(async (userId) => {
        const [{ data }, { data: profileRow }] = await Promise.all([
          supabaseAdmin.auth.admin.getUserById(userId),
          supabaseAdmin.from('profiles').select('email').eq('id', userId).maybeSingle(),
        ])
        return resolveRecipientEmail(
          data?.user?.email ?? null,
          (profileRow as { email?: string | null } | null)?.email ?? null,
        ).email || undefined
      })
      const emails = (await Promise.all(emailPromises)).filter(Boolean) as string[]

      // Send emails in parallel
      const emailResults = await Promise.allSettled(
        emails.map(email =>
          sendEmailNotification(
            email,
            payload.applicant_name,
            payload.applicant_email,
            payload.roles ?? [],
            location,
          )
        ),
      )
      emailsSent = emailResults.filter(r => r.status === 'fulfilled' && r.value).length
    }

    // Send push notifications
    const pushRecipientIds = recipients
      .filter(r => r.notify_push)
      .map(r => r.user_id)

    const pushSent = await sendPushNotifications(
      supabaseAdmin,
      pushRecipientIds,
      payload.applicant_name,
      location,
    )

    return new Response(
      JSON.stringify({ emails_sent: emailsSent, push_sent: pushSent, applicant_email_sent: applicantEmailSent }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[notify-application] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))
