/**
 * ClaimTransferPage - the receiving end of a person-to-person ticket transfer.
 *
 * A member passed their ticket to someone by email (see
 * TicketSelfServiceSheet); this is the link in that email. The recipient is very
 * often brand new to the app, so the page has to greet a signed-out visitor,
 * survive the login / sign-up / onboarding detour via the pending-claim stash,
 * and then claim on the way back.
 *
 * Nothing is paid here. The ticket and its original charge move across as they
 * are: claim_ticket_transfer only changes event_tickets.user_id, and the
 * existing reconcile trigger moves campout chat membership with it.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/button'
import { useClaimTicketTransfer } from '@/hooks/use-event-tickets'
import { setPendingClaim, clearPendingClaim } from '@/lib/pending-claim'

type State =
  | { kind: 'loading' }
  | { kind: 'needauth' }
  | { kind: 'done'; eventId: string }
  | { kind: 'error'; message: string }

export default function ClaimTransferPage() {
  const { token } = useParams<{ token: string }>()
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const claim = useClaimTicketTransfer()
  const [state, setState] = useState<State>({ kind: 'loading' })
  // A claim is not idempotent from the user's point of view (the second attempt
  // errors with "already claimed"), so it must fire exactly once per mount.
  const attempted = useRef(false)

  useEffect(() => {
    async function run() {
      if (isLoading || !token) return

      if (!user) {
        setPendingClaim(location.pathname)
        setState({ kind: 'needauth' })
        return
      }

      // Once-only guard. Deliberately NOT paired with a `cancelled` flag from
      // this effect's cleanup: `user` changes identity when auth hydrates, so
      // the effect re-runs, the first pass's cleanup sets cancelled, its result
      // is thrown away, and the second pass returns here on the ref. The page
      // then spins on "Claiming your ticket..." forever. Caught on the deployed
      // build 2026-08-24. The ref alone guarantees one attempt; the result must
      // always be allowed to land.
      if (attempted.current) return
      attempted.current = true

      clearPendingClaim()
      try {
        const res = await claim.mutateAsync({ token })
        setState({ kind: 'done', eventId: res?.event_id ?? '' })
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'We could not claim that ticket.',
        })
      }
    }
    run()
    // `claim` is a stable mutation object and is deliberately not a dependency:
    // re-running this effect on it would attempt a second claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, token, location.pathname])

  const goAuth = (path: '/login' | '/signup') =>
    navigate(path, { state: { from: { pathname: location.pathname } } })

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-16 text-center">
      {state.kind === 'loading' && (
        <>
          <Loader2 className="w-10 h-10 text-neutral-400 animate-spin" />
          <p className="mt-4 text-sm font-medium text-neutral-600">Claiming your ticket...</p>
        </>
      )}

      {state.kind === 'needauth' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto">
            <ArrowRightLeft size={26} className="text-primary-700" />
          </div>
          <h1 className="font-heading text-xl font-bold text-neutral-900 mt-4">
            A ticket is waiting for you
          </h1>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Someone has passed you their ticket. Sign in or create an account and it is yours.
            There is nothing to pay.
          </p>
          <div className="mt-6 space-y-2">
            <Button variant="primary" size="lg" fullWidth onClick={() => goAuth('/signup')}>
              Create an account
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={() => goAuth('/login')}>
              I already have an account
            </Button>
          </div>
        </motion.div>
      )}

      {state.kind === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
          <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-success-600" />
          </div>
          <h1 className="font-heading text-xl font-bold text-neutral-900 mt-4">The ticket is yours</h1>
          <p className="text-sm text-neutral-500 mt-2">
            It is on your tickets now, and you are in the group chat.
          </p>
          <div className="mt-6 space-y-2">
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/profile/tickets')}>
              View my tickets
            </Button>
            {state.eventId && (
              <Button variant="ghost" size="md" fullWidth onClick={() => navigate(`/events/${state.eventId}`)}>
                See the event
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {state.kind === 'error' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-full bg-error-100 flex items-center justify-center mx-auto">
            <AlertCircle size={26} className="text-error-600" />
          </div>
          <h1 className="font-heading text-lg font-bold text-neutral-900 mt-4">
            We could not claim that ticket
          </h1>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">{state.message}</p>
          <Button variant="ghost" size="md" fullWidth className="mt-6" onClick={() => navigate('/explore')}>
            Explore events
          </Button>
        </motion.div>
      )}
    </div>
  )
}
