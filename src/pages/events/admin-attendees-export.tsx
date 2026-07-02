import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Copy, FileText, Loader2, X, ChevronDown, Users } from 'lucide-react'
import {
  useEventAttendeesExport,
  buildAttendeesCsv,
  buildAttendeesPlainText,
  downloadCsv,
  type EventDetailsForExport,
} from '@/hooks/use-event-attendees-export'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'

interface Props {
  eventId: string
  details: EventDetailsForExport
}

/**
 * Admin-only attendee export panel. Lives on the event detail page below
 * the existing attendee summary. Renders a collapsible card; opening it
 * fetches the full attendee list (incl. emergency contacts). Buttons:
 *   - Download .csv (full table, opens in Excel / Sheets)
 *   - Copy as text (clipboard, ready to paste into an email)
 *   - Preview shows the plain-text version inline.
 */
export function AdminAttendeesExport({ eventId, details }: Props) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useEventAttendeesExport(eventId, open)
  const { toast } = useToast()
  const [showPreview, setShowPreview] = useState(false)

  const filenameBase =
    details.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'

  function handleDownload() {
    if (!data) return
    const csv = buildAttendeesCsv(data, details)
    downloadCsv(csv, `coexist-${filenameBase}-checked-in.csv`)
    toast.success(`Downloaded ${data.length} checked-in attendees`)
  }

  async function handleCopy() {
    if (!data) return
    const text = buildAttendeesPlainText(data, details)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied attendee list')
    } catch {
      toast.error('Clipboard blocked - use Download instead')
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-neutral-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600">
          <Users size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Checked-in attendees export</p>
          <p className="text-xs text-neutral-500">Name, email, postcode, dietary - for catering and partner surveys</p>
        </div>
        <ChevronDown
          size={16}
          className={cn('text-neutral-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-neutral-100"
          >
            <div className="px-4 pt-3 pb-4 space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 size={12} className="animate-spin" />
                  Loading attendees…
                </div>
              ) : !data || data.length === 0 ? (
                <p className="text-xs text-neutral-500">No-one has checked in to this event yet.</p>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    {data.length} attendee{data.length !== 1 ? 's' : ''} checked in.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Download size={13} /> Download .csv
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Copy size={13} /> Copy text
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                    >
                      <FileText size={13} />
                      {showPreview ? 'Hide preview' : 'Preview'}
                    </button>
                  </div>

                  {showPreview && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowPreview(false)}
                        className="absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500"
                        aria-label="Close preview"
                      >
                        <X size={12} />
                      </button>
                      <pre className="text-[11px] leading-relaxed text-neutral-700 bg-neutral-50 rounded-xl p-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                        {buildAttendeesPlainText(data, details)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
