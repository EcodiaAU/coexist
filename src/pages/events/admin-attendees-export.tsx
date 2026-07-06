import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Copy, FileText, Loader2, X, ChevronDown, Users, Phone } from 'lucide-react'
import {
  useEventAttendeesExport,
  buildAttendeesCsv,
  buildAttendeesPlainText,
  buildPhoneList,
  downloadCsv,
  type AttendeeExportScope,
  type EventDetailsForExport,
} from '@/hooks/use-event-attendees-export'
import { useToast } from '@/components/toast'
import { wallClockNow } from '@/lib/date-format'
import { cn } from '@/lib/cn'

interface Props {
  eventId: string
  details: EventDetailsForExport
}

const SCOPES: { value: AttendeeExportScope; label: string }[] = [
  { value: 'registered', label: 'Registered' },
  { value: 'checked_in', label: 'Checked in' },
]

/**
 * Leader/staff attendee export panel. Lives on the event detail page below
 * the existing attendee summary (gated by the page's isStaff = collective
 * assist-leader+ OR global staff, same gate as the event-day dashboard).
 * Renders a collapsible card; opening it fetches the attendee list for the
 * selected scope:
 *   - Registered: everyone with an active registration - the PRE-event view
 *     (dietaries for grocery shopping, phone numbers for the WhatsApp chat).
 *     Default for upcoming events.
 *   - Checked in: the original post-event scope for partner survey lists.
 *     Default once the event has started.
 * Buttons:
 *   - Download .csv (full table, opens in Excel / Sheets)
 *   - Copy as text (clipboard, ready to paste into an email)
 *   - Copy phone list (numbers only, one per line - WhatsApp add)
 *   - Preview shows the plain-text version inline.
 */
export function AdminAttendeesExport({ eventId, details }: Props) {
  const [open, setOpen] = useState(false)
  // Upcoming events default to the Registered scope (nobody is checked in
  // yet, so the old checked-in-only view was empty and useless pre-event);
  // events that have started default to Checked in, the post-event report.
  // date_start is wall-clock-as-UTC, so compare against wallClockNow().
  const [scope, setScope] = useState<AttendeeExportScope>(() =>
    new Date(details.date_start).getTime() > wallClockNow().getTime() ? 'registered' : 'checked_in',
  )
  const { data, isLoading } = useEventAttendeesExport(eventId, scope, open)
  const { toast } = useToast()
  const [showPreview, setShowPreview] = useState(false)

  const filenameBase =
    details.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'
  const scopeNoun = scope === 'checked_in' ? 'checked-in attendees' : 'registered attendees'

  function handleDownload() {
    if (!data) return
    const csv = buildAttendeesCsv(data, details, scope)
    downloadCsv(csv, `coexist-${filenameBase}-${scope === 'checked_in' ? 'checked-in' : 'registered'}.csv`)
    toast.success(`Downloaded ${data.length} ${scopeNoun}`)
  }

  async function handleCopy() {
    if (!data) return
    const text = buildAttendeesPlainText(data, details, scope)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied attendee list')
    } catch {
      toast.error('Clipboard blocked - use Download instead')
    }
  }

  async function handleCopyPhones() {
    if (!data) return
    const list = buildPhoneList(data)
    if (!list) {
      toast.error('No phone numbers on these registrations')
      return
    }
    const count = list.split('\n').length
    try {
      await navigator.clipboard.writeText(list)
      toast.success(`Copied ${count} phone number${count !== 1 ? 's' : ''}`)
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
          <p className="text-sm font-semibold text-neutral-900">Attendees export</p>
          <p className="text-xs text-neutral-500">
            Name, email, phone, postcode, dietary - registered (pre-event) or checked-in
          </p>
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
              <div className="inline-flex items-center rounded-full bg-neutral-100 p-0.5" role="tablist" aria-label="Export scope">
                {SCOPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="tab"
                    aria-selected={scope === s.value}
                    onClick={() => {
                      setScope(s.value)
                      setShowPreview(false)
                    }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                      scope === s.value
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-800',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 size={12} className="animate-spin" />
                  Loading attendees…
                </div>
              ) : !data || data.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  {scope === 'checked_in'
                    ? 'No-one has checked in to this event yet. Switch to Registered to see everyone signed up.'
                    : 'No active registrations for this event yet.'}
                </p>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    {data.length} attendee{data.length !== 1 ? 's' : ''}{' '}
                    {scope === 'checked_in' ? 'checked in' : 'registered'}.
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
                      onClick={handleCopyPhones}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Phone size={13} /> Copy phone list
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
                        {buildAttendeesPlainText(data, details, scope)}
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
