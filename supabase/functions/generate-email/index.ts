// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  AI Email Template Generator for Co-Exist                           */
/*  Uses Anthropic Claude to generate branded HTML email templates      */
/* ------------------------------------------------------------------ */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

async function loadBrandContext(): Promise<string> {
  // Load dynamic brand assets from app_images table
  let emailHeaderUrl = ''
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data } = await supabaseAdmin
      .from('app_images')
      .select('key, url')
      .in('key', ['email_header'])
    if (data?.length) {
      for (const row of data) {
        if (row.key === 'email_header' && row.url) emailHeaderUrl = row.url
      }
    }
  } catch {
    // Non-critical - proceed without dynamic assets
  }

  return `You are an email template designer for Co-Exist Australia - a youth-led environmental charity.

ABOUT CO-EXIST:
- Full name: Co-Exist Australia
- Tagline: "Explore. Connect. Protect."
- Philosophy: "Do good, feel good"
- What they do: Run conservation events (tree planting, beach cleanups, habitat restoration, wildlife surveys, etc.) through local volunteer groups called "Collectives"
- Audience: 18-30 year olds, digitally native, expect consumer-grade design
- Tone: Warm, inclusive, grassroots authentic. Like texting a friend who cares about nature. Never corporate, never preachy.
- Stats: 5,500+ volunteers, 13 collectives, 35,500+ native plants, 4,900+ kg litter removed
- Website: https://www.coexistaus.org
- Instagram: https://www.instagram.com/coexistaus (@coexistaus)
- Facebook: https://www.facebook.com/coexistaus
- Contact: hello@coexistaus.org
- Country: Australia (Southern Hemisphere - summer is Dec-Feb)

BRAND COLOURS:
- Primary sage green: #4A7C59
- Secondary earth: #8B6F47
- Accent orange (CTAs): #E8913A
- Background: #F9F7F4 (warm off-white)
- Text: #2D3748 (warm charcoal - NEVER pure black #000)
- Light sage: #E8F0EB (subtle bg accents)
- Light earth: #F0EBE4 (warm card bg)

FONTS:
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

BRAND IMAGES:
- Logo wordmark (white on dark): https://app.coexistaus.org/logos/white-wordmark.webp
- Logo wordmark (black on light): https://app.coexistaus.org/logos/black-wordmark.png
- Logo icon (black, transparent bg): https://app.coexistaus.org/logos/black-logo-transparent.png
- Logo icon (white, solid): https://app.coexistaus.org/logos/white-solid-logo.png
${emailHeaderUrl ? `- Email header banner: ${emailHeaderUrl}` : '- Email header banner: not yet uploaded (use a sage green header with text wordmark instead)'}

EDITABLE FIELD SYSTEM:
Templates use {{double_braces}} for fields the admin fills in when creating a campaign. Common variables:
- {{name}} - recipient's first name (always available, auto-filled by the system)
- {{subject}} - email subject (auto-filled)
Any other {{variables}} you create are editable fields the admin will fill in per campaign. Use descriptive names like {{event_title}}, {{event_date}}, {{event_location}}, {{cta_url}}, {{hero_image_url}}, {{announcement_text}}, etc. The admin will see these as form fields.

HTML EMAIL RULES:
- Inline CSS only (many email clients strip <style> blocks)
- Table-based layout (no flexbox/grid - email clients don't support them)
- Max width: 600px, centered with margin: 0 auto
- Images: use width/height attributes AND inline styles for consistency
- Mobile: tables should be 100% width so they collapse on small screens
- Buttons: min 44px height, border-radius for rounded corners, background-color for fill
- Generous padding (20-40px sections)
- Links should use the accent orange colour
- Always include alt text on images

STRUCTURE (suggested, not rigid):
1. Header - sage green background (#4A7C59) with white Co-Exist wordmark image or text
2. Hero - main visual/message area
3. Body - content sections with clear hierarchy
4. CTA - prominent button in accent orange (#E8913A)
5. Footer - social links, unsubscribe text, mailing address line

FOOTER (always include):
- "You're receiving this because you opted in to Co-Exist marketing emails."
- Unsubscribe link placeholder
- Co-Exist Australia | coexistaus.org
- Instagram & Facebook links

Return ONLY valid HTML. No markdown, no code blocks, no explanation text.`
}

interface GeneratePayload {
  prompt: string
  subject?: string
  mode?: 'template' | 'content'
}

Deno.serve(async (req: Request) => {
  try {
    // ── Auth: require admin/staff ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
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
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const user = await gotruRes.json() as { id: string; email?: string }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!callerProfile || !['national_leader', 'manager', 'admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured. Add it to your Supabase Edge Function secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { prompt, subject, mode = 'template' } = (await req.json()) as GeneratePayload

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const systemPrompt = await loadBrandContext()

    let userMessage: string
    if (mode === 'template') {
      userMessage = `Create a reusable email TEMPLATE based on this description:

${prompt}

${subject ? `The default subject line should be: "${subject}"` : ''}

IMPORTANT: This is a TEMPLATE - use {{editable_field_name}} placeholders for any content the admin should customise each time they send. The {{name}} variable is always available for the recipient's name. Create sensible {{field_name}} variables for things like event details, dates, URLs, announcements, etc. Make the template flexible enough to be reused.`
    } else {
      userMessage = `Create a ready-to-send email based on this description:

${prompt}

${subject ? `Subject line: "${subject}"` : ''}

Use {{name}} for the recipient's first name. This is a one-off email, not a template - fill in all the content directly.`
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('[generate-email] Anthropic error:', err)
      return new Response(
        JSON.stringify({ success: false, error: 'AI generation failed. Check API key and quota.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const result = await resp.json()
    let html = result.content?.[0]?.text ?? ''

    // Strip markdown code block wrappers if the model included them
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

    // Extract {{variables}} from the HTML for the UI to show as form fields
    const variableMatches = html.match(/\{\{([a-z_]+)\}\}/gi) ?? []
    const variables = [...new Set(
      variableMatches
        .map((m: string) => m.replace(/[{}]/g, ''))
        .filter((v: string) => v !== 'name' && v !== 'subject') // these are auto-filled
    )]

    // Generate plain text version
    const textResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Convert this HTML email to plain text. Preserve {{variable}} placeholders exactly as-is. Keep the same message but remove all HTML tags. Return ONLY the plain text:\n\n${html}`,
        }],
      }),
    })

    let plainText = ''
    if (textResp.ok) {
      const textResult = await textResp.json()
      plainText = textResult.content?.[0]?.text ?? ''
    }

    return new Response(
      JSON.stringify({ success: true, html, plainText, variables }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[generate-email] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
