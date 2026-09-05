import { Clock, Mail, UserMinus, TrendingUp } from 'lucide-react'
import { Button } from '@/components/button'
import { useToast } from '@/components/toast'
import {
  useWaitlistSummary,
  useWaitlistPeople,
  useRemoveFromWaitlist,
  useNotifyWaitlist,
} from '@/hooks/use-event-waitlist'

/**
 * The organiser's view of a TICKETED event's waitlist.
 *
 * The free-event waitlist renders inline on the roster (scenario 'waitlist')
 * because those people are registrations and belong beside the other
 * registrations. A ticketed waitlister holds no registration and no ticket, so
 * they are not on the roster at all by design (classifyAttendance hides them);
 * they get their own panel, which is also where the demand number lives.
 *
 * The panel answers the two questions an organiser actually has when an event
 * sells out: how many more could I have sold, and did the people I emailed
 * actually buy.
 */
export function TicketWaitlistPanel({ eventId }: { eventId: string }) {
  const { toast } = useToast()
  const { data: summary } = useWaitlistSummary(eventId)
  const { data: people } = useWaitlistPeople(eventId, !!summary)
  const remove = useRemoveFromWaitlist()
  const notify = useNotifyWaitlist()

  // Not staff on this event, or nobody has ever joined. Either way there is
  // nothing an organiser can act on.
  if (!summary || (summary.waiting === 0 && summary.converted === 0)) return null

  const onNotifyAll = async () => {
    try {
      const res = await notify.mutateAsync({ eventId })
      if (res.notified > 0) {
        toast.success(`Emailed ${res.notified} ${res.notified === 1 ? 'person' : 'people'} on the waitlist`)
      } else {
        toast.info('Nobody left to email')
      }
    } catch (e) {
      toast.error((e as Error).message || 'Could not email the waitlist')
    }
  }

  return (
    <div className="mb-5 rounded-sm border border-neutral-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-bark-600" />
        <h3 className="font-heading text-base font-semibold text-neutral-900">Waitlist</h3>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-xl font-bold text-bark-700">{summary.waiting}</p>
          <p className="text-caption font-medium text-bark-600">Waiting</p>
        </div>
        <div className="text-center">
          {/* Seats wanted, not head count: three people wanting two each is
              six tickets of demand, which is the number that decides whether
              to raise capacity or add a date. */}
          <p className="text-xl font-bold text-neutral-900">{summary.demand}</p>
          <p className="text-caption font-medium text-neutral-500">Tickets wanted</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-success-700">{summary.converted}</p>
          <p className="text-caption font-medium text-success-600">Converted</p>
        </div>
      </div>

      {summary.notified > 0 && (
        <p className="mt-3 text-caption text-neutral-500">
          {summary.notified} {summary.notified === 1 ? 'person has' : 'people have'} been offered a
          spot and have not bought yet.
        </p>
      )}

      {summary.waiting > 0 && (
        <>
          <div className="mt-3 space-y-1.5">
            {(people ?? []).map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2.5 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2"
              >
                <span className="w-5 shrink-0 text-caption font-bold text-neutral-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {p.name || p.email}
                  </p>
                  <p className="truncate text-caption text-neutral-500">
                    {p.name ? `${p.email} · ` : ''}
                    {p.quantity > 1 ? `${p.quantity} tickets` : '1 ticket'}
                    {p.notified_at ? ' · offered' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.name || p.email} from the waitlist`}
                  onClick={() => remove.mutate({ id: p.id, eventId })}
                  className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-error-500"
                >
                  <UserMinus size={15} />
                </button>
              </div>
            ))}
          </div>

          {/* Spots are offered automatically as tickets come back. This button
              is for the case the sweep cannot see: an event flagged sold out
              because it sold out on Eventbrite, where native seats never
              reopen and only the organiser knows one came back. */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            className="mt-3"
            icon={<Mail size={16} />}
            loading={notify.isPending}
            onClick={onNotifyAll}
          >
            Email everyone waiting
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-caption leading-relaxed text-neutral-500">
            <TrendingUp size={13} className="mt-0.5 shrink-0" />
            Spots are offered automatically, oldest first, whenever a ticket comes back. Use this
            only when a spot opened somewhere we cannot see, such as Eventbrite.
          </p>
        </>
      )}
    </div>
  )
}
