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
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
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

  const [tweak, setTweak] = useState('')
  const [tweaking, setTweaking] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

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
      const payload = {
        name,
        subject: subject.trim(),
        body_html: bodyHtml,
        body_text: bodyText || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        template_id: null,
        target_all: !testOnly && audienceMode === 'all',
        target_tag_ids: !testOnly && audienceMode === 'tag' ? audienceTagIds : [],
        target_collective_ids: !testOnly && audienceMode === 'collective' ? audienceCollectiveIds : [],
        status: 'sending' as const,
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

  const safeHtml = useMemo(() => sanitizeHtml(bodyHtml), [bodyHtml])

  return (
    <div className="space-y-6 pb-24">
      {/* Step 1: prompt */}
      <section className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Tell us what to send</h2>
            <p className="text-xs text-neutral-500">Plain English. The AI drafts a branded email for you.</p>
          </div>
        </div>

        <Input
          type="textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Hype up subscribers about their next event near them. Friendly tone, RSVP button."
          rows={3}
        />

        <div className="flex flex-wrap gap-2">
          {SUGGESTION_PILLS.map((p) => (
            <button
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
              <Sparkles size={11} />
              {p.label}
            </button>
          ))}
        </div>

        <Button
          variant="primary"
          icon={drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          onClick={() => handleDraft()}
          loading={drafting}
          disabled={!prompt.trim()}
        >
          {bodyHtml ? 'Redraft' : 'Draft with AI'}
        </Button>
      </section>

      {/* Step 2: subject + body preview + plain-English tweak. No raw
          HTML editing. Staff describe the change ("make it shorter",
          "drop the bit about RSVPs", "warmer tone") and the AI rewrites. */}
      {bodyHtml && (
        <section ref={previewRef} className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Eye size={14} className="text-primary-700" />
            Preview
          </h2>

          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder='e.g. "Coming up: {{next_event_title}}"'
          />

          {variablesDetected.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Personalised per recipient
              </span>
              {variablesDetected.map((v) => (
                <span key={v} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose prose-sm max-w-none rounded-xl border border-neutral-200 bg-neutral-50 p-4 max-h-[480px] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />

          <div className="rounded-xl bg-primary-50/70 border border-primary-200/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-primary-900">
              Want to change something? Tell the AI in plain words.
            </p>
            <Input
              type="textarea"
              value={tweak}
              onChange={(e) => setTweak(e.target.value)}
              placeholder='e.g. "Make it shorter and warmer", "Drop the RSVP section", "Open with a question instead"'
              rows={2}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={tweaking ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
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
        <section className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Users size={14} className="text-primary-700" />
              Who gets it
            </h2>
            <span className="text-[11px] text-neutral-500">
              {audienceMode === 'all' ? `${stats?.subscribers ?? 0} subscribers` : 'Resolved at send'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'all' as const, label: `Everyone (${stats?.subscribers ?? 0})`, icon: <Users size={12} /> },
                { value: 'collective' as const, label: 'Pick collectives', icon: <MapPin size={12} /> },
                { value: 'tag' as const, label: 'Pick tags', icon: <TagIcon size={12} /> },
              ]
            ).map((opt) => (
              <button
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
            <div className="flex flex-wrap gap-2 pt-1">
              {(tags ?? []).map((t) => {
                const active = audienceTagIds.includes(t.id)
                return (
                  <button
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
                    <TagIcon size={10} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}

          {audienceMode === 'collective' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(collectives ?? []).map((c) => {
                const active = audienceCollectiveIds.includes(c.id)
                return (
                  <button
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
                    <MapPin size={10} />
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
        <section className="rounded-2xl bg-primary-50/70 border border-primary-200/70 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-primary-700" />
            <p className="text-sm font-semibold text-primary-900">
              Test it on yourself first, then send to the list.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              icon={<Mail size={14} />}
              loading={sendCampaign.isPending && sendCampaign.variables?.testOnly === true}
              onClick={() => sendCampaign.mutate({ testOnly: true })}
              disabled={!profile?.email || !subject.trim()}
            >
              Send test to {profile?.email || 'me'}
            </Button>

            <Button
              variant="primary"
              icon={<Send size={14} />}
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
              <span className="text-xs text-error-600 flex items-center gap-1">
                <AlertCircle size={12} />
                {(sendCampaign.error as Error)?.message || 'Send failed'}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
