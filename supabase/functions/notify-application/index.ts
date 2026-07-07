// Deno Edge Function
import { withSentry } from "../_shared/sentry.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotifyPayload {
  applicant_name: string
  applicant_email: string
  roles: string[]
  suburb: string
  state: string
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

async function sendEmailNotification(
  toEmail: string,
  applicantName: string,
  applicantEmail: string,
  roles: string[],
  location: string,
): Promise<boolean> {
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

Deno.serve(withSentry("notify-application", async (req: Request) => {
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
      // Look up emails from auth.users
      const emailPromises = emailRecipientIds.map(async (userId) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
        return data?.user?.email
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
      JSON.stringify({ emails_sent: emailsSent, push_sent: pushSent }),
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
