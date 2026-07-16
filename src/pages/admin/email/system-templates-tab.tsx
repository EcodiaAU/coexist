import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
  Save,
  Eye,
  Code2,
  RotateCcw,
  Mail,
  ChevronRight,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Header } from '@/components/header'
import { Skeleton } from '@/components/skeleton'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { sanitizeHtml } from './shared'

/* ================================================================== */
/*  Types & constants                                                  */
/* ================================================================== */

interface SystemEmailOverride {
  template_type: string
  hero_title: string | null
  hero_subtitle: string | null
  hero_emoji: string | null
  body_html: string | null
  subject: string | null
  cta_label: string | null
  cta_url: string | null
  enabled: boolean
  updated_at: string
}

interface TemplateInfo {
  type: string
  label: string
  category: 'transactional' | 'marketing'
  description: string
  defaultSubject: string
  defaultEmoji: string
  defaultHeroTitle: string
  defaultHeroSubtitle: string
  defaultCtaLabel: string
  defaultCtaUrl: string
  sampleData: Record<string, string | number | boolean>
}

const SYSTEM_TEMPLATES: TemplateInfo[] = [
  {
    type: 'welcome',
    label: 'Welcome',
    category: 'transactional',
    description: 'Sent after signup',
    defaultSubject: 'Welcome to Co-Exist!',
    defaultEmoji: '\u{1F331}',
    defaultHeroTitle: 'Welcome to Co-Exist!',
    defaultHeroSubtitle: "You're part of the movement now.",
    defaultCtaLabel: 'Open the App',
    defaultCtaUrl: 'https://app.coexistaus.org',
    sampleData: { name: 'Alex', app_url: 'https://app.coexistaus.org' },
  },
  {
    type: 'event_confirmation',
    label: 'Event Confirmation',
    category: 'transactional',
    description: 'Registration confirmation',
    defaultSubject: "You're registered: {{event_title}}",
    defaultEmoji: '\u{2705}',
    defaultHeroTitle: "You're registered!",
    defaultHeroSubtitle: '{{event_title}}',
    defaultCtaLabel: 'View Event Details',
    defaultCtaUrl: '{{event_url}}',
    sampleData: { name: 'Alex', event_title: 'Byron Beach Clean-Up', event_date: 'Sat 5 Apr 2026, 9:00 AM', event_location: 'Main Beach, Byron Bay', event_url: 'https://app.coexistaus.org/events/test' },
  },
  {
    type: 'event_reminder',
    label: 'Event Reminder',
    category: 'transactional',
    description: '24h / 2h before event',
    defaultSubject: 'Reminder: {{event_title}} is coming up',
    defaultEmoji: '\u{23F0}',
    defaultHeroTitle: 'Coming up soon!',
    defaultHeroSubtitle: '{{event_title}}',
    defaultCtaLabel: 'View Event',
    defaultCtaUrl: '{{event_url}}',
    sampleData: { name: 'Alex', event_title: 'Byron Beach Clean-Up', event_date: 'Tomorrow 9:00 AM', event_location: 'Main Beach, Byron Bay', event_url: 'https://app.coexistaus.org/events/test', time_until: 'tomorrow' },
  },
  {
    type: 'event_cancelled',
    label: 'Event Cancelled',
    category: 'transactional',
    description: 'Event cancellation notice',
    defaultSubject: 'Event cancelled: {{event_title}}',
    defaultEmoji: '\u{1F6AB}',
    defaultHeroTitle: 'Event Cancelled',
    defaultHeroSubtitle: '{{event_title}}',
    defaultCtaLabel: 'Browse Events',
    defaultCtaUrl: 'https://app.coexistaus.org/events',
    sampleData: { name: 'Alex', event_title: 'Byron Beach Clean-Up', event_date: 'Sat 5 Apr 2026', reason: 'Severe weather warning' },
  },
  {
    type: 'event_invite',
    label: 'Event Invite',
    category: 'transactional',
    description: 'Invited to an event',
    defaultSubject: '{{inviter_name}} invited you to {{event_title}}',
    defaultEmoji: '\u{1F389}',
    defaultHeroTitle: "You're Invited!",
    defaultHeroSubtitle: '{{event_title}}',
    defaultCtaLabel: 'View Invitation',
    defaultCtaUrl: '{{event_url}}',
    sampleData: { name: 'Alex', inviter_name: 'Sam', event_title: 'Byron Beach Clean-Up', event_url: 'https://app.coexistaus.org/events/test' },
  },
  {
    type: 'waitlist_promoted',
    label: 'Waitlist Promoted',
    category: 'transactional',
    description: 'Spot opened up',
    defaultSubject: "You're in! Spot available for {{event_title}}",
    defaultEmoji: '\u{1F389}',
    defaultHeroTitle: "You're In!",
    defaultHeroSubtitle: 'A spot opened up just for you.',
    defaultCtaLabel: 'View Event',
    defaultCtaUrl: '{{event_url}}',
    sampleData: { name: 'Alex', event_title: 'Byron Beach Clean-Up', event_date: 'Sat 5 Apr 2026', event_url: 'https://app.coexistaus.org/events/test' },
  },
  {
    type: 'password_reset',
    label: 'Password Reset',
    category: 'transactional',
    description: 'Password reset link',
    defaultSubject: 'Reset your password',
    defaultEmoji: '\u{1F510}',
    defaultHeroTitle: 'Reset Your Password',
    defaultHeroSubtitle: '',
    defaultCtaLabel: 'Reset Password',
    defaultCtaUrl: '{{reset_url}}',
    sampleData: { name: 'Alex', reset_url: 'https://app.coexistaus.org/reset?token=test' },
  },
  {
    type: 'donation_receipt',
    label: 'Donation Receipt',
    category: 'transactional',
    description: 'Donation confirmation',
    defaultSubject: 'Thanks for your donation!',
    defaultEmoji: '\u{1F49A}',
    defaultHeroTitle: 'Thank You for Your Donation!',
    defaultHeroSubtitle: '{{amount}} {{currency}}',
    defaultCtaLabel: 'View Your Impact',
    defaultCtaUrl: 'https://app.coexistaus.org/profile',
    sampleData: { name: 'Alex', amount: '$25.00', currency: 'AUD', date: '30 Mar 2026', receipt_url: 'https://app.coexistaus.org/receipts/test', is_recurring: false },
  },
  {
    type: 'order_confirmation',
    label: 'Order Confirmation',
    category: 'transactional',
    description: 'Merch order placed',
    defaultSubject: 'Order confirmed: #{{order_id}}',
    defaultEmoji: '\u{1F6CD}\u{FE0F}',
    defaultHeroTitle: 'Order Confirmed!',
    defaultHeroSubtitle: 'Order #{{order_id}}',
    defaultCtaLabel: 'View Order',
    defaultCtaUrl: 'https://app.coexistaus.org/merch/orders',
    sampleData: { name: 'Alex', order_id: 'TEST-001', items: 'Co-Exist Tee (M) x1', total: '$45.00', shipping_address: '1 Main St, Byron Bay NSW 2481' },
  },
  {
    type: 'order_shipped',
    label: 'Order Shipped',
    category: 'transactional',
    description: 'Order has shipped',
    defaultSubject: 'Your order #{{order_id}} has shipped!',
    defaultEmoji: '\u{1F4E6}',
    defaultHeroTitle: 'Your Order Has Shipped!',
    defaultHeroSubtitle: 'Order #{{order_id}}',
    defaultCtaLabel: 'Track Order',
    defaultCtaUrl: '{{tracking_url}}',
    sampleData: { name: 'Alex', order_id: 'TEST-001', tracking_number: 'AU123456789', tracking_url: 'https://auspost.com.au/track/AU123456789' },
  },
  {
    type: 'payment_failed',
    label: 'Payment Failed',
    category: 'transactional',
    description: 'Recurring payment issue',
    defaultSubject: 'Payment failed \u2014 action needed',
    defaultEmoji: '\u{26A0}\u{FE0F}',
    defaultHeroTitle: 'Payment Failed',
    defaultHeroSubtitle: 'Action needed to continue your support.',
    defaultCtaLabel: 'Update Payment',
    defaultCtaUrl: 'https://app.coexistaus.org/settings',
    sampleData: { name: 'Alex', amount: '$10.00', update_url: 'https://app.coexistaus.org/settings' },
  },
  {
    type: 'subscription_cancelled',
    label: 'Subscription Cancelled',
    category: 'transactional',
    description: 'Recurring donation stopped',
    defaultSubject: 'Your recurring donation has been cancelled',
    defaultEmoji: '\u{1F49B}',
    defaultHeroTitle: 'Donation Cancelled',
    defaultHeroSubtitle: "We'll miss your support.",
    defaultCtaLabel: 'Make a Donation',
    defaultCtaUrl: 'https://app.coexistaus.org/donate',
    sampleData: { name: 'Alex', donate_url: 'https://app.coexistaus.org/donate' },
  },
  {
    type: 'refund_confirmation',
    label: 'Refund Confirmation',
    category: 'transactional',
    description: 'Refund processed',
    defaultSubject: 'Refund processed for order #{{order_id}}',
    defaultEmoji: '\u{1F4B3}',
    defaultHeroTitle: 'Refund Processed',
    defaultHeroSubtitle: 'Order #{{order_id}}',
    defaultCtaLabel: '',
    defaultCtaUrl: '',
    sampleData: { name: 'Alex', order_id: 'TEST-001', refund_amount: '$45.00', currency: 'AUD' },
  },
  {
    type: 'collective_application',
    label: 'Collective Application',
    category: 'transactional',
    description: 'New application notification',
    defaultSubject: 'New Collective Application: {{applicant_name}}',
    defaultEmoji: '\u{1F64B}',
    defaultHeroTitle: 'New Collective Application',
    defaultHeroSubtitle: 'Someone wants to lead a collective!',
    defaultCtaLabel: 'Review Application',
    defaultCtaUrl: 'https://app.coexistaus.org/admin/applications',
    sampleData: { applicant_name: 'Jane Smith', applicant_email: 'jane@example.com', roles: 'Collective Leader', location: 'Gold Coast, QLD' },
  },
  {
    type: 'monthly_impact_recap',
    label: 'Impact Recap',
    category: 'marketing',
    description: 'Monthly impact summary',
    defaultSubject: 'Your {{month}} impact recap',
    defaultEmoji: '\u{1F30F}',
    defaultHeroTitle: 'Your {{month}} Impact',
    defaultHeroSubtitle: "Here's what you helped achieve.",
    defaultCtaLabel: 'View Full Stats',
    defaultCtaUrl: 'https://app.coexistaus.org/profile',
    sampleData: { name: 'Alex', events_count: '4', trees: '120', hours: '16', rubbish_kg: '35', month: 'March' },
  },
  {
    type: 'challenge_announcement',
    label: 'Challenge Announcement',
    category: 'marketing',
    description: 'New challenge launched',
    defaultSubject: 'New Challenge: {{challenge_title}}',
    defaultEmoji: '\u{1F525}',
    defaultHeroTitle: 'New Challenge!',
    defaultHeroSubtitle: '{{challenge_title}}',
    defaultCtaLabel: 'View Challenge',
    defaultCtaUrl: '{{challenge_url}}',
    sampleData: { name: 'Alex', challenge_title: 'Plant 10,000 Trees', challenge_description: 'Help us reach our biggest planting goal yet.', challenge_url: 'https://app.coexistaus.org/challenges/test' },
  },
  {
    type: 'newsletter',
    label: 'Newsletter',
    category: 'marketing',
    description: 'Monthly newsletter',
    defaultSubject: 'Co-Exist Monthly Update',
    defaultEmoji: '\u{1F4E8}',
    defaultHeroTitle: 'Co-Exist Update',
    defaultHeroSubtitle: '',
    defaultCtaLabel: '',
    defaultCtaUrl: '',
    sampleData: { name: 'Alex', content_html: '<p>Here is this month\'s newsletter content...</p>' },
  },
  {
    type: 'announcement_digest',
    label: 'Announcement Digest',
    category: 'marketing',
    description: 'Weekly digest',
    defaultSubject: 'This week at Co-Exist',
    defaultEmoji: '\u{1F4E3}',
    defaultHeroTitle: 'This Week at Co-Exist',
    defaultHeroSubtitle: '',
    defaultCtaLabel: 'Open App',
    defaultCtaUrl: 'https://app.coexistaus.org',
    sampleData: { name: 'Alex' },
  },
]

/* ================================================================== */
/*  Data hooks                                                         */
/* ================================================================== */

function useSystemOverrides() {
  return useQuery({
    queryKey: ['admin-system-email-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_email_overrides')
        .select('*')
        .order('template_type')
      if (error) throw error
      return (data ?? []) as SystemEmailOverride[]
    },
    staleTime: 30_000,
  })
}

/* ================================================================== */
/*  Template Editor                                                    */
/* ================================================================== */

function SystemTemplateEditor({
  template,
  override,
  onClose,
}: {
  template: TemplateInfo
  override?: SystemEmailOverride | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [heroTitle, setHeroTitle] = useState(override?.hero_title ?? template.defaultHeroTitle)
  const [heroSubtitle, setHeroSubtitle] = useState(override?.hero_subtitle ?? template.defaultHeroSubtitle)
  const [heroEmoji, setHeroEmoji] = useState(override?.hero_emoji ?? template.defaultEmoji)
  const [subject, setSubject] = useState(override?.subject ?? template.defaultSubject)
  const [bodyHtml, setBodyHtml] = useState(override?.body_html ?? '')
  const [ctaLabel, setCtaLabel] = useState(override?.cta_label ?? template.defaultCtaLabel)
  const [ctaUrl, setCtaUrl] = useState(override?.cta_url ?? template.defaultCtaUrl)
  const [enabled, setEnabled] = useState(override?.enabled ?? true)
  const [activeView, setActiveView] = useState<'preview' | 'html'>('preview')

  const hasCustomBody = bodyHtml.trim().length > 0

  // Build a preview of the email using the branded shell
  const previewHtml = useMemo(() => {
    const sampleName = template.sampleData.name || 'Alex'

    // Replace {{placeholders}} in all fields using sample data
    const replacePlaceholders = (str: string) => {
      let result = str
      for (const [key, value] of Object.entries(template.sampleData)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
      }
      return result
    }

    const resolvedTitle = replacePlaceholders(heroTitle)
    const resolvedSubtitle = replacePlaceholders(heroSubtitle)
    const resolvedBody = hasCustomBody ? replacePlaceholders(bodyHtml) : ''
    const resolvedCtaLabel = replacePlaceholders(ctaLabel)

    // Simplified preview shell matching the edge function's emailShell
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f7f0;padding:16px;">
        <div style="text-align:center;padding:0 0 16px;">
          <img src="https://app.coexistaus.org/logos/black-wordmark.png" alt="Co-Exist" width="100" style="width:100px;height:auto;" />
        </div>
        <div style="background:linear-gradient(135deg,#869e62 0%,#3d4d33 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;">
          ${heroEmoji ? `<div style="font-size:32px;margin-bottom:8px;">${heroEmoji}</div>` : ''}
          <h1 style="color:white;margin:0;font-size:20px;font-weight:700;line-height:1.3;">${resolvedTitle}</h1>
          ${resolvedSubtitle ? `<p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:14px;">${resolvedSubtitle}</p>` : ''}
        </div>
        <div style="background:white;padding:24px;border-left:1px solid #e8eddf;border-right:1px solid #e8eddf;">
          <p style="margin:0 0 16px;font-size:15px;color:#2d3a22;">Hey ${sampleName},</p>
          ${hasCustomBody
            ? `<div style="font-size:14px;color:#2d3a22;line-height:1.6;">${resolvedBody}</div>`
            : `<p style="font-size:13px;color:#6b7a5a;font-style:italic;margin:0;">Using default template body. Add custom body HTML to override.</p>`
          }
        </div>
        ${resolvedCtaLabel ? `
        <div style="background:white;padding:0 24px 24px;border-left:1px solid #e8eddf;border-right:1px solid #e8eddf;text-align:center;">
          <span style="display:inline-block;background:#869e62;color:white;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px;">${resolvedCtaLabel}</span>
        </div>` : ''}
        <div style="background:#f9faf7;padding:20px 24px;border-radius:0 0 16px 16px;border:1px solid #e8eddf;border-top:none;text-align:center;">
          <p style="margin:0;font-size:11px;color:#8a9a74;">Explore. Connect. Protect.</p>
          <p style="margin:6px 0 0;font-size:10px;color:#8a9a74;">Co-Exist Australia &middot; hello@coexistaus.org</p>
        </div>
      </div>
    `
  }, [heroTitle, heroSubtitle, heroEmoji, bodyHtml, ctaLabel, hasCustomBody, template.sampleData])

  // DOMPurify-sanitized preview for safe rendering
  const sanitizedPreview = useMemo(() => sanitizeHtml(previewHtml), [previewHtml])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        template_type: template.type,
        hero_title: heroTitle || null,
        hero_subtitle: heroSubtitle || null,
        hero_emoji: heroEmoji || null,
        body_html: bodyHtml.trim() || null,
        subject: subject || null,
        cta_label: ctaLabel || null,
        cta_url: ctaUrl || null,
        enabled,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('system_email_overrides')
        .upsert(payload, { onConflict: 'template_type' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-email-overrides'] })
      toast.success('Template saved')
      onClose()
    },
    onError: (err) => {
      toast.error((err as Error).message)
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('system_email_overrides')
        .delete()
        .eq('template_type', template.type)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-email-overrides'] })
      toast.success('Reset to defaults')
      onClose()
    },
    onError: (err) => {
      toast.error((err as Error).message)
    },
  })

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      // Save first, then send test
      const payload = {
        template_type: template.type,
        hero_title: heroTitle || null,
        hero_subtitle: heroSubtitle || null,
        hero_emoji: heroEmoji || null,
        body_html: bodyHtml.trim() || null,
        subject: subject || null,
        cta_label: ctaLabel || null,
        cta_url: ctaUrl || null,
        enabled: true, // always enable for test
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }
      await supabase
        .from('system_email_overrides')
        .upsert(payload, { onConflict: 'template_type' })

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: template.type,
          to: user?.email,
          data: template.sampleData,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-email-overrides'] })
      toast.success(`Test email sent to ${user?.email}`)
    },
    onError: (err) => {
      toast.error((err as Error).message)
    },
  })

  return (
    <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#0" className="space-y-4">
      <Header data-eos-id="src/pages/admin/email/system-templates-tab.tsx#1" title="" back onBack={onClose} />

      {/* Template info header */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#2" className="rounded-sm bg-white border border-neutral-100 p-4">
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#3" className="flex items-center justify-between gap-3">
          <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#4">
            <h3 data-eos-id="src/pages/admin/email/system-templates-tab.tsx#5" data-eos-var="template.label" data-eos-var-label="Label" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">{template.label}</h3>
            <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#6" data-eos-var="template.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="text-xs text-neutral-400 mt-0.5">{template.description}</p>
            <span data-eos-id="src/pages/admin/email/system-templates-tab.tsx#7" data-eos-var="template.category" data-eos-var-label="Category" data-eos-var-scope="prop" className={cn(
              'inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
              template.category === 'transactional' ? 'bg-info-100 text-info-700' : 'bg-secondary-100 text-secondary-700',
            )}>
              {template.category}
            </span>
          </div>
          <Toggle data-eos-id="src/pages/admin/email/system-templates-tab.tsx#8" checked={enabled} onChange={setEnabled} label="Active" />
        </div>
      </div>

      {/* Subject */}
      <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#9"
        label="Subject Line"
        placeholder={template.defaultSubject}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        helperText="Use {{variable}} for dynamic values"
      />

      {/* Hero section */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#10" className="space-y-3">
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#11" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Hero Banner</p>
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#12" className="grid gap-3 sm:grid-cols-[80px_1fr]">
          <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#13"
            label="Emoji"
            value={heroEmoji}
            onChange={(e) => setHeroEmoji(e.target.value)}
            placeholder={template.defaultEmoji}
          />
          <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#14"
            label="Title"
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            placeholder={template.defaultHeroTitle}
          />
        </div>
        <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#15"
          label="Subtitle"
          value={heroSubtitle}
          onChange={(e) => setHeroSubtitle(e.target.value)}
          placeholder={template.defaultHeroSubtitle}
        />
      </div>

      {/* CTA */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#16" className="space-y-3">
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#17" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Call to Action</p>
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#18" className="grid gap-3 sm:grid-cols-2">
          <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#19"
            label="Button Text"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder={template.defaultCtaLabel || 'No CTA'}
          />
          <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#20"
            label="Button URL"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder={template.defaultCtaUrl || 'No URL'}
          />
        </div>
      </div>

      {/* Custom body HTML */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#21" className="space-y-3">
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#22" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Body Content</p>
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#23" className="text-xs text-neutral-400 leading-relaxed">
          Leave blank to use the default built-in body. Add custom HTML to fully override the email body.
          Use {'{{variable}}'} placeholders for dynamic data.
        </p>

        {/* Preview / HTML toggle */}
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#24" className="flex gap-1 bg-neutral-50 rounded-sm p-1">
          <button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#25"
            onClick={() => setActiveView('preview')}
            className={cn(
              'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
              activeView === 'preview' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
            )}
          >
            <Eye data-eos-id="src/pages/admin/email/system-templates-tab.tsx#26" size={14} /> Preview
          </button>
          <button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#27"
            onClick={() => setActiveView('html')}
            className={cn(
              'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
              activeView === 'html' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
            )}
          >
            <Code2 data-eos-id="src/pages/admin/email/system-templates-tab.tsx#28" size={14} /> Body HTML
          </button>
        </div>

        {activeView === 'preview' ? (
          <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#29"
            className="rounded-sm bg-[#f5f7f0] border border-neutral-100 shadow-sm max-h-[600px] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
          />
        ) : (
          <Input data-eos-id="src/pages/admin/email/system-templates-tab.tsx#30"
            type="textarea"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            placeholder="<p>Custom body HTML here...</p>"
            rows={12}
            inputClassName="bg-surface-3 font-mono text-xs leading-relaxed"
          />
        )}
      </div>

      {/* Available variables */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#31" className="rounded-sm bg-neutral-50 border border-neutral-100 p-3">
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#32" className="text-[11px] font-semibold text-neutral-500 mb-2">Available Variables</p>
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#33" className="flex flex-wrap gap-1.5">
          {Object.keys(template.sampleData).map((key) => (
            <span data-eos-id="src/pages/admin/email/system-templates-tab.tsx#34" key={key} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white border border-neutral-100 text-neutral-600">
              {`{{${key}}}`}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#35" className="flex flex-col gap-2 sm:flex-row">
        {override && (
          <Button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#36"
            variant="ghost"
            size="sm"
            icon={<RotateCcw data-eos-id="src/pages/admin/email/system-templates-tab.tsx#37" size={14} />}
            onClick={() => resetMutation.mutate()}
            loading={resetMutation.isPending}
            className="text-warning-600"
          >
            Reset to Default
          </Button>
        )}
        <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#38" className="flex-1" />
        <Button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#39"
          variant="secondary"
          size="sm"
          icon={<Mail data-eos-id="src/pages/admin/email/system-templates-tab.tsx#40" size={14} />}
          onClick={() => sendTestMutation.mutate()}
          loading={sendTestMutation.isPending}
        >
          Send Test
        </Button>
        <Button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#41"
          variant="primary"
          size="sm"
          icon={<Save data-eos-id="src/pages/admin/email/system-templates-tab.tsx#42" size={14} />}
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  List View                                                          */
/* ================================================================== */

export function SystemTemplatesTab() {
  const { data: overrides, isLoading } = useSystemOverrides()
  const showLoading = useDelayedLoading(isLoading)
  const [editing, setEditing] = useState<TemplateInfo | null>(null)

  const overrideMap = useMemo(() => {
    const map = new Map<string, SystemEmailOverride>()
    for (const o of overrides ?? []) map.set(o.template_type, o)
    return map
  }, [overrides])

  if (editing) {
    return (
      <SystemTemplateEditor data-eos-id="src/pages/admin/email/system-templates-tab.tsx#43"
        template={editing}
        override={overrideMap.get(editing.type)}
        onClose={() => setEditing(null)}
      />
    )
  }

  const transactional = SYSTEM_TEMPLATES.filter((t) => t.category === 'transactional')
  const marketing = SYSTEM_TEMPLATES.filter((t) => t.category === 'marketing')

  return (
    <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#44" className="space-y-6">
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#45" className="rounded-sm bg-white border border-neutral-100 p-4">
        <h4 data-eos-id="src/pages/admin/email/system-templates-tab.tsx#46" className="text-sm font-semibold text-neutral-900">System Email Templates</h4>
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#47" className="text-xs text-neutral-400 mt-1 leading-relaxed">
          Customise the hero banner, subject line, body content, and CTA for every automated email Co-Exist sends.
          Changes take effect immediately. Unmodified templates use the built-in defaults.
        </p>
      </div>

      {showLoading ? (
        <Skeleton data-eos-id="src/pages/admin/email/system-templates-tab.tsx#48" variant="list-item" count={6} />
      ) : (
        <>
          <TemplateGroup data-eos-id="src/pages/admin/email/system-templates-tab.tsx#49"
            label="Transactional"
            description="Triggered by user actions"
            templates={transactional}
            overrideMap={overrideMap}
            onEdit={setEditing}
          />
          <TemplateGroup data-eos-id="src/pages/admin/email/system-templates-tab.tsx#50"
            label="Marketing"
            description="Campaigns & digests"
            templates={marketing}
            overrideMap={overrideMap}
            onEdit={setEditing}
          />
        </>
      )}
    </div>
  )
}

function TemplateGroup({
  label,
  description,
  templates,
  overrideMap,
  onEdit,
}: {
  label: string
  description: string
  templates: TemplateInfo[]
  overrideMap: Map<string, SystemEmailOverride>
  onEdit: (t: TemplateInfo) => void
}) {
  return (
    <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#51" className="space-y-2">
      <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#52">
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#53" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{label}</p>
        <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#54" className="text-[11px] text-neutral-400">{description}</p>
      </div>
      <StaggeredList data-eos-id="src/pages/admin/email/system-templates-tab.tsx#55" className="space-y-1.5">
        {templates.map((tpl) => {
          const override = overrideMap.get(tpl.type)
          const isCustomised = !!override
          const isDisabled = override?.enabled === false
          return (
            <StaggeredItem data-eos-id="src/pages/admin/email/system-templates-tab.tsx#56" key={tpl.type}>
              <button data-eos-id="src/pages/admin/email/system-templates-tab.tsx#57"
                type="button"
                onClick={() => onEdit(tpl)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-sm bg-white border transition-[shadow,transform] duration-150 cursor-pointer active:scale-[0.99]',
                  isDisabled ? 'border-error-200 opacity-60' : isCustomised ? 'border-success-200 shadow-sm' : 'border-neutral-100 hover:shadow-sm',
                )}
              >
                <span data-eos-id="src/pages/admin/email/system-templates-tab.tsx#58" data-eos-var="override.hero_emoji" data-eos-var-label="Hero emoji" data-eos-var-scope="prop" className="text-xl shrink-0">{override?.hero_emoji || tpl.defaultEmoji}</span>
                <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#59" className="flex-1 min-w-0 text-left">
                  <div data-eos-id="src/pages/admin/email/system-templates-tab.tsx#60" className="flex items-center gap-2">
                    <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#61" data-eos-var="tpl.label" data-eos-var-label="Label" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">{tpl.label}</p>
                    {isCustomised && (
                      <span data-eos-id="src/pages/admin/email/system-templates-tab.tsx#62" className={cn(
                        'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0',
                        isDisabled ? 'bg-error-100 text-error-600' : 'bg-success-100 text-success-700',
                      )}>
                        {isDisabled ? 'Disabled' : 'Customised'}
                      </span>
                    )}
                  </div>
                  <p data-eos-id="src/pages/admin/email/system-templates-tab.tsx#63" data-eos-var="override.subject" data-eos-var-label="Subject" data-eos-var-scope="prop" className="text-xs text-neutral-400 truncate mt-0.5">{override?.subject || tpl.defaultSubject}</p>
                </div>
                <ChevronRight data-eos-id="src/pages/admin/email/system-templates-tab.tsx#64" size={16} className="text-neutral-300 shrink-0" />
              </button>
            </StaggeredItem>
          )
        })}
      </StaggeredList>
    </div>
  )
}
