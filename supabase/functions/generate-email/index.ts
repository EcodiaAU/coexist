// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  AI Email Template Generator for Co-Exist                           */
/*  Uses Anthropic Claude to generate branded HTML email templates      */
/* ------------------------------------------------------------------ */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

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

BRAND COLOURS (MATCH THE LIVE HOMEPAGE - do NOT use any other green):
- Primary olive-sage: #879e62 (this is the EXACT colour the homepage Impact section uses; the hero banner of every Co-Exist email must be this colour)
- Primary darker: #5d7340 (for gradient ends and hover states)
- Primary lighter: #a3b88a (for subtle backgrounds)
- Secondary earth: #8B6F47
- Accent orange (CTAs): #E8913A
- Background: #f4f2ec (warm off-white that pairs with #879e62)
- Card background: #fbfaf6
- Text: #2d3a22 (warm dark green - NEVER pure black #000)
- Soft text: #f4f2ec (warm off-white, used on top of #879e62 hero)
- Border: #e6e3da

DO NOT use #4A7C59, #1B4332, or any truer-green sage. The brand is olive-sage #879e62. Mixing a different green into the body makes the email look off-brand from the in-app Impact section.

FONTS:
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

BRAND IMAGES (logo - read carefully, this matters):
- Use this exact URL for the wordmark in the email header:
  https://app.coexistaus.org/logos/white-wordmark.png
- The wordmark is WHITE pixels on a TRANSPARENT background. Some
  email clients (Gmail dark mode, Outlook dark mode, iOS Mail dark
  mode) render PNG transparency over a black background by default,
  which makes the white wordmark appear on black. To avoid this,
  the cell containing the <img> MUST carry an explicit bgcolor AND
  inline background-color matching the surrounding section. Use the
  brand olive #879e62 if the wordmark sits on the olive hero, or
  the warm off-white #f4f2ec if it sits above the olive hero on the
  outer body background.
- Width 120px. Centre via the cell's text-align:center and the img's
  display:inline-block.
- NEVER use black-wordmark.png in the email. It only works on light
  light-only contexts and looks broken in dark mode.
- Icon fallbacks (only when the description specifically calls for
  the icon mark instead of the wordmark):
  https://app.coexistaus.org/logos/black-logo-transparent.png
  https://app.coexistaus.org/logos/white-solid-logo.png
${emailHeaderUrl ? `- Email header banner: ${emailHeaderUrl}` : '- Email header banner: not yet uploaded (use the olive-sage #879e62 with the white Co-Exist wordmark instead)'}

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
- Links should use the accent orange colour
- Always include alt text on images

DARK MODE (critical - emails were rendering with washed-out unreadable text):
- The <head> MUST contain BOTH of these meta tags so clients do not remap
  the palette in dark mode:
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
- EVERY text element MUST carry an explicit inline color. Never rely on a
  default or inherited colour. Body copy is #2d3a22 on a #ffffff or #f4f2ec
  cell. Hero copy is #ffffff. A heading with no color: set on it will look
  washed out in dark mode - always set it.
- Never put light-grey text on white (it disappears in dark mode). Minimum
  body text colour is #2d3a22.

PADDING / MOBILE (was too cramped and over-nested):
- ONE level of cards. Do NOT nest a card inside a card inside a card. The
  body content sits in a single white content cell.
- Side padding on the main content cell: 24px (not 32-40). Vertical padding
  between sections: 20-24px. Keep it breathable but not cavernous.
- Do not wrap every paragraph in its own bordered box. Plain paragraphs with
  margin are correct; reserve a bordered/tinted card for ONE genuinely
  distinct callout (e.g. the event details block).
- On a 360px phone the content must never feel pinched. Test mentally at
  360px: the side padding plus content must fit comfortably.

STRUCTURE (suggested, not rigid):
1. Hero (ONE unified block: the logo and the heading text live in the
   SAME table cell, not two separate sections). Use this exact
   skeleton verbatim, only swapping in the heading and subtitle text:

   <tr>
     <td bgcolor="#879e62" style="background-color:#879e62;background-image:url('{{hero_image_url}}');background-size:cover;background-position:{{hero_focal_x}}% {{hero_focal_y}}%;background-repeat:no-repeat;border-radius:20px 20px 0 0;">
       <div style="background-color:rgba(0,0,0,{{hero_overlay_opacity}});border-radius:20px 20px 0 0;padding:40px 32px;text-align:center;">
         <img src="https://app.coexistaus.org/logos/white-wordmark.png" alt="Co-Exist" width="150" style="width:150px;height:auto;display:block;margin:0 auto 22px auto;border:0;outline:none;" />
         <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;line-height:1.3;">YOUR HEADING HERE</h1>
         <p style="color:rgba(255,255,255,0.92);margin:12px 0 0 0;font-size:15px;line-height:1.5;">Optional subtitle here</p>
       </div>
     </td>
   </tr>

   WHY this exact shape:
   - The logo is centred via display:block;margin:0 auto and the cell's
     text-align:center. NEVER left-align the logo.
   - bgcolor + background-color:#879e62 is the ALWAYS-present olive
     fallback. When {{hero_image_url}} is empty the url('') is ignored
     and the whole hero is solid olive. When it is set the photo paints
     over the olive.
   - {{hero_overlay_opacity}} is 0 when there is no image (so a plain
     olive hero has NO dark wash) and ~0.35 when there is an image (so
     the white heading stays legible over any photo).
   - Do NOT add a separate logo bar above or below this block. The logo
     belongs inside this one hero cell.
2. Body. Content sections with clear hierarchy.
3. CTA. Prominent button in accent orange (#E8913A). The CTA button
   MUST be horizontally centred. Wrap it in <td align="center"
   style="text-align:center;padding:24px 0;"> with the <a> as an
   inline-block. Email clients only honour centre alignment if the
   table cell carries align="center".
   The button <a> MUST set line-height:1 (NOT inherited, or there is a
   blank line of dead space under the label) and symmetric padding,
   e.g. style="display:inline-block;background:#E8913A;color:#ffffff;
   padding:14px 30px;border-radius:12px;font-size:15px;font-weight:600;
   line-height:1;text-decoration:none;". No <br> inside or right after
   the button.

ALIGNMENT (mobile looked uneven):
- Centre-align the hero, every heading, the CTA, and the main message
  paragraphs. A consistent centre column reads clean on a phone; mixed
  left/centre looks broken.
- Use ONE consistent vertical gap between blocks (20px). Do not mix
  8px here and 40px there.
- Every section uses the same horizontal padding so left and right
  edges line up down the whole email.
4. Footer. Social links, mailing address line, and a working
   unsubscribe link. ALWAYS use {{unsubscribe_url}} as the href on the
   unsubscribe link, e.g.
   <a href="{{unsubscribe_url}}">Unsubscribe</a>. NEVER write a
   placeholder href like "#" or "[unsubscribe]" or "your-link-here".
   The {{unsubscribe_url}} variable is auto-filled per recipient.

COLLECTIVE NAMING (strict):
- When referring to a regional crew, ALWAYS use the form
  "Co-Exist <region>" (e.g. "Co-Exist Sunshine Coast", "Co-Exist
  Brisbane", "Co-Exist Perth").
- NEVER write "Sunshine Coast Collective", "Brisbane Collective",
  "the X Collective", "your local collective" or any suffix-Collective
  form. The {{next_event_collective}} variable already resolves to the
  branded "Co-Exist <region>" string at send time.

LANGUAGE RULES (HARD - the admin's voice profile is strict):
- NEVER use em-dashes. The character U+2014 must not appear in the output. Use full stops, commas, or parentheses instead.
- NEVER use en-dashes (U+2013). Use a hyphen for ranges, or rephrase.
- NEVER use "X, not Y" rhetorical structures.
- BANNED vocab: leverage, ecosystem, unleash, wedge, moat, impact (the noun), amazing, incredible, exciting, thrilled.
- BANNED softeners: just, really, actually, kind of, sort of, pretty much.
- BANNED hype openers: "we're excited to", "we'd love to", "thrilled to announce".
- Tone: warm grassroots Sunshine Coast neighbour. Like texting a friend who cares about nature. Sentence-case throughout.
- Plain English. No corporate filler. No marketing-speak.

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  try {
    // Auth: require admin/staff

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
        status: 401, headers: JSON_HEADERS,
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
        status: 401, headers: JSON_HEADERS,
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
        status: 403, headers: JSON_HEADERS,
      })
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured. Add it to your Supabase Edge Function secrets.' }),
        { status: 500, headers: JSON_HEADERS },
      )
    }

    const { prompt, subject, mode = 'template' } = (await req.json()) as GeneratePayload

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'prompt is required' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    const systemPrompt = await loadBrandContext()

    let userMessage: string
    if (mode === 'template') {
      userMessage = `Create a reusable email TEMPLATE based on this description:

${prompt}

${subject ? `The default subject line should be: "${subject}"` : ''}

IMPORTANT: This is a TEMPLATE. Use {{editable_field_name}} placeholders for content the admin should customise each time they send.

AUTO-FILLED PER RECIPIENT (resolve at send time, one campaign personalises to every subscriber):
- {{name}} - first name (always available)
- {{next_event_title}} - the recipient's next upcoming event from their collective
- {{next_event_date}} - short form e.g. Sat 14 Jun
- {{next_event_date_long}} - long form e.g. Saturday 14 June 2026
- {{next_event_collective}} - the branded crew name (e.g. "Co-Exist Brisbane", "Co-Exist Perth")
- {{next_event_location}} - address of the event
- {{next_event_url}} - deep link to the event page (opens the native app on mobile via universal links, falls back to web)
- {{unsubscribe_url}} - one-click unsubscribe link, always use this on the footer Unsubscribe link

PER-CAMPAIGN HERO IMAGE (optional, filled by admin in the UI):
- {{hero_image_url}} - CSS background-image URL for the hero
- {{hero_focal_x}} - 0 to 100, horizontal focal point (default 50)
- {{hero_focal_y}} - 0 to 100, vertical focal point (default 50)
- {{hero_overlay_opacity}} - 0 to 1, dark overlay for text legibility (default 0.35)

If the user description mentions "hyping up the next event", "reminder", "what's coming up", "next event near you", or anything that should adapt per region, USE the {{next_event_*}} variables instead of asking the admin to fill them in. Each subscriber will see their own collective's next event.

Use {{editable_field_name}} placeholders only for content that genuinely changes per CAMPAIGN, not per recipient. Make the template flexible enough to be reused.`
    } else {
      userMessage = `Create a ready-to-send email based on this description:

${prompt}

${subject ? `Subject line: "${subject}"` : ''}

AUTO-FILLED PER RECIPIENT (use these instead of hard-coding event details if the email is about an upcoming event):
- {{name}} - recipient's first name
- {{next_event_title}}, {{next_event_date}}, {{next_event_date_long}}, {{next_event_collective}}, {{next_event_location}}, {{next_event_url}}

If the user wants to "hype up the next event for everyone" or similar, USE these variables so each subscriber sees their own collective's next event. Otherwise fill content in directly.`
    }

    // llm-helper-justified: this is the Co-Exist client app's own
    // server-side Supabase Edge Function. It is invoked from Kurt's
    // admin UI to ghost-draft branded email templates inside the
    // running web app, has no conductor surface, and is billed to
    // Co-Exist's own Anthropic key. EcodiaOS conductor vision is not
    // applicable here.
    //
    // Haiku 4.5 handles branded HTML email template generation well
    // and is roughly 10x cheaper than Sonnet 4. If the admin reports
    // quality regressions (off-brand tone, malformed variables,
    // layout drift), swap to 'claude-sonnet-4-5-20250929'.
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
        { status: 500, headers: JSON_HEADERS },
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
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error('[generate-email] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
