import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Copy, FileText, Loader2, X, ChevronDown, Users, Phone } from 'lucide-react'
import {
  useEventAttendeesExport,
  buildAttendeesCsv,
  buildAttendeesPlainText,
  buildPhoneList,
  filterByStatus,
  downloadCsv,
  STATUS_FILTERS,
  type AttendeeStatusFilter,
  type EventDetailsForExport,
} from '@/hooks/use-event-attendees-export'
import { useEventTicketQuestions } from '@/hooks/use-event-ticket-questions'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'

interface Props {
  eventId: string
  details: EventDetailsForExport
}

/**
 * Leader/staff attendee export panel. Lives on the event detail page below the
 * attendee summary (same isStaff gate as the event-day dashboard). One
 * comprehensive export sourced from get_event_attendee_export: everyone with a
 * registration or ticket, across all states, with full contact + dietary +
 * medical + emergency contact + a column per custom question. The status
 * filter (All / Going / Waitlisted / Cancelled) scopes the same fetched set.
 * Buttons: Download .csv, Copy as text, Copy phone list, Preview.
 */
export function AdminAttendeesExport({ eventId, details }: Props) {
  const [open, setOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<AttendeeStatusFilter>('all')
  const { data, isLoading } = useEventAttendeesExport(eventId, open)
  const { data: questions = [] } = useEventTicketQuestions(eventId, open)
  const { toast } = useToast()
  const [showPreview, setShowPreview] = useState(false)

  const filenameBase =
    details.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'
  const rows = filterByStatus(data ?? [], statusFilter)

  function handleDownload() {
    if (!rows.length) return
    const csv = buildAttendeesCsv(rows, details, questions)
    downloadCsv(csv, `coexist-${filenameBase}-${statusFilter}.csv`)
    toast.success(`Downloaded ${rows.length} attendee${rows.length !== 1 ? 's' : ''}`)
  }

  async function handleCopy() {
    if (!rows.length) return
    const text = buildAttendeesPlainText(rows, details, questions)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied attendee list')
    } catch {
      toast.error('Clipboard blocked - use Download instead')
    }
  }

  async function handleCopyPhones() {
    if (!rows.length) return
    const list = buildPhoneList(rows)
    if (!list) {
      toast.error('No phone numbers on these attendees')
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
    <div data-eos-id="src/pages/events/admin-attendees-export.tsx#0" data-eos-v="2" className="rounded-2xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
      <button data-eos-id="src/pages/events/admin-attendees-export.tsx#1"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-neutral-50 transition-colors"
        aria-expanded={open}
      >
        <span data-eos-id="src/pages/events/admin-attendees-export.tsx#2" className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600">
          <Users data-eos-id="src/pages/events/admin-attendees-export.tsx#3" size={16} />
        </span>
        <div data-eos-id="src/pages/events/admin-attendees-export.tsx#4" className="flex-1 min-w-0">
          <p data-eos-id="src/pages/events/admin-attendees-export.tsx#5" className="text-sm font-semibold text-neutral-900">Attendees export</p>
          <p data-eos-id="src/pages/events/admin-attendees-export.tsx#6" className="text-xs text-neutral-500">
            Name, status, contact, dietary, medical, emergency contact + your questions, every ticket state
          </p>
        </div>
        <ChevronDown data-eos-id="src/pages/events/admin-attendees-export.tsx#7"
          size={16}
          className={cn('text-neutral-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence data-eos-id="src/pages/events/admin-attendees-export.tsx#8" initial={false}>
        {open && (
          <motion.div data-eos-id="src/pages/events/admin-attendees-export.tsx#9"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-neutral-100"
          >
            <div data-eos-id="src/pages/events/admin-attendees-export.tsx#10" className="px-4 pt-3 pb-4 space-y-3">
              <div data-eos-id="src/pages/events/admin-attendees-export.tsx#11" className="inline-flex items-center rounded-full bg-neutral-100 p-0.5" role="tablist" aria-label="Status filter">
                {STATUS_FILTERS.map((s) => (
                  <button data-eos-id="src/pages/events/admin-attendees-export.tsx#12" data-eos-var="s.label" data-eos-var-label="Label" data-eos-var-scope="item"
                    key={s.value}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === s.value}
                    onClick={() => {
                      setStatusFilter(s.value)
                      setShowPreview(false)
                    }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                      statusFilter === s.value
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-800',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div data-eos-id="src/pages/events/admin-attendees-export.tsx#13" className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 data-eos-id="src/pages/events/admin-attendees-export.tsx#14" size={12} className="animate-spin" />
                  Loading attendees…
                </div>
              ) : rows.length === 0 ? (
                <p data-eos-id="src/pages/events/admin-attendees-export.tsx#15" className="text-xs text-neutral-500">
                  {statusFilter === 'all'
                    ? 'No registrations or tickets for this event yet.'
                    : `No ${statusFilter} attendees. Switch to All to see everyone.`}
                </p>
              ) : (
                <>
                  <p data-eos-id="src/pages/events/admin-attendees-export.tsx#16" className="text-xs text-neutral-500">
                    {rows.length} attendee{rows.length !== 1 ? 's' : ''}
                    {statusFilter !== 'all' ? ` (${statusFilter})` : ''}.
                  </p>
                  <div data-eos-id="src/pages/events/admin-attendees-export.tsx#17" className="flex flex-wrap items-center gap-2">
                    <button data-eos-id="src/pages/events/admin-attendees-export.tsx#18"
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Download data-eos-id="src/pages/events/admin-attendees-export.tsx#19" size={13} /> Download .csv
                    </button>
                    <button data-eos-id="src/pages/events/admin-attendees-export.tsx#20"
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Copy data-eos-id="src/pages/events/admin-attendees-export.tsx#21" size={13} /> Copy text
                    </button>
                    <button data-eos-id="src/pages/events/admin-attendees-export.tsx#22"
                      type="button"
                      onClick={handleCopyPhones}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150 px-3 py-1.5 rounded-full"
                    >
                      <Phone data-eos-id="src/pages/events/admin-attendees-export.tsx#23" size={13} /> Copy phone list
                    </button>
                    <button data-eos-id="src/pages/events/admin-attendees-export.tsx#24"
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                    >
                      <FileText data-eos-id="src/pages/events/admin-attendees-export.tsx#25" size={13} />
                      {showPreview ? 'Hide preview' : 'Preview'}
                    </button>
                  </div>

                  {showPreview && (
                    <div data-eos-id="src/pages/events/admin-attendees-export.tsx#26" className="relative">
                      <button data-eos-id="src/pages/events/admin-attendees-export.tsx#27"
                        type="button"
                        onClick={() => setShowPreview(false)}
                        className="absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500"
                        aria-label="Close preview"
                      >
                        <X data-eos-id="src/pages/events/admin-attendees-export.tsx#28" size={12} />
                      </button>
                      <pre data-eos-id="src/pages/events/admin-attendees-export.tsx#29" className="text-[11px] leading-relaxed text-neutral-700 bg-neutral-50 rounded-xl p-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                        {buildAttendeesPlainText(rows, details, questions)}
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
