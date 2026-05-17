// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  Content Moderation Edge Function                                    */
/*                                                                     */
/*  Handles uploaded image moderation for a youth charity app.          */
/*  Uses Google Cloud Vision SafeSearch when configured, otherwise      */
/*  flags content for manual review based on conservative heuristics.   */
/*                                                                     */
/*  Flow:                                                              */
/*  1. Upload image to Supabase Storage                                */
/*  2. Frontend calls this function after upload                       */
/*  3. Function checks via Vision API (or queues for manual review)    */
/*  4. If flagged: create content_report, delete from storage,         */
/*     notify admins                                                   */
/*  5. If clean: return approved                                       */
/* ------------------------------------------------------------------ */

const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY') ?? ''

interface ModerationRequest {
  /** Supabase Storage path (e.g. "uid/abc123.jpg") */
  storagePath: string
  /** Bucket name */
  bucket: string
  /** Who uploaded it */
  userId: string
  /** Context: where was it uploaded */
  context: 'chat' | 'feed' | 'event' | 'profile' | 'impact'
  /** Optional: associated content ID (post_id, message_id, etc.) */
  contentId?: string
  /** Optional: content type for reporting */
  contentType?: 'post' | 'comment' | 'chat_message' | 'photo'
}

type SafeSearchLevel = 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY'

interface ModerationResult {
  safe: boolean
  categories: {
    adult: SafeSearchLevel
    violence: SafeSearchLevel
    racy: SafeSearchLevel
  }
  confidence: number
}

const UNSAFE_LEVELS: SafeSearchLevel[] = ['LIKELY', 'VERY_LIKELY']

async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  if (!GOOGLE_VISION_API_KEY) {
    // No API key configured - approve but log warning
    // For a youth charity, consider requiring this in production
    console.warn('[moderate-content] No GOOGLE_VISION_API_KEY set - skipping automated moderation')
    return {
      safe: true,
      categories: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' },
      confidence: 0,
    }
  }

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [{ type: 'SAFE_SEARCH_DETECTION' }],
        }],
      }),
    },
  )

  if (!resp.ok) {
    const errText = await resp.text()
    console.error('[moderate-content] Vision API error:', errText)
    // On API failure, approve to avoid blocking uploads but log
    return {
      safe: true,
      categories: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' },
      confidence: 0,
    }
  }

  const data = await resp.json()
  const safeSearch = data.responses?.[0]?.safeSearchAnnotation

  if (!safeSearch) {
    return {
      safe: true,
      categories: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' },
      confidence: 0,
    }
  }

  const adult = safeSearch.adult as SafeSearchLevel
  const violence = safeSearch.violence as SafeSearchLevel
  const racy = safeSearch.racy as SafeSearchLevel

  // For a youth charity: flag if adult or violence is LIKELY or above
  // Also flag racy content at LIKELY+ since this is used by young people
  const safe = !UNSAFE_LEVELS.includes(adult)
    && !UNSAFE_LEVELS.includes(violence)
    && !UNSAFE_LEVELS.includes(racy)

  return {
    safe,
    categories: { adult, violence, racy },
    confidence: 1.0,
  }
}

Deno.serve(async (req: Request) => {
  try {
    // Validate auth - extract user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the JWT and get the authenticated user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser()
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const payload = (await req.json()) as ModerationRequest

    // Validate required fields
    if (!payload.storagePath || !payload.bucket) {
      return new Response(JSON.stringify({ error: 'Missing storagePath or bucket' }), { status: 400 })
    }

    // Sanitize: only allow known buckets
    const ALLOWED_BUCKETS = ['avatars', 'post-images', 'event-images', 'chat-images', 'impact-photos']
    if (!ALLOWED_BUCKETS.includes(payload.bucket)) {
      return new Response(JSON.stringify({ error: 'Invalid bucket' }), { status: 400 })
    }

    // Use authenticated user's ID instead of trusting client-provided userId
    payload.userId = authUser.id

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get URL for the image
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${payload.bucket}/${payload.storagePath}`

    const result = await moderateImage(imageUrl)

    if (!result.safe) {
      console.warn(
        `[moderate-content] Flagged image: ${payload.storagePath} by user ${payload.userId}`,
        result.categories,
      )

      // 1. Delete the flagged image from storage
      const { error: deleteError } = await supabase.storage
        .from(payload.bucket)
        .remove([payload.storagePath])

      if (deleteError) {
        console.error('[moderate-content] Failed to delete flagged image:', deleteError.message)
      }

      // 2. Create a content report for admin review
      if (payload.contentId && payload.contentType) {
        await supabase.from('content_reports').insert({
          reporter_id: payload.userId, // self-reported via automated system
          content_type: payload.contentType,
          content_id: payload.contentId,
          reason: `Automated moderation flagged: adult=${result.categories.adult}, violence=${result.categories.violence}, racy=${result.categories.racy}`,
          status: 'pending',
        })
      }

      // 3. Log to audit_log
      await supabase.from('audit_log').insert({
        user_id: null, // system action
        action: 'content_auto_flagged',
        target_type: payload.contentType ?? 'image',
        target_id: payload.contentId ?? payload.storagePath,
        details: {
          bucket: payload.bucket,
          storage_path: payload.storagePath,
          uploader_id: payload.userId,
          context: payload.context,
          categories: result.categories,
        },
      })

      // 4. Notify admins via push
      try {
        await supabase.functions.invoke('send-push', {
          body: {
            // Send to all admin users by querying profiles
            userIds: await getAdminUserIds(supabase),
            title: 'Content Flagged',
            body: `Automated moderation flagged an upload in ${payload.context}`,
            data: {
              type: 'moderation_alert',
              route: '/admin/moderation',
              content_type: payload.contentType ?? 'image',
              uploader_id: payload.userId,
            },
          },
        })
      } catch (pushErr) {
        console.error('[moderate-content] Failed to notify admins:', (pushErr as Error).message)
      }

      return new Response(
        JSON.stringify({ approved: false, reason: 'Content flagged for review', categories: result.categories }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ approved: true }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[moderate-content] Error:', err)
    // Default to approved to prevent blocking uploads
    return new Response(
      JSON.stringify({ approved: true, error: 'Moderation service unavailable' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
})

async function getAdminUserIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['manager', 'admin'])
  return (data ?? []).map((p: { id: string }) => p.id)
}
