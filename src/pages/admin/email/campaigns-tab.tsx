import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
    Send,
    Users,
    Plus,
    Trash2,
    Copy,
    Eye,
    Edit3,
    CheckCircle2,
    MousePointerClick,
    Save,
    XCircle,
    AlertTriangle
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Header } from '@/components/header'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
    type EmailCampaign, useCampaigns,
    useTemplates,
    useTags,
    useCollectives,
    sanitizeHtml,
    formatDate,
    formatDateTime,
    extractTemplateVariables
} from './shared'
import { StatusBadge } from './shared-ui'

/* ================================================================== */
/*  Campaign Composer (Create/Edit)                                    */
/* ================================================================== */

function CampaignComposer({
  campaign,
  onClose,
  onSaved,
}: {
  campaign?: EmailCampaign | null
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: templates } = useTemplates()
  const { data: tags } = useTags()
  const { data: collectives } = useCollectives()

  const [name, setName] = useState(campaign?.name ?? '')
  const [subject, setSubject] = useState(campaign?.subject ?? '')
  const [bodyHtml, setBodyHtml] = useState(campaign?.body_html ?? '')
  const [bodyText, setBodyText] = useState(campaign?.body_text ?? '')
  const [targetAll, setTargetAll] = useState(campaign?.target_all ?? true)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(campaign?.target_tag_ids ?? [])
  const [selectedCollectiveIds, setSelectedCollectiveIds] = useState<string[]>(
    campaign?.target_collective_ids ?? [],
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState(campaign?.template_id ?? '')
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'compose' | 'audience' | 'preview'>('compose')

  // Template field values - filled in per-campaign
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [showHtmlEditor, setShowHtmlEditor] = useState(false)

  // Extract template variables
  const templateVars = useMemo(() => extractTemplateVariables(bodyHtml), [bodyHtml])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const tpl = templates?.find((t) => t.id === templateId)
    if (tpl) {
      setSubject(tpl.subject)
      setBodyHtml(tpl.body_html)
      setBodyText(tpl.body_text)
      if (!name) setName(tpl.name)
      // Reset field values when switching templates
      setFieldValues({})
    }
  }

  // Apply field values to the template HTML for preview / sending
  const resolvedHtml = useMemo(() => {
    let html = bodyHtml
    for (const [key, val] of Object.entries(fieldValues)) {
      html = html.replaceAll(`{{${key}}}`, val || `{{${key}}}`)
    }
    return html
  }, [bodyHtml, fieldValues])

  const resolvedText = useMemo(() => {
    let text = bodyText
    for (const [key, val] of Object.entries(fieldValues)) {
      text = text.replaceAll(`{{${key}}}`, val || `{{${key}}}`)
    }
    return text
  }, [bodyText, fieldValues])

  const updateField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const toggleCollective = (collectiveId: string) => {
    setSelectedCollectiveIds((prev) =>
      prev.includes(collectiveId)
        ? prev.filter((id) => id !== collectiveId)
        : [...prev, collectiveId],
    )
  }

  const handleSave = async (andSend = false) => {
    if (!name.trim() || !subject.trim()) {
      toast.error('Campaign name and subject are required')
      return
    }
    if (!resolvedHtml.trim()) {
      toast.error('Email body cannot be empty')
      return
    }

    setSaving(true)

    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      body_html: resolvedHtml,
      body_text: resolvedText,
      template_id: selectedTemplateId || null,
      target_all: targetAll,
      target_tag_ids: targetAll ? [] : selectedTagIds,
      target_collective_ids: targetAll ? [] : selectedCollectiveIds,
      status: andSend ? 'sending' as const : 'draft' as const,
      created_by: user?.id,
    }

    // Optimistic: add/update in cache and close immediately
    const tempId = campaign?.id ?? crypto.randomUUID()
    const optimistic: EmailCampaign = {
      id: tempId,
      ...payload,
      target_tag_ids: payload.target_tag_ids ?? [],
      target_collective_ids: payload.target_collective_ids ?? [],
      scheduled_at: null,
      sent_at: andSend ? new Date().toISOString() : null,
      total_recipients: 0,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_bounced: 0,
      total_unsubscribed: 0,
      created_by: user?.id ?? null,
      created_at: campaign?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    queryClient.setQueryData<EmailCampaign[]>(['admin-email-campaigns'], (old) => {
      const filtered = (old ?? []).filter((c) => c.id !== tempId)
      return [optimistic, ...filtered]
    })
    onSaved()

    try {
      let campaignId = campaign?.id

      if (campaign) {
        const { error } = await supabase
          .from('email_campaigns')
          .update(payload)
          .eq('id', campaign.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('email_campaigns')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        campaignId = data.id as string
      }

      if (andSend && campaignId) {
        const { error: sendErr } = await supabase.functions.invoke('send-campaign', {
          body: { campaign_id: campaignId },
        })
        if (sendErr) {
          toast.error('Campaign saved but sending failed. You can retry from the campaigns list.')
        } else {
          toast.success('Campaign is sending!')
        }
      } else {
        toast.success('Campaign saved as draft')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save campaign')
    } finally {
      setSaving(false)
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-marketing-stats'] })
    }
  }

  // All HTML content is sanitized via DOMPurify before rendering
  const sanitizedResolvedHtml = sanitizeHtml(resolvedHtml)
  const sanitizedCampaignBodyHtml = sanitizeHtml(resolvedHtml)

  return (
    <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#0" data-eos-v="2" className="space-y-5">
      <Header data-eos-id="src/pages/admin/email/campaigns-tab.tsx#1" title="" back onBack={onClose} />

      {/* Step tabs */}
      <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#2" className="flex gap-1 bg-white rounded-sm p-1">
        {(['compose', 'audience', 'preview'] as const).map((s) => (
          <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#3"
            key={s}
            onClick={() => setStep(s)}
            className={cn(
              'flex-1 min-h-11 flex items-center justify-center text-sm font-medium rounded-sm transition-colors duration-150 capitalize cursor-pointer',
              step === s
                ? 'bg-primary-50 shadow-sm text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-600',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Step: Compose */}
      {step === 'compose' && (
        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#4" className="space-y-4">
          {/* Template selection */}
          <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#5">
            <label data-eos-id="src/pages/admin/email/campaigns-tab.tsx#6" className="block text-xs font-medium text-neutral-400 mb-1.5">
              Email Template
            </label>
            <Dropdown data-eos-id="src/pages/admin/email/campaigns-tab.tsx#7"
              options={[
                { value: '', label: 'No template (write HTML directly)' },
                ...(templates ?? []).map((t) => ({ value: t.id, label: t.name })),
              ]}
              value={selectedTemplateId}
              onChange={handleTemplateSelect}
              placeholder="Choose a template..."
            />
            {!templates?.length && (
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#8" className="text-[11px] text-neutral-400 mt-1">
                No templates yet - create one in the Templates tab with AI
              </p>
            )}
          </div>

          <Input data-eos-id="src/pages/admin/email/campaigns-tab.tsx#9"
            label="Campaign Name"
            placeholder="e.g. March Newsletter"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input data-eos-id="src/pages/admin/email/campaigns-tab.tsx#10"
            label="Subject Line"
            placeholder="What subscribers will see in their inbox"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          {/* Template field inputs */}
          {templateVars.length > 0 && (
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#11" className="rounded-sm bg-white border border-neutral-100 shadow-sm p-4 space-y-3">
              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#12" className="flex items-center gap-2 mb-1">
                <Edit3 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#13" size={14} className="text-primary-500" />
                <h4 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#14" className="text-sm font-semibold text-neutral-900">Fill in template fields</h4>
              </div>
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#15" className="text-xs text-neutral-400">
                These fields come from your template. Fill them in for this campaign.
              </p>
              {templateVars.map((varName) => (
                <Input data-eos-id="src/pages/admin/email/campaigns-tab.tsx#16"
                  key={varName}
                  label={varName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  placeholder={`Enter ${varName.replace(/_/g, ' ')}...`}
                  value={fieldValues[varName] ?? ''}
                  onChange={(e) => updateField(varName, e.target.value)}
                />
              ))}
            </div>
          )}

          {/* Show/hide raw HTML editor for manual editing */}
          {bodyHtml && (
            <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#17"
              onClick={() => setShowHtmlEditor(!showHtmlEditor)}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Edit3 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#18" size={12} />
              {showHtmlEditor ? 'Hide' : 'Edit'} raw HTML
            </button>
          )}

          {showHtmlEditor && (
            <Input data-eos-id="src/pages/admin/email/campaigns-tab.tsx#19"
              type="textarea"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={14}
              inputClassName="bg-surface-3 font-mono text-xs leading-relaxed"
            />
          )}

          {/* No template selected - show blank HTML area */}
          {!selectedTemplateId && !bodyHtml && (
            <Input data-eos-id="src/pages/admin/email/campaigns-tab.tsx#20"
              type="textarea"
              label="Email Body (HTML)"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="Select a template above, or write raw HTML here..."
              rows={10}
              inputClassName="bg-surface-3 font-mono text-sm leading-relaxed"
            />
          )}

          {/* Preview with field values applied - sanitized via DOMPurify */}
          {bodyHtml && !showHtmlEditor && (
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#21">
              <label data-eos-id="src/pages/admin/email/campaigns-tab.tsx#22" className="block text-xs font-medium text-neutral-400 mb-1.5">Preview</label>
              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#23"
                className="prose prose-sm max-w-none text-neutral-900 rounded-sm bg-white p-4 border border-neutral-100 shadow-sm max-h-80 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizedResolvedHtml }}
              />
            </div>
          )}
        </div>
      )}

      {/* Step: Audience */}
      {step === 'audience' && (
        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#24" className="space-y-4">
          <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#25" className="rounded-sm bg-white shadow-sm border border-neutral-100 p-4">
            <Toggle data-eos-id="src/pages/admin/email/campaigns-tab.tsx#26"
              checked={targetAll}
              onChange={setTargetAll}
              label="Send to all subscribers"
              description="Everyone who has opted in to marketing emails"
            />
          </div>

          {!targetAll && (
            <>
              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#27" className="rounded-sm bg-white shadow-sm border border-neutral-100 p-4">
                <h4 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#28" className="text-sm font-semibold text-neutral-900 mb-2">Filter by tags</h4>
                <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#29" className="text-xs text-neutral-400 mb-3">
                  Recipients who have ANY of these tags will receive the email
                </p>
                {tags?.length ? (
                  <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#30" className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#31" data-eos-var="tag.name" data-eos-var-label="Name" data-eos-var-scope="item"
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'inline-flex items-center rounded-full text-sm font-medium px-3.5 min-h-11 transition-colors duration-150 cursor-pointer',
                          selectedTagIds.includes(tag.id)
                            ? 'ring-2 ring-offset-1 shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                        style={{
                          backgroundColor: `${tag.colour}20`,
                          color: tag.colour,
                        }}
                      >
                        {selectedTagIds.includes(tag.id) && <CheckCircle2 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#32" size={12} className="mr-1" />}
                        {tag.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#33" className="text-xs text-neutral-400 italic">No tags created yet</p>
                )}
              </div>

              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#34" className="rounded-sm bg-white shadow-sm border border-neutral-100 p-4">
                <h4 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#35" className="text-sm font-semibold text-neutral-900 mb-2">Filter by collectives</h4>
                <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#36" className="text-xs text-neutral-400 mb-3">
                  Members of selected collectives will receive the email
                </p>
                {collectives?.length ? (
                  <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#37" className="flex flex-wrap gap-2">
                    {collectives.map((c) => (
                      <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#38" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item"
                        key={c.id}
                        onClick={() => toggleCollective(c.id)}
                        className={cn(
                          'inline-flex items-center rounded-full text-sm font-medium px-3.5 min-h-11 transition-colors duration-150 cursor-pointer',
                          'bg-neutral-100 text-neutral-600',
                          selectedCollectiveIds.includes(c.id)
                            ? 'ring-2 ring-primary-500 ring-offset-1 shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        {selectedCollectiveIds.includes(c.id) && (
                          <CheckCircle2 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#39" size={12} className="mr-1" />
                        )}
                        {c.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#40" className="text-xs text-neutral-400 italic">No collectives found</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step: Preview - all HTML sanitized via DOMPurify */}
      {step === 'preview' && (
        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#41" className="space-y-4">
          <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#42" className="rounded-sm bg-white shadow-sm border border-neutral-100 overflow-hidden">
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#43" className="bg-neutral-50 px-4 py-3 border-b border-neutral-100">
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#44" className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                Subject
              </p>
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#45" className="text-sm font-medium text-neutral-900">{subject || 'No subject set'}</p>
            </div>
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#46" className="px-4 py-3 border-b border-neutral-100">
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#47" className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                Audience
              </p>
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#48" className="text-sm text-neutral-600">
                {targetAll
                  ? 'All opted-in subscribers'
                  : `${selectedTagIds.length} tag(s), ${selectedCollectiveIds.length} collective(s)`}
              </p>
            </div>
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#49" className="p-4">
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#50" className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Email Preview
              </p>
              {resolvedHtml ? (
                <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#51"
                  className="prose prose-sm max-w-none text-neutral-900 rounded-sm bg-neutral-50 p-4 border border-neutral-100"
                  dangerouslySetInnerHTML={{ __html: sanitizedCampaignBodyHtml }}
                />
              ) : (
                <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#52" className="text-sm text-neutral-400 italic">No content to preview</p>
              )}
            </div>
          </div>

          {/* Unfilled fields warning */}
          {templateVars.length > 0 && templateVars.some((v) => !fieldValues[v]) && (
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#53" className="rounded-sm bg-warning-50 border border-warning-200 p-3">
              <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#54" data-eos-var="fieldValues.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-xs font-medium text-warning-700">
                Some template fields are still empty:{' '}
                {templateVars.filter((v) => !fieldValues[v]).map((v) => `{{${v}}}`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#55" className="flex gap-2 pt-2">
        <Button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#56" variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#57"
          variant="secondary"
          onClick={() => handleSave(false)}
          loading={saving}
          icon={<Save data-eos-id="src/pages/admin/email/campaigns-tab.tsx#58" size={14} />}
          className="flex-1"
        >
          Save Draft
        </Button>
        <Button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#59"
          variant="primary"
          onClick={() => handleSave(true)}
          loading={saving}
          icon={<Send data-eos-id="src/pages/admin/email/campaigns-tab.tsx#60" size={14} />}
          className="flex-1"
          disabled={!name.trim() || !subject.trim() || !resolvedHtml.trim()}
        >
          Send Now
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Campaign Detail Sheet                                              */
/* ================================================================== */

function CampaignDetailSheet({
  open,
  onClose,
  campaign,
}: {
  open: boolean
  onClose: () => void
  campaign: EmailCampaign
}) {
  const rate = (n: number) =>
    campaign.total_recipients > 0
      ? `${((n / campaign.total_recipients) * 100).toFixed(1)}%`
      : '0%'

  // Sanitize HTML content via DOMPurify before rendering
  const sanitizedBodyHtml = campaign.body_html ? sanitizeHtml(campaign.body_html) : ''

  return (
    <BottomSheet data-eos-id="src/pages/admin/email/campaigns-tab.tsx#61" open={open} onClose={onClose} snapPoints={[0.75]}>
      <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#62" className="space-y-4">
        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#63">
          <h2 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#64" data-eos-var="campaign.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="font-heading text-lg font-semibold text-neutral-900">{campaign.name}</h2>
          <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#65" data-eos-var="campaign.subject" data-eos-var-label="Subject" data-eos-var-scope="prop" className="text-sm text-neutral-400 mt-0.5">{campaign.subject}</p>
        </div>

        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#66" className="flex items-center gap-2">
          <StatusBadge data-eos-id="src/pages/admin/email/campaigns-tab.tsx#67" status={campaign.status} />
          {campaign.sent_at && (
            <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#68" data-eos-var="campaign.sent_at" data-eos-var-label="Sent at" data-eos-var-scope="prop" className="text-xs text-neutral-400">Sent {formatDateTime(campaign.sent_at)}</span>
          )}
        </div>

        {campaign.status === 'sent' && (
          <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#69" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { label: 'Recipients', value: campaign.total_recipients, icon: <Users data-eos-id="src/pages/admin/email/campaigns-tab.tsx#70" size={12} /> },
              { label: 'Delivered', value: `${campaign.total_delivered} (${rate(campaign.total_delivered)})`, icon: <CheckCircle2 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#71" size={12} /> },
              { label: 'Opened', value: `${campaign.total_opened} (${rate(campaign.total_opened)})`, icon: <Eye data-eos-id="src/pages/admin/email/campaigns-tab.tsx#72" size={12} /> },
              { label: 'Clicked', value: `${campaign.total_clicked} (${rate(campaign.total_clicked)})`, icon: <MousePointerClick data-eos-id="src/pages/admin/email/campaigns-tab.tsx#73" size={12} /> },
              { label: 'Bounced', value: `${campaign.total_bounced} (${rate(campaign.total_bounced)})`, icon: <XCircle data-eos-id="src/pages/admin/email/campaigns-tab.tsx#74" size={12} /> },
              { label: 'Unsub\'d', value: `${campaign.total_unsubscribed} (${rate(campaign.total_unsubscribed)})`, icon: <AlertTriangle data-eos-id="src/pages/admin/email/campaigns-tab.tsx#75" size={12} /> },
            ].map(({ label, value, icon }) => (
              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#76" key={label} className="rounded-sm bg-neutral-50 p-3">
                <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#77" className="flex items-center gap-1 mb-0.5">
                  <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#78" className="text-neutral-400">{icon}</span>
                  <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#79" className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
                </div>
                <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#80" className="text-sm font-bold text-neutral-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        {sanitizedBodyHtml && (
          <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#81">
            <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#82" className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Content Preview
            </p>
            <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#83"
              className="prose prose-sm max-w-none text-neutral-900 rounded-sm bg-neutral-50 p-4 border border-neutral-100 max-h-60 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
            />
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

/* ================================================================== */
/*  Campaigns Tab                                                      */
/* ================================================================== */

export function CampaignsTab() {
  const { data: campaigns, isLoading } = useCampaigns()
  const showLoading = useDelayedLoading(isLoading)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<EmailCampaign | null>(null)
  const [viewing, setViewing] = useState<EmailCampaign | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    if (!campaigns) return []
    if (statusFilter === 'all') return campaigns
    return campaigns.filter((c) => c.status === statusFilter)
  }, [campaigns, statusFilter])

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin-email-campaigns'] })
      const prev = queryClient.getQueryData<EmailCampaign[]>(['admin-email-campaigns'])
      queryClient.setQueryData<EmailCampaign[]>(['admin-email-campaigns'], (old) =>
        (old ?? []).filter((c) => c.id !== id),
      )
      setDeletingId(null)
      return { prev }
    },
    onSuccess: () => toast.success('Campaign deleted'),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-email-campaigns'], ctx.prev)
      toast.error('Failed to delete campaign')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] }),
  })

  const duplicateCampaign = async (c: EmailCampaign) => {
    // Optimistic: add placeholder immediately
    const tempId = crypto.randomUUID()
    const optimistic: EmailCampaign = {
      ...c,
      id: tempId,
      name: `${c.name} (copy)`,
      status: 'draft',
      total_recipients: 0,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_bounced: 0,
      total_unsubscribed: 0,
      sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    queryClient.setQueryData<EmailCampaign[]>(['admin-email-campaigns'], (old) =>
      [optimistic, ...(old ?? [])],
    )
    toast.success('Campaign duplicated')

    const { error } = await supabase.from('email_campaigns').insert({
      name: `${c.name} (copy)`,
      subject: c.subject,
      body_html: c.body_html,
      body_text: c.body_text,
      template_id: c.template_id,
      target_all: c.target_all,
      target_tag_ids: c.target_tag_ids,
      target_collective_ids: c.target_collective_ids,
      status: 'draft',
    })
    if (error) {
      // Rollback
      queryClient.setQueryData<EmailCampaign[]>(['admin-email-campaigns'], (old) =>
        (old ?? []).filter((x) => x.id !== tempId),
      )
      toast.error('Failed to duplicate')
    }
    queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
  }

  if (composing || editing) {
    return (
      <CampaignComposer data-eos-id="src/pages/admin/email/campaigns-tab.tsx#84"
        campaign={editing}
        onClose={() => { setComposing(false); setEditing(null) }}
        onSaved={() => { setComposing(false); setEditing(null) }}
      />
    )
  }

  return (
    <>
      <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#85" className="flex items-center gap-2 mb-4">
        <Button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#86" variant="primary" size="sm" icon={<Plus data-eos-id="src/pages/admin/email/campaigns-tab.tsx#87" size={14} />} onClick={() => setComposing(true)} className="shrink-0 whitespace-nowrap">
          New Campaign
        </Button>
        <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#88" className="w-36 shrink-0">
          <Dropdown data-eos-id="src/pages/admin/email/campaigns-tab.tsx#89"
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'draft', label: 'Drafts' },
              { value: 'sent', label: 'Sent' },
              { value: 'sending', label: 'Sending' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Filter..."
          />
        </div>
      </div>

      {showLoading ? (
        <Skeleton data-eos-id="src/pages/admin/email/campaigns-tab.tsx#90" variant="list-item" count={5} />
      ) : !filtered?.length ? (
        <EmptyState data-eos-id="src/pages/admin/email/campaigns-tab.tsx#91"
          illustration="empty"
          title="No campaigns yet"
          description="Create your first email campaign to reach your subscribers"
          action={{ label: 'Create Campaign', onClick: () => setComposing(true) }}
        />
      ) : (
        <StaggeredList data-eos-id="src/pages/admin/email/campaigns-tab.tsx#92" className="space-y-2">
          {filtered.map((campaign) => (
            <StaggeredItem data-eos-id="src/pages/admin/email/campaigns-tab.tsx#93"
              key={campaign.id}
              className="bg-white rounded-sm shadow-sm p-4 cursor-pointer hover:shadow-sm transition-shadow"
            >
              <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#94" className="flex items-start justify-between gap-3" onClick={() => setViewing(campaign)}>
                <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#95" className="flex-1 min-w-0">
                  <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#96" className="flex items-center gap-2 mb-1">
                    <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#97" data-eos-var="campaign.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">{campaign.name}</p>
                    <StatusBadge data-eos-id="src/pages/admin/email/campaigns-tab.tsx#98" status={campaign.status} />
                  </div>
                  <p data-eos-id="src/pages/admin/email/campaigns-tab.tsx#99" data-eos-var="campaign.subject" data-eos-var-label="Subject" data-eos-var-scope="item" className="text-xs text-neutral-400 truncate">{campaign.subject}</p>
                  <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#100" className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                    {campaign.status === 'sent' && (
                      <>
                        <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#101" data-eos-var="campaign.total_recipients" data-eos-var-label="Total recipients" data-eos-var-scope="item" className="flex items-center gap-1"><Users data-eos-id="src/pages/admin/email/campaigns-tab.tsx#102" size={11} />{campaign.total_recipients}</span>
                        <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#103" data-eos-var="campaign.total_opened" data-eos-var-label="Total opened" data-eos-var-scope="item" className="flex items-center gap-1"><Eye data-eos-id="src/pages/admin/email/campaigns-tab.tsx#104" size={11} />{campaign.total_opened}</span>
                        <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#105" data-eos-var="campaign.total_clicked" data-eos-var-label="Total clicked" data-eos-var-scope="item" className="flex items-center gap-1"><MousePointerClick data-eos-id="src/pages/admin/email/campaigns-tab.tsx#106" size={11} />{campaign.total_clicked}</span>
                      </>
                    )}
                    <span data-eos-id="src/pages/admin/email/campaigns-tab.tsx#107" data-eos-var="campaign.created_at" data-eos-var-label="Created at" data-eos-var-scope="item">{formatDate(campaign.created_at)}</span>
                  </div>
                </div>
                <div data-eos-id="src/pages/admin/email/campaigns-tab.tsx#108" className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {campaign.status === 'draft' && (
                    <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#109" onClick={() => setEditing(campaign)} className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.98]" aria-label="Edit">
                      <Edit3 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#110" size={14} />
                    </button>
                  )}
                  <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#111" onClick={() => duplicateCampaign(campaign)} className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.98]" aria-label="Duplicate">
                    <Copy data-eos-id="src/pages/admin/email/campaigns-tab.tsx#112" size={14} />
                  </button>
                  <button data-eos-id="src/pages/admin/email/campaigns-tab.tsx#113" onClick={() => setDeletingId(campaign.id)} className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-error-100 hover:text-error-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.98]" aria-label="Delete">
                    <Trash2 data-eos-id="src/pages/admin/email/campaigns-tab.tsx#114" size={14} />
                  </button>
                </div>
              </div>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      {viewing && (
        <CampaignDetailSheet data-eos-id="src/pages/admin/email/campaigns-tab.tsx#115" open={!!viewing} onClose={() => setViewing(null)} campaign={viewing} />
      )}

      <ConfirmationSheet data-eos-id="src/pages/admin/email/campaigns-tab.tsx#116"
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteCampaign.mutate(deletingId)}
        title="Delete Campaign"
        description="This campaign and all its data will be permanently deleted."
        confirmLabel="Delete"
      />
    </>
  )
}
