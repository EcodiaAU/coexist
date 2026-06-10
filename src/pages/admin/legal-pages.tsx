import { useState, useRef, useCallback, useEffect } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import DOMPurify from 'dompurify'
import {
    FileText,
    Save,
    CheckCircle,
    Eye,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Link2,
    Heading2,
    Heading3,
    Quote,
    Minus,
    Undo2,
    Redo2,
    Globe,
    Pencil,
    Clock,
    AlignLeft,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAllLegalPages, useSaveLegalPage, type LegalPage } from '@/hooks/use-legal-page'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Rich text toolbar button                                           */
/* ------------------------------------------------------------------ */

function ToolbarBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 cursor-pointer',
        active
          ? 'bg-primary-100 text-primary-800'
          : 'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700',
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Rich text editor using contentEditable + browser execCommand API   */
/* ------------------------------------------------------------------ */

/**
 * Wrapper around document.execCommand - this is the browser DOM rich-text
 * editing API, NOT Node.js child_process.exec.
 */
function browserExecCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function RichEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (html: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef(false)

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
      }
    }
    isInternalUpdate.current = false
  }, [value])

  const doCommand = useCallback((command: string, val?: string) => {
    browserExecCommand(command, val)
    editorRef.current?.focus()
    if (editorRef.current) {
      isInternalUpdate.current = true
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const insertLink = useCallback(() => {
    const url = prompt('Enter URL:')
    if (url) {
      doCommand('createLink', url)
    }
  }, [doCommand])

  return (
    <div className="rounded-2xl border border-neutral-100 overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-neutral-100 bg-neutral-50/30">
        <ToolbarBtn icon={<Undo2 size={15} />} label="Undo" onClick={() => doCommand('undo')} />
        <ToolbarBtn icon={<Redo2 size={15} />} label="Redo" onClick={() => doCommand('redo')} />
        <div className="w-px h-5 bg-neutral-200 mx-1" />
        <ToolbarBtn icon={<Heading2 size={15} />} label="Heading 2" onClick={() => doCommand('formatBlock', 'h2')} />
        <ToolbarBtn icon={<Heading3 size={15} />} label="Heading 3" onClick={() => doCommand('formatBlock', 'h3')} />
        <ToolbarBtn icon={<AlignLeft size={15} />} label="Paragraph" onClick={() => doCommand('formatBlock', 'p')} />
        <div className="w-px h-5 bg-neutral-200 mx-1" />
        <ToolbarBtn icon={<Bold size={15} />} label="Bold" onClick={() => doCommand('bold')} />
        <ToolbarBtn icon={<Italic size={15} />} label="Italic" onClick={() => doCommand('italic')} />
        <ToolbarBtn icon={<UnderlineIcon size={15} />} label="Underline" onClick={() => doCommand('underline')} />
        <div className="w-px h-5 bg-neutral-200 mx-1" />
        <ToolbarBtn icon={<List size={15} />} label="Bullet list" onClick={() => doCommand('insertUnorderedList')} />
        <ToolbarBtn icon={<ListOrdered size={15} />} label="Numbered list" onClick={() => doCommand('insertOrderedList')} />
        <ToolbarBtn icon={<Quote size={15} />} label="Blockquote" onClick={() => doCommand('formatBlock', 'blockquote')} />
        <div className="w-px h-5 bg-neutral-200 mx-1" />
        <ToolbarBtn icon={<Link2 size={15} />} label="Insert link" onClick={insertLink} />
        <ToolbarBtn icon={<Minus size={15} />} label="Horizontal rule" onClick={() => doCommand('insertHorizontalRule')} />
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        className="legal-content min-h-[400px] p-5 text-sm text-neutral-700 leading-relaxed focus:outline-none"
        onInput={handleInput}
        onBlur={handleInput}
        role="textbox"
        aria-label="Page content editor"
        aria-multiline="true"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page list card                                                     */
/* ------------------------------------------------------------------ */

function PageCard({
  page,
  onClick,
}: {
  page: LegalPage
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl bg-white p-5 shadow-sm transition-colors duration-200 cursor-pointer group"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 group-hover:bg-primary-100 transition-colors">
          <FileText size={18} className="text-neutral-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 truncate">
              {page.title}
            </h3>
            {page.is_published ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-semibold uppercase tracking-wide shrink-0">
                <Globe size={10} />
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-50 text-neutral-400 text-[11px] font-semibold uppercase tracking-wide shrink-0">
                Draft
              </span>
            )}
          </div>
          {page.summary && (
            <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{page.summary}</p>
          )}
          <div className="flex items-center gap-1 mt-2 text-[11px] text-neutral-300">
            <Clock size={10} />
            Updated {new Date(page.updated_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
        </div>
        <Pencil size={14} className="text-neutral-300 group-hover:text-neutral-500 transition-colors shrink-0 mt-1" />
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Sanitise helper - all HTML rendered via innerHTML is sanitised     */
/*  with DOMPurify as defence-in-depth against stored XSS.            */
/* ------------------------------------------------------------------ */

function sanitise(html: string): string {
  return DOMPurify.sanitize(html)
}

/* ------------------------------------------------------------------ */
/*  Main admin page                                                    */
/* ------------------------------------------------------------------ */

export default function AdminLegalPagesPage() {
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: pages, isLoading } = useAllLegalPages()
  const showLoading = useDelayedLoading(isLoading)
  const saveMutation = useSaveLegalPage()

  const [editing, setEditing] = useState<LegalPage | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    summary: '',
    is_published: false,
  })
  const [saved, setSaved] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const previewHtml = sanitise(form.content)

  useAdminHeader(editing ? 'Edit Policy' : 'Organisational Policies')

  const startEdit = useCallback((page: LegalPage) => {
    setEditing(page)
    setForm({
      title: page.title,
      content: page.content,
      summary: page.summary ?? '',
      is_published: page.is_published,
    })
    setPreviewMode(false)
    setSaved(false)
  }, [])

  const handleSave = useCallback(() => {
    if (!editing) return
    saveMutation.mutate(
      {
        slug: editing.slug,
        title: form.title,
        content: form.content,
        summary: form.summary,
        is_published: form.is_published,
      },
      {
        onSuccess: () => {
          setSaved(true)
          toast.success(`${form.title} saved`)
          setTimeout(() => setSaved(false), 2000)
        },
        onError: () => toast.error('Failed to save page'),
      },
    )
  }, [editing, form, saveMutation, toast])

  const handleBack = useCallback(() => {
    setEditing(null)
    setPreviewMode(false)
  }, [])

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  /* ---------- Loading state ---------- */
  if (showLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-full max-w-3xl space-y-4">
          <Skeleton variant="text" count={3} />
          <Skeleton variant="card" />
        </div>
      </div>
    )
  }
  /* ---------- Editor view ---------- */
  if (editing) {
    return (
      <div className="flex justify-center py-2 sm:py-6">
        <motion.div
          className="w-full max-w-3xl space-y-6"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Header title="" back onBack={handleBack} />
          <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={previewMode ? <Pencil size={15} /> : <Eye size={15} />}
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Edit' : 'Preview'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={saved ? <CheckCircle size={15} /> : <Save size={15} />}
                onClick={handleSave}
                loading={saveMutation.isPending}
              >
                {saved ? 'Saved!' : 'Save'}
              </Button>
          </div>

          {/* Slug badge */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
              Slug
            </span>
            <code className="text-xs text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded-lg">
              /{editing.slug}
            </code>
          </div>

          {/* Title + summary */}
          <div className="space-y-4">
            <Input
              label="Page Title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="[&_input]:bg-white [&_input]:pt-7"
            />
            <Input
              type="textarea"
              label="SEO Summary"
              value={form.summary}
              onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
              rows={2}
              helperText="Short description shown in search results and social previews"
              className="[&_textarea]:bg-white [&_textarea]:border [&_textarea]:border-neutral-100 [&_textarea]:pt-7"
            />
          </div>

          {/* Publish toggle */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <Toggle
              checked={form.is_published}
              onChange={(v) => setForm((p) => ({ ...p, is_published: v }))}
              label="Published"
              description={form.is_published
                ? 'This page is live and visible to all users'
                : 'This page is in draft mode and only visible to staff'}
            />
          </div>

          {/* Content editor or preview */}
          <AnimatePresence mode="wait">
            {previewMode ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-100">
                  <Eye size={14} className="text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Preview</span>
                </div>
                {previewHtml ? (
                  <div
                    className="legal-content text-sm text-neutral-700 leading-relaxed"
                    // Content is sanitised via DOMPurify in the sanitise() helper above
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <p className="text-sm text-neutral-300 italic">No content yet</p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <RichEditor
                  value={form.content}
                  onChange={(html) => setForm((p) => ({ ...p, content: html }))}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    )
  }

  /* ---------- List view ---------- */
  return (
    <div className="flex justify-center py-2 sm:py-6">
      <motion.div
        className="w-full max-w-3xl space-y-4"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Info banner */}
        <motion.div
          variants={fadeUp}
          className="rounded-2xl bg-white border border-neutral-100 p-5 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <FileText size={20} className="text-neutral-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Organisational Policies
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                Manage your Terms of Service, Privacy Policy, and other organisational policies.
                Changes go live immediately when a page is published.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Page cards */}
        {(pages ?? []).map((page) => (
          <motion.div key={page.slug} variants={fadeUp}>
            <PageCard page={page} onClick={() => startEdit(page)} />
          </motion.div>
        ))}

        {pages?.length === 0 && (
          <motion.div variants={fadeUp} className="text-center py-12">
            <p className="text-sm text-neutral-400">No organisational policies found. Run the database migration to seed default pages.</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
