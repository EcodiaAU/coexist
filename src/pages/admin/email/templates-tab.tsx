import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
  Plus,
  Trash2,
  Eye,
  Edit3,
  Save,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Header } from '@/components/header'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  type EmailTemplate,
  useTemplates,
  sanitizeHtml,
  formatDate,
  extractTemplateVariables,
} from './shared'

/**
 * Per-recipient auto-fill variables. Mirror the keys the
 * send-campaign Edge Function resolves at send time. Add a new entry
 * here and in send-campaign together so the picker stays in sync.
 */
const AUTOFILL_VARS: { key: string; shortLabel: string; desc: string }[] = [
  { key: 'name', shortLabel: 'first name', desc: "The recipient's first name (or 'there' if not set)." },
  { key: 'next_event_title', shortLabel: 'event title', desc: "The recipient's next upcoming event title, from their collective." },
  { key: 'next_event_date', shortLabel: 'date short', desc: 'Short date for the next event, e.g. Sat 14 Jun.' },
  { key: 'next_event_date_long', shortLabel: 'date long', desc: 'Full date for the next event, e.g. Saturday 14 June 2026.' },
  { key: 'next_event_collective', shortLabel: 'collective', desc: "The collective hosting the recipient's next event." },
  { key: 'next_event_location', shortLabel: 'location', desc: 'Address of the next event, if set.' },
  { key: 'next_event_url', shortLabel: 'event link', desc: "Deep link to the next event's page in the app." },
]

/* ================================================================== */
/*  Template Editor                                                    */
/* ================================================================== */

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template?: EmailTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [name, setName] = useState(template?.name ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [bodyHtml, setBodyHtml] = useState(template?.body_html ?? '')
  const [bodyText, setBodyText] = useState(template?.body_text ?? '')
  const [category, setCategory] = useState(template?.category ?? 'general')
  const [saving, setSaving] = useState(false)

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [showHtml, setShowHtml] = useState(!!template?.body_html)
  const [activeView, setActiveView] = useState<'preview' | 'html'>('preview')

  // Extract editable variables from the template
  const templateVars = useMemo(() => extractTemplateVariables(bodyHtml), [bodyHtml])

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Describe the template you want')
      return
    }
    setAiGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { prompt: aiPrompt, subject: subject || undefined, mode: 'template' },
      })
      if (error) throw error
      if (data?.html) {
        setBodyHtml(data.html)
        if (data.plainText) setBodyText(data.plainText)
        setShowHtml(true)
        setActiveView('preview')
        toast.success('Template generated! Review the preview and tweak as needed.')
      } else {
        toast.error(data?.error || 'No content generated')
      }
    } catch {
      toast.error('Generation failed. Make sure ANTHROPIC_API_KEY is set in your Edge Function secrets.')
    } finally {
      setAiGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) {
      toast.error('Name and subject are required')
      return
    }
    if (!bodyHtml.trim()) {
      toast.error('Generate or write template HTML first')
      return
    }

    setSaving(true)

    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      body_html: bodyHtml,
      body_text: bodyText,
      category,
      updated_at: new Date().toISOString(),
      created_by: user?.id,
    }

    // Optimistic: update cache and close immediately
    const tempId = template?.id ?? crypto.randomUUID()
    const optimistic: EmailTemplate = {
      id: tempId,
      ...payload,
      created_by: user?.id ?? null,
      created_at: template?.created_at ?? new Date().toISOString(),
    }
    queryClient.setQueryData<EmailTemplate[]>(['admin-email-templates'], (old) => {
      const filtered = (old ?? []).filter((t) => t.id !== tempId)
      return [optimistic, ...filtered]
    })
    onSaved()

    try {
      if (template) {
        const { error } = await supabase
          .from('email_templates')
          .update(payload)
          .eq('id', template.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert(payload)
        if (error) throw error
      }

      toast.success(template ? 'Template updated' : 'Template created')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
      queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] })
    }
  }

  // Sanitize HTML content via DOMPurify before rendering
  const sanitizedBodyHtml = sanitizeHtml(bodyHtml)

  return (
    <div className="space-y-4">
      <Header title="" back onBack={onClose} />

      {/* Basics */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Template Name"
          placeholder="e.g. Event Announcement"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Dropdown
          options={[
            { value: 'general', label: 'General' },
            { value: 'newsletter', label: 'Newsletter' },
            { value: 'announcement', label: 'Announcement' },
            { value: 'event', label: 'Event' },
            { value: 'impact', label: 'Impact Report' },
            { value: 'welcome', label: 'Welcome' },
          ]}
          value={category}
          onChange={setCategory}
          placeholder="Category"
        />
      </div>

      <Input
        label="Default Subject Line"
        placeholder="e.g. {{event_title}} - this Saturday!"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      {/* AI Generator */}
      <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary-500" />
          <h4 className="text-sm font-semibold text-neutral-900">
            {bodyHtml ? 'Regenerate with AI' : 'Generate Template with AI'}
          </h4>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Describe the email template you need. AI knows Co-Exist&apos;s brand, colours, logos, links and will create editable {'{{fields}}'} you can fill in each time you send.
        </p>
        <Input
          type="textarea"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="e.g. An event announcement template with a hero image, event title, date, location, a short description, and a register button. Include a section for impact stats from the last event."
          rows={3}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleAiGenerate}
          loading={aiGenerating}
          icon={aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          disabled={!aiPrompt.trim()}
        >
          {aiGenerating ? 'Generating...' : bodyHtml ? 'Regenerate' : 'Generate Template'}
        </Button>
      </div>

      {/* Template content area */}
      {showHtml && bodyHtml && (
        <>
          {/* Editable fields extracted from template + the per-recipient
              auto-fill variables. Auto-fills resolve at send time so one
              campaign body lands personalised in each subscriber's inbox
              (Brisbane folks see their next event, Perth folks see
              theirs). Authors can drop any of them into their copy. */}
          <div className="rounded-xl bg-white border border-neutral-200 shadow-sm p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 mb-1">
                Auto-filled per recipient
              </h4>
              <p className="text-xs text-neutral-500 mb-2">
                These resolve at send time. One campaign, every subscriber sees their own.
              </p>
              <div className="flex flex-wrap gap-2">
                {AUTOFILL_VARS.map((v) => (
                  <span
                    key={v.key}
                    title={v.desc}
                    className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-primary-100 text-primary-600"
                  >
                    {`{{${v.key}}}`}
                    <span className="ml-1 text-neutral-400 font-normal hidden sm:inline">{v.shortLabel}</span>
                  </span>
                ))}
              </div>
            </div>
            {templateVars.length > 0 && (
              <div className="border-t border-neutral-100 pt-3">
                <h4 className="text-sm font-semibold text-neutral-900 mb-1">
                  Editable Fields
                </h4>
                <p className="text-xs text-neutral-500 mb-2">
                  These {'{{fields}}'} prompt for a value each time a campaign is created from this template.
                </p>
                <div className="flex flex-wrap gap-2">
                  {templateVars.map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 border border-secondary-200"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview / HTML toggle */}
          <div className="flex gap-1 bg-white rounded-xl p-1">
            <button
              onClick={() => setActiveView('preview')}
              className={cn(
                'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer',
                activeView === 'preview' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              <Eye size={14} /> Preview
            </button>
            <button
              onClick={() => setActiveView('html')}
              className={cn(
                'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg transition-colors duration-150 cursor-pointer',
                activeView === 'html' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              <Edit3 size={14} /> Edit HTML
            </button>
          </div>

          {activeView === 'preview' ? (
            <div
              className="prose prose-sm max-w-none text-neutral-900 rounded-xl bg-white p-4 border border-neutral-200 shadow-sm max-h-[500px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
            />
          ) : (
            <Input
              type="textarea"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={20}
              inputClassName="bg-surface-3 font-mono text-xs leading-relaxed"
            />
          )}

          {/* Plain text */}
          <Input
            type="textarea"
            label="Plain Text Fallback"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="Auto-generated with the template"
            rows={4}
          />
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          icon={<Save size={14} />}
          className="flex-1"
          disabled={!name.trim() || !subject.trim() || !bodyHtml.trim()}
        >
          {template ? 'Update Template' : 'Save Template'}
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Templates Tab                                                      */
/* ================================================================== */

export function TemplatesTab() {
  const { data: templates, isLoading } = useTemplates()
  const showLoading = useDelayedLoading(isLoading)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<EmailTemplate | null | undefined>(undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin-email-templates'] })
      const prev = queryClient.getQueryData<EmailTemplate[]>(['admin-email-templates'])
      queryClient.setQueryData<EmailTemplate[]>(['admin-email-templates'], (old) =>
        (old ?? []).filter((t) => t.id !== id),
      )
      setDeletingId(null)
      return { prev }
    },
    onSuccess: () => toast.success('Template deleted'),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-email-templates'], ctx.prev)
      toast.error('Failed to delete template')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] }),
  })

  if (editing !== undefined) {
    return (
      <TemplateEditor
        template={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => setEditing(undefined)}
      />
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing(null)}>
          New Template
        </Button>
      </div>

      {showLoading ? (
        <Skeleton variant="list-item" count={4} />
      ) : !templates?.length ? (
        <EmptyState
          illustration="empty"
          title="No templates"
          description="Save reusable email templates to speed up campaign creation"
          action={{ label: 'Create Template', onClick: () => setEditing(null) }}
        />
      ) : (
        <StaggeredList className="grid gap-3 sm:grid-cols-2">
          {templates.map((tpl) => (
            <StaggeredItem
              key={tpl.id}
              className="bg-white rounded-xl shadow-sm p-4 cursor-pointer transition-colors group"
            >
              <div className="flex items-start justify-between gap-2" onClick={() => setEditing(tpl)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{tpl.name}</p>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">{tpl.subject}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-500 capitalize">
                      {tpl.category}
                    </span>
                    <span className="text-[11px] text-neutral-400">Updated {formatDate(tpl.updated_at)}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(tpl)} className="flex items-center justify-center min-w-11 min-h-11 rounded-lg text-neutral-400 hover:bg-primary-100 hover:text-primary-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.93]" aria-label="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => setDeletingId(tpl.id)} className="flex items-center justify-center min-w-11 min-h-11 rounded-lg text-neutral-400 hover:bg-error-100 hover:text-error-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.93]" aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <ConfirmationSheet
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Delete Template"
        description="This template will be permanently deleted. Campaigns using it will not be affected."
        confirmLabel="Delete"
      />
    </>
  )
}
