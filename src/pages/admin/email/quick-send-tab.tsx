/**
 * Admin > Email > Quick Send.
 *
 * Tate 2026-06-10 brief: "extremely simple for the staff to use, but
 * extremely intuitive and powerful and flexible". The 6-tab power
 * surface (Campaigns, Templates, System, Subscribers, Tags, Delivery)
 * was the whole job-to-be-done for a tech-fluent admin, but for a
 * volunteer leader it's a maze. Quick Send is the new default landing
 * tab and absorbs the 90% path:
 *
 *   1. Describe the email in plain English
 *   2. Tap "Draft with AI" - generates a branded HTML body + subject
 *      that uses the per-recipient {{next_event_*}} variables when
 *      relevant (so one email lands personalised in every inbox)
 *   3. Pick audience (default: everyone subscribed)
 *   4. Send test to yourself first, then send to the list
 *
 * No template management, no separate tabs for editing. Power users
 * can still flip to Campaigns / Templates / Subscribers / Tags /
 * Delivery via the tab bar at the top of the page; this is the
 * non-power-user landing.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  Users,
  Tag as TagIcon,
  MapPin,
  Loader2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Mail,
  Bold,
  Italic,
  Link as LinkIcon,
  Heading2,
  ImagePlus,
  Image as ImageIcon,
  UserCircle2,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useAdminEventPhotos, type AdminEventPhoto } from '@/hooks/use-event-photos'
import {
  useTags,
  useCollectives,
  useEmailMarketingStats,
  sanitizeHtml,
} from './shared'

/* ================================================================== */
/*  Suggestion pills - one-click prompts that wire up to the AI draft */
/* ================================================================== */

const SUGGESTION_PILLS: { label: string; prompt: string }[] = [
  {
    label: 'Hype next event near them',
    prompt:
      'A short, friendly email hyping up each subscriber about their next collective event. Use {{name}}, {{next_event_title}}, {{next_event_date}}, {{next_event_collective}}, {{next_event_location}} and {{next_event_url}} so it lands personalised in every inbox. Warm grassroots tone. End with an RSVP button.',
  },
  {
    label: 'Monthly newsletter',
    prompt:
      'A monthly newsletter wrapping up what each collective has been up to. Greet by {{name}}, mention their next event with {{next_event_title}} on {{next_event_date}}, and link back to the app with {{next_event_url}}. Sections: "What we did", "What is coming up", "How to get involved".',
  },
  {
    label: 'Welcome new members',
    prompt:
      'A warm welcome email for new Co-Exist members. Greet by {{name}}, point them at their collective ({{next_event_collective}}) and their next event {{next_event_title}} on {{next_event_date}} at {{next_event_location}}. Friendly, grassroots tone. Suggest they download the app, follow the Instagram, and join the collective chat.',
  },
  {
    label: 'Event reminder this week',
    prompt:
      'A short reminder that an event is coming up. Greet by {{name}}, reference {{next_event_title}} on {{next_event_date_long}}, the location {{next_event_location}}, and link to {{next_event_url}}. Tone: friendly nudge from a mate, not a corporate reminder.',
  },
  {
    label: 'Call for new collective leaders',
    prompt:
      'A call for new collective leaders. Greet by {{name}}, mention how their local crew ({{next_event_collective}}) could use more leadership, and link to /lead-a-collective. Inspirational but practical. Mention training and support are provided.',
  },
]

/* ================================================================== */
/*  Quick Send component                                              */
/* ================================================================== */

type AudienceMode = 'all' | 'tag' | 'collective'

export function QuickSendTab() {
  const { user, profile } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: tags } = useTags()
  const { data: collectives } = useCollectives()
  const { data: stats } = useEmailMarketingStats()

  const [prompt, setPrompt] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [subject, setSubject] = useState('')

  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all')
  const [audienceTagIds, setAudienceTagIds] = useState<string[]>([])
  const [audienceCollectiveIds, setAudienceCollectiveIds] = useState<string[]>([])

  // Hero image (optional). When set, the four {{hero_*}} variables in
  // the AI body get substituted before the campaign row is inserted.
  // Focal point and overlay let admins keep heading text legible over
  // any photo. Image lives in the app-images public bucket.
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [heroFocalX, setHeroFocalX] = useState(50)
  const [heroFocalY, setHeroFocalY] = useState(50)
  const [heroOverlay, setHeroOverlay] = useState(0.35)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  // Recent event photos for the "choose from photos" path. Only
  // queried once the picker opens so the grid does not load on every
  // Quick Send mount.
  const { data: recentPhotos, isLoading: photosLoading } = useAdminEventPhotos(
    showPhotoPicker ? { limit: 60 } : { limit: 0 },
  )

  async function handleHeroUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB.')
      return
    }
    setUploadingHero(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const path = `email-heroes/${slug}`
      const { error: upErr } = await supabase.storage.from('app-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('app-images').getPublicUrl(path)
      setHeroImageUrl(urlData.publicUrl)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadingHero(false)
    }
  }

  // Resolve the hero to its final appearance. Authoritative on the
  // client because the AI is inconsistent about keeping the {{hero_*}}
  // tokens (it sometimes hardcodes e.g. rgba(0,0,0,0.35) and
  // background-position:50% 50%). The hero is campaign-level (one look
  // for the whole send), so baking it in is safe; the per-recipient
  // {{name}}/{{next_event_*}} tokens are never touched here.
  //
  // Rules:
  //  - no image  -> flat olive #879e62, NO dark wash (matches the
  //    homepage Impact band exactly).
  //  - with image -> the photo at the chosen focal point, with the
  //    chosen dark wash for legibility.
  // Works whether the hero still has tokens or was already baked, so it
  // re-derives correctly when the admin changes the photo/focal/wash.
  function normalizeHero(html: string): string {
    const hasImage = !!heroImageUrl.trim()
    let out = html
      .replace(/\{\{hero_image_url\}\}/g, hasImage ? heroImageUrl : '')
      .replace(/\{\{hero_focal_x\}\}/g, String(heroFocalX))
      .replace(/\{\{hero_focal_y\}\}/g, String(heroFocalY))
      .replace(/\{\{hero_overlay_opacity\}\}/g, hasImage ? String(heroOverlay) : '0')
    // The hero cell is the one carrying the olive #879e62 background.
    // The AI is inconsistent (sometimes no background-image at all, so
    // an added photo never showed). Rewrite that cell's style directly:
    // ensure it has the right background-image (real photo or none),
    // cover sizing, and the focal point. This is what guarantees an
    // added image actually renders.
    out = out.replace(
      /style="([^"]*?background-color\s*:\s*#879e62[^"]*?)"/gi,
      (_m, css: string) => {
        let s = css
        s = s.replace(/background-image\s*:\s*url\([^)]*\)\s*;?/gi, '')
        s = s.replace(/background-size\s*:\s*[^;"]*;?/gi, '')
        s = s.replace(/background-position\s*:\s*[^;"]*;?/gi, '')
        s = s.replace(/background-repeat\s*:\s*[^;"]*;?/gi, '')
        s = s.replace(/;\s*;/g, ';').trim()
        if (!s.endsWith(';')) s += ';'
        if (hasImage) {
          s += `background-image:url('${heroImageUrl}');background-size:cover;background-position:${heroFocalX}% ${heroFocalY}%;background-repeat:no-repeat;`
        }
        return `style="${s}"`
      },
    )

    // Force every black wash to the right alpha. With no image the wash
    // must be fully transparent so the olive shows flat.
    out = out.replace(
      /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[0-9.]+\s*\)/gi,
      hasImage ? `rgba(0,0,0,${heroOverlay})` : 'rgba(0,0,0,0)',
    )

    // Dark-mode safety net: clients wash out text when no color-scheme is
    // declared. Inject the light-only metas into <head> if the AI left
    // them out, so the palette is never remapped.
    if (/<head[^>]*>/i.test(out) && !/name=["']color-scheme["']/i.test(out)) {
      out = out.replace(
        /<head[^>]*>/i,
        (m) => `${m}\n<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">`,
      )
    }

    // CTA button: the orange #E8913A anchor often inherits a tall
    // line-height, which leaves a blank line of dead space under the
    // label. Force line-height:1 and inline-block so the button hugs
    // its text. Matches background:#E8913A or background-color:#E8913A.
    out = out.replace(
      /(<a\b[^>]*\bstyle=")([^"]*#e8913a[^"]*)(")/gi,
      (_m, pre: string, css: string, post: string) => {
        let s = css.replace(/line-height\s*:\s*[^;"]*;?/gi, '').trim()
        if (s && !s.endsWith(';')) s += ';'
        if (!/display\s*:/i.test(s)) s += 'display:inline-block;'
        s += 'line-height:1;'
        return pre + s + post
      },
    )
    return out
  }

  const [tweak, setTweak] = useState('')
  const [tweaking, setTweaking] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)

  // "Preview as a real subscriber". Pulls a handful of opted-in
  // subscribers; on select, resolves that person's next event and
  // fills the {{name}}/{{next_event_*}} variables so staff see exactly
  // what one recipient gets. Read-only; never mutates bodyHtml.
  const [previewSubId, setPreviewSubId] = useState<string>('')
  const { data: sampleSubs } = useQuery({
    queryKey: ['quick-send-sample-subs'],
    enabled: !!bodyHtml,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, email')
        .neq('marketing_opt_in', false)
        .not('email', 'is', null)
        .order('created_at', { ascending: false })
        .limit(12)
      if (error) throw error
      return (data ?? []) as { id: string; display_name: string | null; first_name: string | null; email: string | null }[]
    },
  })

  const { data: previewVars } = useQuery({
    queryKey: ['quick-send-preview-vars', previewSubId],
    enabled: !!previewSubId,
    queryFn: async () => {
      const sub = sampleSubs?.find((s) => s.id === previewSubId)
      const name = sub?.first_name || sub?.display_name || 'there'
      const { data } = await supabase.rpc('recipient_next_events', { p_user_ids: [previewSubId] })
      const evt = (data as { title: string; date_start: string; address: string | null; collective_name: string; event_id: string }[] | null)?.[0]
      const brand = (n: string) => {
        const t = (n || '').replace(/\s+collective\s*$/i, '').trim()
        return /^co-?exist\s/i.test(t) ? t : `Co-Exist ${t || 'your local crew'}`
      }
      if (!evt) {
        return {
          name,
          next_event_title: 'a Co-Exist event near you',
          next_event_date: 'soon',
          next_event_date_long: 'check the app for the next one near you',
          next_event_collective: 'your Co-Exist crew',
          next_event_location: '',
          next_event_url: 'https://app.coexistaus.org/events',
        }
      }
      const d = new Date(evt.date_start)
      return {
        name,
        next_event_title: evt.title,
        next_event_date: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
        next_event_date_long: d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        next_event_collective: brand(evt.collective_name),
        next_event_location: evt.address || '',
        next_event_url: `https://app.coexistaus.org/events/${evt.event_id}`,
      }
    },
  })

  // Sync the sanitized body into the editor DOM whenever the body
  // changes externally (initial draft, tweak, etc). Suspended while
  // the user is actively editing so contentEditable's live DOM is not
  // clobbered mid-stroke.
  useEffect(() => {
    if (!editorRef.current || editing) return
    // Show the resolved hero (olive or photo) in the preview so what
    // the admin sees matches what sends. normalizeHero leaves the
    // per-recipient {{name}}/{{next_event_*}} tokens as-is.
    editorRef.current.innerHTML = sanitizeHtml(normalizeHero(bodyHtml))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, editing, heroImageUrl, heroFocalX, heroFocalY, heroOverlay])

  // Apply a document.execCommand. Deprecated but the only standards-
  // adjacent path to inline formatting that does not need a third-
  // party editor. Email clients are forgiving about the resulting HTML.
  const execCmd = (cmd: string, value?: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    try {
      document.execCommand(cmd, false, value)
    } catch {
      /* swallow: contentEditable lives or dies by browser support */
    }
  }

  const handleLink = () => {
    const url = window.prompt('Link URL', 'https://')
    if (url && /^https?:\/\//i.test(url)) {
      execCmd('createLink', url)
    } else if (url) {
      toast.error('URL must start with http:// or https://')
    }
  }

  const audienceCount = useMemo(() => {
    if (audienceMode === 'all') return stats?.subscribers ?? 0
    // Heuristic: tag/collective scope is unknown without a server roundtrip.
    // Show a placeholder; the server resolves the real count at send time.
    return null
  }, [audienceMode, stats])

  const variablesDetected = useMemo(() => {
    const matches = bodyHtml.match(/\{\{next_event_[a-z_]+\}\}/g) || []
    return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, ''))))
  }, [bodyHtml])

  // Smooth-scroll to the preview once a draft is generated.
  useEffect(() => {
    if (bodyHtml && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [bodyHtml])

  const handleDraft = async (overridePrompt?: string) => {
    const effectivePrompt = (overridePrompt ?? prompt).trim()
    if (!effectivePrompt) {
      toast.error('Tell us what to send first.')
      return
    }
    setDrafting(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { prompt: effectivePrompt, mode: 'content' },
      })
      if (error) throw error
      const result = data as { success: boolean; html?: string; plainText?: string; error?: string }
      if (!result.success || !result.html) {
        throw new Error(result.error || 'Draft failed')
      }
      setBodyHtml(result.html)
      setBodyText(result.plainText || '')
      // Best-effort subject extraction: look for the first <h1>.
      const h1 = result.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
      if (h1 && !subject) {
        setSubject(h1[1].replace(/<[^>]*>/g, '').slice(0, 120).trim())
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'AI draft failed - try again')
    } finally {
      setDrafting(false)
    }
  }

  const handlePill = (p: (typeof SUGGESTION_PILLS)[number]) => {
    setPrompt(p.prompt)
    handleDraft(p.prompt)
  }

  // Tweak the existing draft by re-running the AI with the prior body
  // and a short instruction. Removes the need to edit HTML by hand.
  const handleTweak = async () => {
    if (!tweak.trim() || !bodyHtml) return
    setTweaking(true)
    try {
      const tweakPrompt = `Here is the current email HTML:\n\n${bodyHtml}\n\nApply this change and return the revised full HTML (no commentary, no markdown code fences):\n\n${tweak.trim()}`
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { prompt: tweakPrompt, mode: 'content' },
      })
      if (error) throw error
      const result = data as { success: boolean; html?: string; plainText?: string; error?: string }
      if (!result.success || !result.html) throw new Error(result.error || 'Tweak failed')
      setBodyHtml(result.html)
      setBodyText(result.plainText || '')
      setTweak('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Tweak failed - try again')
    } finally {
      setTweaking(false)
    }
  }

  const sendCampaign = useMutation({
    mutationFn: async ({ testOnly }: { testOnly: boolean }) => {
      if (!subject.trim() || !bodyHtml.trim()) {
        throw new Error('Subject and body are required.')
      }
      if (testOnly && !profile?.email) {
        throw new Error('No email on file to test-send to.')
      }
      const baseName = subject.trim().slice(0, 60) || 'Quick send'
      const name = testOnly ? `${baseName} (test)` : baseName
      const resolvedHtml = normalizeHero(bodyHtml)
      // Insert as draft. send-campaign promotes status to 'sending'
      // itself and rejects any row that is already in that state, so
      // the row has to land in 'draft' first or the function 400s.
      const payload = {
        name,
        subject: subject.trim(),
        body_html: resolvedHtml,
        body_text: bodyText || resolvedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        template_id: null,
        target_all: !testOnly && audienceMode === 'all',
        target_tag_ids: !testOnly && audienceMode === 'tag' ? audienceTagIds : [],
        target_collective_ids: !testOnly && audienceMode === 'collective' ? audienceCollectiveIds : [],
        status: 'draft' as const,
        created_by: user?.id,
      }
      const { data: row, error: insertErr } = await supabase
        .from('email_campaigns')
        .insert(payload)
        .select('id')
        .single()
      if (insertErr) throw insertErr
      const campaignId = row.id as string

      // Both test and bulk sends route through send-campaign so the
      // per-recipient {{next_event_*}} substitution + the campaign row
      // bookkeeping use the same pipeline. test_recipient_email
      // bypasses the audience resolver and sends one email to the
      // admin's own address with their own profile resolved.
      const body: { campaign_id: string; test_recipient_email?: string } = { campaign_id: campaignId }
      if (testOnly) body.test_recipient_email = profile?.email || ''
      const { error: sendErr } = await supabase.functions.invoke('send-campaign', { body })
      if (sendErr) throw sendErr
      return { testOnly, recipients: testOnly ? 1 : undefined }
    },
    onSuccess: (res) => {
      if (res?.testOnly) {
        toast.success(`Test sent to ${profile?.email}.`)
      } else {
        toast.success('Sending! Check the Campaigns tab for delivery progress.')
        // Reset the canvas for the next send.
        setPrompt('')
        setBodyHtml('')
        setBodyText('')
        setSubject('')
      }
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-marketing-stats'] })
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Send failed.')
    },
  })

  // safeHtml is no longer rendered via dangerouslySetInnerHTML now
  // that the preview is a contentEditable surface. The sanitised HTML
  // gets pushed into editorRef.current.innerHTML directly in the
  // bodyHtml/editing effect above. Kept as a no-op import target so
  // the sanitiser stays linted as "used" via the effect.
  void sanitizeHtml

  return (
    <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#0" data-eos-v="2" className="space-y-6 pb-24">
      {/* Step 1: prompt */}
      <section data-eos-id="src/pages/admin/email/quick-send-tab.tsx#1" className="rounded-md bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
        <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#2" className="flex items-center gap-2">
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#3" className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary-100 text-primary-700">
            <Sparkles data-eos-id="src/pages/admin/email/quick-send-tab.tsx#4" size={16} />
          </div>
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#5">
            <h2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#6" className="text-sm font-bold text-neutral-900">Tell us what to send</h2>
            <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#7" className="text-xs text-neutral-500">Plain English. The AI drafts a branded email for you.</p>
          </div>
        </div>

        <Input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#8"
          type="textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Hype up subscribers about their next event near them. Friendly tone, RSVP button."
          rows={3}
        />

        <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#9" className="flex flex-wrap gap-2">
          {SUGGESTION_PILLS.map((p) => (
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#10" data-eos-var="p.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal"
              key={p.label}
              type="button"
              onClick={() => handlePill(p)}
              disabled={drafting}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
                'bg-primary-50 text-primary-700 hover:bg-primary-100 ring-1 ring-primary-200/60',
                'disabled:opacity-60 disabled:cursor-wait',
              )}
            >
              <Sparkles data-eos-id="src/pages/admin/email/quick-send-tab.tsx#11" size={11} />
              {p.label}
            </button>
          ))}
        </div>

        <Button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#12"
          variant="primary"
          icon={drafting ? <Loader2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#13" size={14} className="animate-spin" /> : <Sparkles data-eos-id="src/pages/admin/email/quick-send-tab.tsx#14" size={14} />}
          onClick={() => handleDraft()}
          loading={drafting}
          disabled={!prompt.trim()}
        >
          {bodyHtml ? 'Redraft' : 'Draft with AI'}
        </Button>
      </section>

      {/* Optional: hero photo with focal point + overlay. Sits between
          prompt and preview so admins set the visual before reading
          the draft. Empty = solid olive hero (current default). */}
      {bodyHtml && (
        <section data-eos-id="src/pages/admin/email/quick-send-tab.tsx#15" className="rounded-md bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#16" className="flex items-center justify-between">
            <h2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#17" className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <ImagePlus data-eos-id="src/pages/admin/email/quick-send-tab.tsx#18" size={14} className="text-primary-700" />
              Hero photo
              <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#19" className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">optional</span>
            </h2>
            {heroImageUrl && (
              <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#20"
                type="button"
                onClick={() => setHeroImageUrl('')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 cursor-pointer"
              >
                <X data-eos-id="src/pages/admin/email/quick-send-tab.tsx#21" size={11} />
                Remove
              </button>
            )}
          </div>

          {!heroImageUrl && !showPhotoPicker && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#22" className="rounded-sm border-2 border-dashed border-neutral-200 p-5 text-center space-y-3">
              <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#23" className="text-sm text-neutral-600">
                Add a photo and the hero becomes that photo with a dark wash so the
                heading stays legible. Skip for the solid olive look.
              </p>
              <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#24" className="flex flex-wrap items-center justify-center gap-2">
                <label data-eos-id="src/pages/admin/email/quick-send-tab.tsx#25" className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-primary-50 text-primary-700 ring-1 ring-primary-200/60 hover:bg-primary-100 text-sm font-medium cursor-pointer">
                  {uploadingHero ? <Loader2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#26" size={14} className="animate-spin" /> : <ImagePlus data-eos-id="src/pages/admin/email/quick-send-tab.tsx#27" size={14} />}
                  {uploadingHero ? 'Uploading...' : 'Upload a photo'}
                  <input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#28"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingHero}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleHeroUpload(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#29"
                  type="button"
                  onClick={() => setShowPhotoPicker(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100 text-sm font-medium cursor-pointer"
                >
                  <ImageIcon data-eos-id="src/pages/admin/email/quick-send-tab.tsx#30" size={14} />
                  Choose from event photos
                </button>
              </div>
            </div>
          )}

          {!heroImageUrl && showPhotoPicker && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#31" className="rounded-sm border border-neutral-200 p-4 space-y-3">
              <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#32" className="flex items-center justify-between">
                <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#33" className="text-sm font-semibold text-neutral-900">Recent event photos</p>
                <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#34"
                  type="button"
                  onClick={() => setShowPhotoPicker(false)}
                  className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 cursor-pointer"
                >
                  Back
                </button>
              </div>
              {photosLoading ? (
                <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#35" className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#36" key={i} className="aspect-square rounded-sm bg-neutral-100 animate-pulse" />
                  ))}
                </div>
              ) : !recentPhotos?.length ? (
                <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#37" className="text-xs text-neutral-500 py-6 text-center">
                  No event photos yet. Upload one instead.
                </p>
              ) : (
                <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#38" className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto">
                  {recentPhotos
                    .filter((p: AdminEventPhoto) => p.url && !p.storage_path?.match(/\.(mp4|mov|webm|m4v)$/i))
                    .map((p: AdminEventPhoto) => (
                      <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#39"
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setHeroImageUrl(p.url as string)
                          setShowPhotoPicker(false)
                        }}
                        className="group relative aspect-square rounded-sm overflow-hidden ring-1 ring-neutral-200 hover:ring-2 hover:ring-primary-500 cursor-pointer"
                        title={`${p.event_title} - ${p.collective_name}`}
                      >
                        <img data-eos-src="dynamic" data-eos-src-label="Url" data-eos-id="src/pages/admin/email/quick-send-tab.tsx#40"
                          src={p.url as string}
                          alt={p.caption ?? p.event_title}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {heroImageUrl && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#41" className="space-y-3">
              <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#42"
                className="relative rounded-sm overflow-hidden ring-1 ring-neutral-200"
                style={{
                  backgroundImage: `url('${heroImageUrl}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: `${heroFocalX}% ${heroFocalY}%`,
                  height: 180,
                }}
              >
                <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#43"
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: `rgba(0,0,0,${heroOverlay})` }}
                >
                  <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#44" className="text-white font-heading text-base font-bold drop-shadow">
                    Heading preview
                  </p>
                </div>
                <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#45"
                  className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-white ring-2 ring-primary-600 pointer-events-none"
                  style={{ left: `${heroFocalX}%`, top: `${heroFocalY}%` }}
                  aria-label="Focal point"
                />
              </div>
              <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#46" className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label data-eos-id="src/pages/admin/email/quick-send-tab.tsx#47" className="space-y-1">
                  <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#48" className="font-semibold text-neutral-700">Focal point horizontal</span>
                  <input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#49"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={heroFocalX}
                    onChange={(e) => setHeroFocalX(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                </label>
                <label data-eos-id="src/pages/admin/email/quick-send-tab.tsx#50" className="space-y-1">
                  <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#51" className="font-semibold text-neutral-700">Focal point vertical</span>
                  <input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#52"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={heroFocalY}
                    onChange={(e) => setHeroFocalY(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                </label>
                <label data-eos-id="src/pages/admin/email/quick-send-tab.tsx#53" className="space-y-1">
                  <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#54" data-eos-var="Math.round" data-eos-var-label="Round" data-eos-var-scope="prop" className="font-semibold text-neutral-700">
                    Dark overlay {Math.round(heroOverlay * 100)}%
                  </span>
                  <input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#55"
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={heroOverlay * 100}
                    onChange={(e) => setHeroOverlay(Number(e.target.value) / 100)}
                    className="w-full accent-primary-600"
                  />
                </label>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Step 2: subject + body preview + plain-English tweak. No raw
          HTML editing. Staff describe the change ("make it shorter",
          "drop the bit about RSVPs", "warmer tone") and the AI rewrites. */}
      {bodyHtml && (
        <section data-eos-id="src/pages/admin/email/quick-send-tab.tsx#56" ref={previewRef} className="rounded-md bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
          <h2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#57" className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Eye data-eos-id="src/pages/admin/email/quick-send-tab.tsx#58" size={14} className="text-primary-700" />
            Preview
          </h2>

          <Input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#59"
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder='e.g. "Coming up: {{next_event_title}}"'
          />

          {variablesDetected.length > 0 && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#60" className="flex flex-wrap items-center gap-1.5">
              <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#61" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Personalised per recipient
              </span>
              {variablesDetected.map((v) => (
                <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#62" key={v} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}

          {/* Inline-edit toolbar. Standard inline formatting (bold,
              italic, link) + a centring helper for the active block,
              so admins can fix off-centre buttons without touching HTML. */}
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#63" className="flex flex-wrap items-center gap-1 px-1">
            <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#64" className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mr-1">Edit inline</span>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#65"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execCmd('bold') }}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Bold"
            >
              <Bold data-eos-id="src/pages/admin/email/quick-send-tab.tsx#66" size={13} />
            </button>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#67"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execCmd('italic') }}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Italic"
            >
              <Italic data-eos-id="src/pages/admin/email/quick-send-tab.tsx#68" size={13} />
            </button>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#69"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execCmd('formatBlock', 'H2') }}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Heading"
            >
              <Heading2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#70" size={13} />
            </button>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#71"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleLink() }}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Link"
            >
              <LinkIcon data-eos-id="src/pages/admin/email/quick-send-tab.tsx#72" size={13} />
            </button>
            <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#73" className="mx-1 text-neutral-300">|</span>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#74"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execCmd('justifyCenter') }}
              className="text-[11px] font-medium px-2 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Centre"
            >
              Centre
            </button>
            <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#75"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execCmd('justifyLeft') }}
              className="text-[11px] font-medium px-2 h-7 rounded-md hover:bg-neutral-100 cursor-pointer"
              aria-label="Left-align"
            >
              Left
            </button>
          </div>

          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#76"
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setEditing(true)}
            onBlur={(e) => {
              setBodyHtml(e.currentTarget.innerHTML)
              setEditing(false)
            }}
            className="prose prose-sm max-w-none rounded-sm border border-neutral-200 bg-neutral-50 p-4 max-h-[480px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary-300 focus:bg-white"
          />
          <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#77" className="text-[11px] text-neutral-400 pl-1">
            Click in the preview to type. Changes save when you click away.
          </p>

          {/* Preview as a real subscriber. Only shown when the body
              uses per-recipient variables, since that is the only time
              the resolved view differs from the editable one. */}
          {variablesDetected.length > 0 && (sampleSubs?.length ?? 0) > 0 && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#78" className="rounded-sm border border-neutral-200 p-3 space-y-2">
              <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#79" className="flex flex-wrap items-center gap-2">
                <UserCircle2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#80" size={14} className="text-primary-700" />
                <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#81" className="text-xs font-semibold text-neutral-900">See it as</span>
                <select data-eos-id="src/pages/admin/email/quick-send-tab.tsx#82"
                  value={previewSubId}
                  onChange={(e) => setPreviewSubId(e.target.value)}
                  className="text-xs rounded-sm border border-neutral-200 bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option data-eos-id="src/pages/admin/email/quick-send-tab.tsx#83" value="">Pick a subscriber...</option>
                  {sampleSubs!.map((s) => (
                    <option data-eos-id="src/pages/admin/email/quick-send-tab.tsx#84" data-eos-var="s.first_name" data-eos-var-label="First name" data-eos-var-scope="item" key={s.id} value={s.id}>
                      {s.first_name || s.display_name || s.email}
                    </option>
                  ))}
                </select>
                {previewSubId && (
                  <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#85"
                    type="button"
                    onClick={() => setPreviewSubId('')}
                    className="text-[11px] font-medium text-neutral-500 hover:text-neutral-700 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              {previewSubId && previewVars && (
                <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#86"
                  className="prose prose-sm max-w-none rounded-sm border border-neutral-200 bg-white p-3 max-h-[420px] overflow-y-auto"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(
                      normalizeHero(bodyHtml).replace(
                        /\{\{(name|next_event_title|next_event_date|next_event_date_long|next_event_collective|next_event_location|next_event_url|unsubscribe_url)\}\}/g,
                        (_m, k: string) =>
                          k === 'unsubscribe_url'
                            ? 'https://app.coexistaus.org/unsubscribe'
                            : String((previewVars as Record<string, string>)[k] ?? ''),
                      ),
                    ),
                  }}
                />
              )}
            </div>
          )}

          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#87" className="rounded-sm bg-primary-50/70 border border-primary-200/60 p-3 space-y-2">
            <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#88" className="text-xs font-semibold text-primary-900">
              Want to change something? Tell the AI in plain words.
            </p>
            <Input data-eos-id="src/pages/admin/email/quick-send-tab.tsx#89"
              type="textarea"
              value={tweak}
              onChange={(e) => setTweak(e.target.value)}
              placeholder='e.g. "Make it shorter and warmer", "Drop the RSVP section", "Open with a question instead"'
              rows={2}
            />
            <Button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#90"
              variant="secondary"
              size="sm"
              icon={tweaking ? <Loader2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#91" size={13} className="animate-spin" /> : <Sparkles data-eos-id="src/pages/admin/email/quick-send-tab.tsx#92" size={13} />}
              onClick={handleTweak}
              loading={tweaking}
              disabled={!tweak.trim()}
            >
              Apply this tweak
            </Button>
          </div>
        </section>
      )}

      {/* Step 3: audience */}
      {bodyHtml && (
        <section data-eos-id="src/pages/admin/email/quick-send-tab.tsx#93" className="rounded-md bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#94" className="flex items-center justify-between">
            <h2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#95" className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Users data-eos-id="src/pages/admin/email/quick-send-tab.tsx#96" size={14} className="text-primary-700" />
              Who gets it
            </h2>
            <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#97" data-eos-var="stats.subscribers" data-eos-var-label="Subscribers" data-eos-var-scope="prop" className="text-[11px] text-neutral-500">
              {audienceMode === 'all' ? `${stats?.subscribers ?? 0} subscribers` : 'Resolved at send'}
            </span>
          </div>

          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#98" className="flex flex-wrap gap-2">
            {(
              [
                { value: 'all' as const, label: `Everyone (${stats?.subscribers ?? 0})`, icon: <Users data-eos-id="src/pages/admin/email/quick-send-tab.tsx#99" size={12} /> },
                { value: 'collective' as const, label: 'Pick collectives', icon: <MapPin data-eos-id="src/pages/admin/email/quick-send-tab.tsx#100" size={12} /> },
                { value: 'tag' as const, label: 'Pick tags', icon: <TagIcon data-eos-id="src/pages/admin/email/quick-send-tab.tsx#101" size={12} /> },
              ]
            ).map((opt) => (
              <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#102" data-eos-var="opt.icon,opt.label" data-eos-var-label="Icon, Label" data-eos-var-scope="item"
                key={opt.value}
                type="button"
                onClick={() => setAudienceMode(opt.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
                  audienceMode === opt.value
                    ? 'bg-primary-600 text-white ring-1 ring-primary-700'
                    : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {audienceMode === 'tag' && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#103" className="flex flex-wrap gap-2 pt-1">
              {(tags ?? []).map((t) => {
                const active = audienceTagIds.includes(t.id)
                return (
                  <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#104" data-eos-var="t.name" data-eos-var-label="Name" data-eos-var-scope="item"
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setAudienceTagIds((prev) =>
                        active ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
                    )}
                  >
                    <TagIcon data-eos-id="src/pages/admin/email/quick-send-tab.tsx#105" size={10} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}

          {audienceMode === 'collective' && (
            <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#106" className="flex flex-wrap gap-2 pt-1">
              {(collectives ?? []).map((c) => {
                const active = audienceCollectiveIds.includes(c.id)
                return (
                  <button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#107" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item"
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setAudienceCollectiveIds((prev) =>
                        active ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
                    )}
                  >
                    <MapPin data-eos-id="src/pages/admin/email/quick-send-tab.tsx#108" size={10} />
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Step 4: send */}
      {bodyHtml && (
        <section data-eos-id="src/pages/admin/email/quick-send-tab.tsx#109" className="rounded-md bg-primary-50/70 border border-primary-200/70 p-5 space-y-3">
          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#110" className="flex items-center gap-2">
            <CheckCircle2 data-eos-id="src/pages/admin/email/quick-send-tab.tsx#111" size={16} className="text-primary-700" />
            <p data-eos-id="src/pages/admin/email/quick-send-tab.tsx#112" className="text-sm font-semibold text-primary-900">
              Test it on yourself first, then send to the list.
            </p>
          </div>

          <div data-eos-id="src/pages/admin/email/quick-send-tab.tsx#113" className="flex flex-wrap items-center gap-3">
            <Button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#114" data-eos-var="profile.email" data-eos-var-label="Email" data-eos-var-scope="prop"
              variant="secondary"
              icon={<Mail data-eos-id="src/pages/admin/email/quick-send-tab.tsx#115" size={14} />}
              loading={sendCampaign.isPending && sendCampaign.variables?.testOnly === true}
              onClick={() => sendCampaign.mutate({ testOnly: true })}
              disabled={!profile?.email || !subject.trim()}
            >
              Send test to {profile?.email || 'me'}
            </Button>

            <Button data-eos-id="src/pages/admin/email/quick-send-tab.tsx#116"
              variant="primary"
              icon={<Send data-eos-id="src/pages/admin/email/quick-send-tab.tsx#117" size={14} />}
              loading={sendCampaign.isPending && sendCampaign.variables?.testOnly === false}
              onClick={() => {
                const confirmMessage =
                  audienceMode === 'all'
                    ? `Send to all ${stats?.subscribers ?? 0} subscribers?`
                    : audienceMode === 'tag' && audienceTagIds.length === 0
                      ? 'Pick at least one tag first.'
                      : audienceMode === 'collective' && audienceCollectiveIds.length === 0
                        ? 'Pick at least one collective first.'
                        : 'Send now?'
                if (audienceMode === 'tag' && audienceTagIds.length === 0) {
                  toast.error('Pick at least one tag.')
                  return
                }
                if (audienceMode === 'collective' && audienceCollectiveIds.length === 0) {
                  toast.error('Pick at least one collective.')
                  return
                }
                if (window.confirm(confirmMessage)) {
                  sendCampaign.mutate({ testOnly: false })
                }
              }}
              disabled={!subject.trim()}
            >
              Send now
              {audienceMode === 'all' && audienceCount != null
                ? ` (${audienceCount})`
                : ''}
            </Button>

            {sendCampaign.isError && (
              <span data-eos-id="src/pages/admin/email/quick-send-tab.tsx#118" data-eos-var="sendCampaign.error" data-eos-var-label="Error" data-eos-var-scope="prop" className="text-xs text-error-600 flex items-center gap-1">
                <AlertCircle data-eos-id="src/pages/admin/email/quick-send-tab.tsx#119" size={12} />
                {(sendCampaign.error as Error)?.message || 'Send failed'}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
