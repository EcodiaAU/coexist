// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

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
- Tone: Composed, grounded, quietly confident. Co-Exist is sure of the work, so the writing stays calm and lets specifics carry the warmth. Never corporate, never preachy, and never performing enthusiasm at the reader.
- Stats: 5,500+ volunteers, 13 collectives, 35,500+ native plants, 4,900+ kg litter removed
- Website: https://www.coexistaus.org
- Instagram: https://www.instagram.com/coexistaus (@coexistaus)
- Facebook: https://www.facebook.com/coexistaus
- Contact: hello@coexistaus.org
- Country: Australia (Southern Hemisphere - summer is Dec-Feb)

BRAND COLOURS (MATCH THE LIVE APP - do NOT use any other green):
- Primary olive-sage: #869e62 (the EXACT --color-brand the app uses; the hero of every Co-Exist email is this colour, or a full-bleed photo over it)
- Primary darker: #5d7340 (gradient ends, links)
- Primary lighter: #a3b88a (subtle backgrounds)
- Olive for dark mode: #93ab6d (brightened so it pops on a dark background)
- Accent (CTAs): the olive #869e62 filled button is the primary action
- Background (light): #f4f2ec (warm off-white)
- Card surface (light): #ffffff
- Warm tint block (light): #f5f4ee
- Text (light): #2d3a22 (warm dark green - NEVER pure black #000)
- Muted text (light): #7d8768
- Hairline/border (light): #ece8de
- On the olive/photo hero, text is #ffffff with white/85 subtitles.
- DARK MODE surfaces (applied by the @media block below): page #111309, card #1c1f16, text #ece9e0, muted #a9b199, hairline rgba(255,255,255,0.12).

DO NOT use #4A7C59, #1B4332, or any truer-green sage. The brand is olive-sage #869e62.

FONTS (slim, matching the app's Eau Sans -> Montserrat fallback):
- Load Montserrat via Google Fonts inside a <style> block in <head>:
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
- Use this stack on <body> and every button/text element:
    font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
- Body copy weight 400-500, headings 600-700, tight display leading (~1.16). Overlines are
  uppercase, 11px, font-weight 600, letter-spacing 0.08em. This reads slim and modern, like the app.

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
- Table-based layout (no flexbox/grid - email clients do not support them).
- Every text element carries an explicit inline color AND the Montserrat
  font stack. Never rely on inherited colour or font.
- Head MUST contain the Montserrat @import (in a <style> block), the
  viewport meta, and the light/dark scheme meta (see LIGHT/DARK below).
- Max width 600px, one card centred with margin:0 auto.
- Images: width/height attributes AND inline styles, always with alt text.
- Links use the olive #5d7340 (or #869e62). No orange.
- The CTA is ONE olive filled button (#869e62), white text, radius 12px,
  line-height:1, inside <td align="center">. No orange, no second button.

LIGHT/DARK AWARE (this REPLACES the old light-lock; the app is beautiful in
both and so is the email):
- The <head> MUST declare BOTH schemes so clients render dark properly:
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
- Inline colours are the LIGHT baseline, chosen to also survive Gmail /
  Outlook forced-dark remapping (explicit colour on every node; never
  light-grey on white).
- Put class hooks on themable elements AND include this EXACT <style> block
  in <head> so Apple Mail / iOS Mail restyle for dark. Classes: ex-body /
  ex-surface (page + content background, they share the same colour, there is
  NO separate card), ex-text (body copy), ex-heading (headings), ex-muted
  (labels/footer), ex-hairline (divider rules), ex-btn (CTA), ex-accent (stat
  numbers / step markers):
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
      body{margin:0;padding:0;width:100%!important;}
      img{border:0;outline:none;text-decoration:none;}
      @media only screen and (max-width:600px){
        .ex-pad{padding-left:22px!important;padding-right:22px!important;}
        .ex-hero-pad{padding-left:22px!important;padding-right:22px!important;padding-top:150px!important;}
      }
      @media (prefers-color-scheme: dark){
        .ex-body,.ex-surface{background:#111309!important;}
        .ex-text{color:#ece9e0!important;}
        .ex-heading{color:#f3f1e9!important;}
        .ex-muted{color:#a9b199!important;}
        .ex-hairline{border-color:rgba(255,255,255,0.14)!important;}
        .ex-btn{background:#93ab6d!important;color:#12150b!important;}
        .ex-accent{color:#a9c17f!important;}
        a{color:#b9cb95!important;}
      }
      [data-ogsc] .ex-body,[data-ogsc] .ex-surface{background:#111309!important;}
      [data-ogsc] .ex-text{color:#ece9e0!important;}
      [data-ogsc] .ex-muted{color:#a9b199!important;}
      [data-ogsc] .ex-btn{background:#93ab6d!important;color:#12150b!important;}
    </style>

LAYOUT (true full-bleed, NO cards, NO thin centred column):
- There is NO card. No rounded box, no border, no shadow, no distinct card
  background. Content sits DIRECTLY on the page background (ex-body / ex-surface,
  #f4f2ec light). The hero image and content share the same full-width container.
- The container is width:100%, max-width:1040px (wide and open on laptop, never a
  thin 600px column floating in the middle). On mobile it is 100%.
- The HERO image is TRUE full-bleed: it spans the entire container width edge to
  edge, with NO radius, NO side gutter, NO padding around the image itself.
- ONE horizontal padding level for text: 48px each side on desktop, 22px on mobile
  (via the ex-pad class). The hero heading uses the SAME 48/22px side padding so it
  lines up with the copy below.
- NEVER a bordered / tinted / rounded detail box. Event details are plain rows with
  a thin ex-hairline rule between them (see STRUCTURE 3).

STRUCTURE:
1. Full-bleed hero (ONE cell, edge to edge: small white wordmark at top, overline +
   heading + optional subtitle sit BOTTOM-LEFT over the image). Swap the text:

   <tr><td bgcolor="#869e62" class="ex-hero" style="background-color:#869e62;background-image:linear-gradient(to top, rgba(13,18,8,0.82) 0%, rgba(13,18,8,0.36) 44%, rgba(13,18,8,0.04) 100%), url('{{hero_image_url}}');background-size:cover;background-position:{{hero_focal_x}}% {{hero_focal_y}}%;background-repeat:no-repeat;">
     <div class="ex-hero-pad" style="padding:210px 48px 34px 48px;">
       <img src="https://app.coexistaus.org/logos/white-wordmark.png" alt="Co-Exist" width="128" style="width:128px;height:auto;display:block;margin:0 0 16px 0;border:0;" />
       <p style="margin:0 0 9px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.82);">OPTIONAL OVERLINE</p>
       <h1 class="ex-hero-h" style="color:#ffffff;margin:0;font-size:38px;font-weight:700;line-height:1.12;letter-spacing:-0.015em;">YOUR HEADING</h1>
       <p style="color:rgba(255,255,255,0.90);margin:12px 0 0 0;font-size:16px;line-height:1.5;">Optional subtitle</p>
     </div>
   </td></tr>

   WHY this exact shape:
   - No radius, no gutter, no card wrapper. The td is the full container width, so
     the photo bleeds edge to edge.
   - The stacked linear-gradient darkens the BOTTOM of the photo so the white heading
     stays legible; the top of the photo stays clear (the app's tile gradient).
   - The tall 210px top padding pushes the heading into the dark zone at the bottom.
     Mobile overrides it to 150px (see the @media block).
   - bgcolor + background-color:#869e62 is the ALWAYS-present olive fallback (Outlook
     shows solid olive). When {{hero_image_url}} is empty, drop the url() layer and use
     background-image:linear-gradient(135deg,#869e62,#5d7340) with a shorter ~46px top
     padding so a no-image hero is a clean olive gradient.
   - Heading and logo are BOTTOM-LEFT (the app language). Do NOT centre them. No
     separate logo bar.
2. Body cell: class "ex-pad ex-surface", padding:34px 48px 12px. Paragraphs are
   ex-text, 15-16px, line-height 1.65. Headings are ex-heading.
3. Event / key detail = PLAIN rows, no box. Each row is a cell with a top
   ex-hairline rule, an uppercase ex-muted overline label, then the ex-text value.
   Close with one final ex-hairline rule. NO background, NO side border, NO radius.
4. CTA. ONE olive button in an ex-pad ex-surface cell (left-aligned is fine):
     <a class="ex-btn" href="{{cta_url}}" style="display:inline-block;background:#869e62;color:#ffffff;padding:15px 34px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;line-height:1;">Label</a>
5. Footer. An ex-pad ex-surface ex-hairline cell with a thin top border (NOT a
   card). Small ex-muted "Explore. Connect. Protect." overline, the
   app/website/Instagram links, and the working unsubscribe link. ALWAYS use
   {{unsubscribe_url}} as the href, e.g. <a href="{{unsubscribe_url}}">Unsubscribe</a>.
   NEVER a placeholder like "#" or "[unsubscribe]". It is auto-filled per recipient.

COLLECTIVE NAMING (strict):
- When referring to a regional crew, ALWAYS use the form
  "Co-Exist <region>" (e.g. "Co-Exist Sunshine Coast", "Co-Exist
  Brisbane", "Co-Exist Perth").
- NEVER write "Sunshine Coast Collective", "Brisbane Collective",
  "the X Collective", "your local collective" or any suffix-Collective
  form. The {{next_event_collective}} variable already resolves to the
  branded "Co-Exist <region>" string at send time.

VOICE (this is what separates a Co-Exist email from a generic charity blast - read it carefully):
- Composed and grounded. The reader is a capable adult who already cares about nature. Do not perform enthusiasm at them, and do not try to be their excitable best mate.
- Warmth comes from specifics, not adjectives. "We pulled 240kg of litter off Mooloolaba Beach on Saturday" carries more feeling than "what a day with our community". Name the place, the number, the date. Let the facts do the work.
- Lead with the concrete: what is happening, where, and when. Keep reflection to one quiet line at the end, if any.
- Short, declarative sentences. One idea each. A strong email can be five sentences. Do not pad to fill space.
- Invite plainly. "There is a planting at Buderim this Sunday, details below" reads better than any rallying cry.
- Sentence case throughout. Plain Australian English.

LANGUAGE RULES (HARD - the brand voice is strict):
- NEVER use em-dashes. The character U+2014 must not appear in the output. Use full stops, commas, or parentheses instead.
- NEVER use en-dashes (U+2013). Use a hyphen for ranges, or rephrase.
- NEVER use "X, not Y" rhetorical structures.
- At most ONE exclamation mark in an entire email, and zero is better. Exclamation spam is the clearest tell of a cringey charity email.
- NO emoji anywhere in the copy.
- NO rhetorical-question openers like "Ready to make a difference?" or "Want to help out?".
- BANNED greetings: "Hey there", "Hi friend", "Hey legend", "G'day legends", or any try-hard salutation. Open with the recipient's name ({{name}}) or go straight into the substance.
- BANNED cliche lines: "join the movement", "be the change", "make a difference", "together we can", "every bit counts", "small actions add up", "our amazing community", "we can't wait", "so grateful", "change the world", "do your part", "for the planet".
- BANNED vocab: leverage, unleash, amazing, incredible, exciting, thrilled, passionate, journey, empower, magical, heartwarming.
- BANNED softeners: just, really, actually, kind of, sort of, pretty much.
- BANNED hype openers: "we're excited to", "we'd love to", "thrilled to announce", "we're stoked to".
- Plain English. No corporate filler, no marketing-speak, no inspirational-poster lines.

VOICE EXAMPLE (match this register and restraint, not the exact words):
  Subject: A planting at Buderim this Sunday
  Hi {{name}},
  Co-Exist Sunshine Coast is putting 300 native seedlings into the ground at Buderim Forest Park this Sunday, from 8am. Bring a hat and water. We supply the rest.
  Last month at the same site, 22 people had it done in two hours. The trees are already away.
  Details and sign-up are below. Good to have you along.
DO NOT WRITE LIKE THIS (the cringe to avoid):
  "Hey friend! We are SO excited to invite you on an amazing journey to make a real difference for our planet. Together we can be the change! Every little bit counts and we cannot wait to see your beautiful face there."

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

Deno.serve(withSentry('generate-email', async (req: Request) => {
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
    // 'national_leader' removed 2026-08-10 (D3): the role does not exist in
    // profiles (live roles: participant, leader, assist_leader, co_leader,
    // manager, admin), so it never matched anyone - the effective allowlist has
    // always been manager+admin. Kept as manager+admin (national email/marketing
    // is an admin/manager function); leader inclusion is a product decision left
    // to Tate, not a silent scope change here.
    if (!callerProfile || !['manager', 'admin'].includes(callerProfile.role)) {
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
- {{next_event_image}} - the recipient's next event COVER PHOTO url (empty string when the event has no cover). Use this as the hero background-image url() for "next event" campaigns so each subscriber sees their own event photo full-bleed.
- {{next_event_image_x}} / {{next_event_image_y}} - 0 to 100 focal point for {{next_event_image}} (default 50/50)
- {{unsubscribe_url}} - one-click unsubscribe link, always use this on the footer Unsubscribe link

PER-CAMPAIGN HERO IMAGE (optional, filled by admin in the UI when the campaign is NOT per-recipient):
- {{hero_image_url}} - CSS background-image URL for the hero
- {{hero_focal_x}} / {{hero_focal_y}} - 0 to 100 focal point (default 50)

If the user description mentions "hyping up the next event", "reminder", "what's coming up", "next event near you", or anything per region, USE the {{next_event_*}} variables (including {{next_event_image}} as the hero photo) instead of asking the admin to fill them in. Each subscriber sees their own collective's next event and its cover photo.

Use {{editable_field_name}} placeholders only for content that genuinely changes per CAMPAIGN, not per recipient. Make the template flexible enough to be reused.`
    } else {
      userMessage = `Create a ready-to-send email based on this description:

${prompt}

${subject ? `Subject line: "${subject}"` : ''}

AUTO-FILLED PER RECIPIENT (use these instead of hard-coding event details if the email is about an upcoming event):
- {{name}} - recipient's first name
- {{next_event_title}}, {{next_event_date}}, {{next_event_date_long}}, {{next_event_collective}}, {{next_event_location}}, {{next_event_url}}, {{next_event_image}} (cover photo url for the hero), {{next_event_image_x}}, {{next_event_image_y}}

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
}))
