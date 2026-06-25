import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToast } from '@/components/toast'
import { ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useEventsMissingImpact } from '@/hooks/use-admin-impact-observations'
import { useNotifyLeadersForImpactForm } from '@/hooks/use-impact-form-tasks'

/**
 * Outstanding impact surveys.
 *
 * Lists finished events (published/completed, ended in the last 30 days) that
 * still have no `event_impact` row - i.e. the impact survey hasn't been
 * submitted. Each row deep-links to the event's impact log and carries a
 * manual "Nudge" that pushes the collective's leadership (the same survey_request
 * push the hourly auto-reminder sends). Backs the auto-escalating reminder
 * pipeline (edge fn event-post-impact-log-invite) with a staff-visible queue.
 *
 * Shared by /admin (dashboard) and /admin/impact so the two surfaces never
 * drift. Renders nothing when the queue is empty unless `showWhenEmpty` is set
 * (the dashboard wants a positive "all caught up" state; the impact page hides).
 */
export function EventsMissingImpactCard({ showWhenEmpty = false }: { showWhenEmpty?: boolean }) {
  const { data: missingImpact } = useEventsMissingImpact()
  const notifyLeaders = useNotifyLeadersForImpactForm()
  const { toast } = useToast()
  const [nudgingEvent, setNudgingEvent] = useState<string | null>(null)

  const count = missingImpact?.length ?? 0

  if (count === 0) {
    if (!showWhenEmpty) return null
    // Positive empty state - reassures staff the queue is clear, and that the
    // surface exists even when there's nothing outstanding.
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-md bg-sprout-50 border border-sprout-200/50 p-4 flex items-center gap-2.5"
      >
        <CheckCircle2 size={16} className="text-sprout-600 shrink-0" />
        <p className="text-sm font-medium text-sprout-800">
          Every finished event has its impact logged. Nothing outstanding.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="rounded-md bg-warning-50 border border-warning-200/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-warning-600 shrink-0" />
          <h3 className="text-sm font-semibold text-warning-800">
            {count} event{count !== 1 ? 's' : ''} missing impact data
          </h3>
        </div>
        <p className="text-xs text-warning-700">
          These events ended in the last 30 days but no leader has logged impact yet.
        </p>
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {missingImpact!.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-sm bg-white/70">
              <Link
                to={`/events/${e.id}/impact`}
                className="flex-1 min-w-0 hover:opacity-80 active:scale-[0.99] transition-all"
              >
                <p className="text-sm font-medium text-neutral-800 truncate">{e.title}</p>
                <p className="text-[11px] text-neutral-400">
                  {e.collective_name ?? 'Unknown'} · {ACTIVITY_TYPE_LABELS[e.activity_type] ?? e.activity_type} · {e.days_since}d ago
                </p>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setNudgingEvent(e.id)
                  notifyLeaders.mutate(
                    { eventId: e.id, eventTitle: e.title, collectiveId: e.collective_id },
                    {
                      onSuccess: (result) => {
                        toast.success(`Reminder sent to ${result?.sent ?? 0} leader${(result?.sent ?? 0) !== 1 ? 's' : ''}`)
                        setNudgingEvent(null)
                      },
                      onError: () => {
                        toast.error('Failed to send reminder')
                        setNudgingEvent(null)
                      },
                    },
                  )
                }}
                disabled={nudgingEvent === e.id}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-200 text-warning-800 hover:bg-warning-300 active:scale-[0.97] transition-all shrink-0 cursor-pointer disabled:opacity-50"
              >
                {nudgingEvent === e.id ? 'Sending...' : 'Nudge'}
              </button>
              <span className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                e.days_since > 7 ? 'bg-error-100 text-error-700' : e.days_since > 3 ? 'bg-warning-100 text-warning-700' : 'bg-neutral-100 text-neutral-500',
              )}>
                {e.days_since}d
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
