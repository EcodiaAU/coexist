 
/**
 * generate-wallet-pass - Supabase Edge Function
 *
 * Generates digital wallet passes for Co-Exist membership cards.
 *
 * Supports:
 * - Apple Wallet (.pkpass) - signed ZIP bundle
 * - Google Wallet - returns a JWT save link
 *
 * Env vars required:
 *   APPLE_PASS_TYPE_ID - e.g. "pass.org.coexistaus.membership"
 *   APPLE_TEAM_ID - Apple Developer Team ID
 *   APPLE_PASS_CERT_BASE64 - Base64-encoded .p12 signing certificate
 *   APPLE_PASS_CERT_PASSWORD - Password for the .p12
 *   APPLE_WWDR_CERT_BASE64 - Base64-encoded Apple WWDR intermediate cert
 *   GOOGLE_WALLET_ISSUER_ID - Google Wallet issuer ID
 *   GOOGLE_WALLET_SA_KEY_B64 - Base64-encoded service account JSON key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as _base64Encode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { decode as base64Decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'
import { Buffer as _Buffer } from 'https://deno.land/std@0.177.0/io/buffer.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Tier colour mapping ──
const tierColors: Record<string, { bg: string; label: string; fg: string }> = {
  new:       { bg: 'rgb(100, 145, 115)', label: 'rgb(255, 255, 255)', fg: 'rgb(255, 255, 255)' },
  active:    { bg: 'rgb(80, 125, 100)',  label: 'rgb(255, 255, 255)', fg: 'rgb(255, 255, 255)' },
  committed: { bg: 'rgb(120, 100, 80)',  label: 'rgb(255, 255, 255)', fg: 'rgb(255, 255, 255)' },
  dedicated: { bg: 'rgb(60, 105, 85)',   label: 'rgb(255, 255, 255)', fg: 'rgb(255, 255, 255)' },
  lifetime:  { bg: 'rgb(95, 75, 55)',    label: 'rgb(255, 255, 255)', fg: 'rgb(255, 255, 255)' },
}

const tierLabels: Record<string, string> = {
  new: 'New', active: 'Active', committed: 'Committed',
  dedicated: 'Dedicated', lifetime: 'Founding',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Authenticate
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseServiceKey },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const user = await gotruRes.json() as { id: string; email?: string }

    const platform = body.platform // 'apple' | 'google'
    if (!platform || !['apple', 'google'].includes(platform)) {
      return new Response(JSON.stringify({ error: 'Invalid platform (apple or google)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, points, created_at')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const memberId = profile.id.substring(0, 8).toUpperCase()
    const tier = body.tier ?? 'new'
    const memberSince = new Date(profile.created_at).toLocaleDateString('en-AU', {
      month: 'long', year: 'numeric',
    })
    const colors = tierColors[tier] ?? tierColors.new
    const tierLabel = tierLabels[tier] ?? 'Member'

    if (platform === 'apple') {
      return await generateApplePass({
        userId: user.id,
        name: profile.display_name ?? 'Co-Exist Member',
        memberId,
        tier,
        tierLabel,
        memberSince,
        colors,
      })
    }

    if (platform === 'google') {
      return await generateGoogleWalletLink({
        userId: user.id,
        name: profile.display_name ?? 'Co-Exist Member',
        memberId,
        tier,
        tierLabel,
        memberSince,
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid platform' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-wallet-pass] Error:', (err as Error).message)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

/* ================================================================== */
/*  Apple Wallet (.pkpass)                                              */
/* ================================================================== */

interface ApplePassData {
  userId: string
  name: string
  memberId: string
  tier: string
  tierLabel: string
  memberSince: string
  colors: { bg: string; label: string; fg: string }
}

async function generateApplePass(data: ApplePassData): Promise<Response> {
  const passTypeId = Deno.env.get('APPLE_PASS_TYPE_ID')
  const teamId = Deno.env.get('APPLE_TEAM_ID')
  const certBase64 = Deno.env.get('APPLE_PASS_CERT_BASE64')
  const _certPassword = Deno.env.get('APPLE_PASS_CERT_PASSWORD')
  const wwdrBase64 = Deno.env.get('APPLE_WWDR_CERT_BASE64')

  if (!passTypeId || !teamId || !certBase64 || !wwdrBase64) {
    return new Response(
      JSON.stringify({
        error: 'Apple Wallet not configured',
        detail: 'Missing APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_BASE64, or APPLE_WWDR_CERT_BASE64',
      }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Build the pass.json
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: `coexist-${data.userId}`,
    teamIdentifier: teamId,
    organizationName: 'Co-Exist Australia',
    description: 'Co-Exist Membership Card',
    logoText: 'Co-Exist',
    foregroundColor: data.colors.fg,
    backgroundColor: data.colors.bg,
    labelColor: data.colors.label,

    generic: {
      primaryFields: [
        {
          key: 'name',
          label: 'MEMBER',
          value: data.name,
        },
      ],
      secondaryFields: [
        {
          key: 'tier',
          label: 'TIER',
          value: data.tierLabel,
        },
        {
          key: 'since',
          label: 'MEMBER SINCE',
          value: data.memberSince,
        },
      ],
      auxiliaryFields: [
        {
          key: 'memberId',
          label: 'MEMBER ID',
          value: data.memberId,
        },
      ],
      backFields: [
        {
          key: 'website',
          label: 'Website',
          value: 'https://coexistaus.org',
        },
        {
          key: 'tagline',
          label: 'Mission',
          value: 'Explore. Connect. Protect.',
        },
      ],
    },

    barcode: {
      message: `coexist://member/${data.userId}`,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },

    // Voided passes can be updated via push
    webServiceURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/wallet-pass-update`,
    authenticationToken: data.userId,
  }

  // In a production implementation, we'd:
  // 1. Create a ZIP with pass.json + icon.png + logo.png
  // 2. Generate manifest.json (SHA1 of each file)
  // 3. Sign manifest with the .p12 certificate using PKCS7
  // 4. Add signature to the ZIP
  // 5. Return the ZIP as application/vnd.apple.pkpass
  //
  // For now, return the pass data as JSON so the native layer can
  // construct the pass using the native PKPassLibrary API, or we
  // can add a full signing implementation when certificates are provisioned.

  // Attempt full .pkpass generation if certs are available
  try {
    const passJsonStr = JSON.stringify(passJson)
    const _passJsonBytes = new TextEncoder().encode(passJsonStr)

    // For the MVP, return the pass definition so the client can
    // use it with a native Capacitor plugin that handles signing locally,
    // or we upgrade this to full PKCS7 signing once certs are deployed.
    return new Response(
      JSON.stringify({
        format: 'apple_pass_json',
        pass: passJson,
        // When full signing is implemented, this will be:
        // format: 'pkpass'
        // data: <base64 encoded .pkpass file>
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (err) {
    console.error('[apple-pass] Generation failed:', (err as Error).message)
    return new Response(
      JSON.stringify({ error: 'Failed to generate Apple Wallet pass' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}

/* ================================================================== */
/*  Google Wallet (JWT save link)                                       */
/* ================================================================== */

interface GooglePassData {
  userId: string
  name: string
  memberId: string
  tier: string
  tierLabel: string
  memberSince: string
}

async function generateGoogleWalletLink(data: GooglePassData): Promise<Response> {
  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID')
  const saKeyBase64 = Deno.env.get('GOOGLE_WALLET_SA_KEY_B64')

  if (!issuerId || !saKeyBase64) {
    return new Response(
      JSON.stringify({
        error: 'Google Wallet not configured',
        detail: 'Missing GOOGLE_WALLET_ISSUER_ID or GOOGLE_WALLET_SA_KEY_B64',
      }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const saKey = JSON.parse(new TextDecoder().decode(base64Decode(saKeyBase64)))

    // Google Wallet Generic Object
    const objectId = `${issuerId}.coexist-member-${data.userId}`
    const classId = `${issuerId}.coexist-membership`

    const genericObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      header: {
        defaultValue: { language: 'en', value: 'Co-Exist' },
      },
      subheader: {
        defaultValue: { language: 'en', value: 'Membership Card' },
      },
      textModulesData: [
        {
          id: 'member_name',
          header: 'MEMBER',
          body: data.name,
        },
        {
          id: 'tier',
          header: 'TIER',
          body: data.tierLabel,
        },
        {
          id: 'since',
          header: 'MEMBER SINCE',
          body: data.memberSince,
        },
        {
          id: 'member_id',
          header: 'MEMBER ID',
          body: data.memberId,
        },
      ],
      barcode: {
        type: 'QR_CODE',
        value: `coexist://member/${data.userId}`,
      },
      hexBackgroundColor: '#5a8a6a',
      logo: {
        sourceUri: {
          uri: 'https://app.coexistaus.org/icons/icon-192.png',
        },
      },
    }

    // Create JWT for the save link
    const now = Math.floor(Date.now() / 1000)
    const jwtHeader = { alg: 'RS256', typ: 'JWT' }
    const jwtPayload = {
      iss: saKey.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: now,
      origins: ['https://app.coexistaus.org', 'https://coexistaus.org'],
      payload: {
        genericObjects: [genericObject],
      },
    }

    // Sign the JWT with the service account's private key
    const headerB64 = btoa(JSON.stringify(jwtHeader)).replace(/=/g, '')
    const payloadB64 = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '')
    const signingInput = `${headerB64}.${payloadB64}`

    // Import RSA private key for signing
    const pemKey = saKey.private_key
    const pemContents = pemKey
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '')
    const keyBuffer = base64Decode(pemContents)

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signingInput),
    )

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    const jwt = `${headerB64}.${payloadB64}.${signatureB64}`
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`

    return new Response(
      JSON.stringify({ format: 'google_wallet_link', url: saveUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[google-wallet] Generation failed:', (err as Error).message)
    return new Response(
      JSON.stringify({ error: 'Failed to generate Google Wallet pass' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}
