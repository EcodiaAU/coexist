import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle2, Ticket, MessageCircle, AlertCircle, Tent } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/button'
import { OGMeta } from '@/components/og-meta'
import { setPendingClaim, clearPendingClaim } from '@/lib/pending-claim'

type State =
  | { kind: 'loading' }
  | { kind: 'needauth'; eventTitle: string }
  | { kind: 'done'; ticketId: string; already: boolean; eventTitle: string }
  | { kind: 'error'; message: string }

export default function ClaimTicketPage() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>()
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<State>({ kind: 'loading' })

  // Warm the page with the event title (campout events are public/anon-readable).
  const [title, setTitle] = useState<string>('the campout')
  useEffect(() => {
    if (!eventId) return
    supabase.from('events').select('title').eq('id', eventId).maybeSingle().then(({ data }) => {
      if (data?.title) setTitle(data.title as string)
    })
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (isLoading || !eventId) return

      // Signed out: stash the target so it survives login / sign-up / onboarding,
      // and greet the invitee with a one-tap entry.
      if (!user) {
        setPendingClaim(location.pathname)
        setState({ kind: 'needauth', eventTitle: title })
        return
      }

      clearPendingClaim()
      try {
        const { data, error } = await supabase.functions.invoke('claim-event-ticket', {
          body: { event_id: eventId, token },
        })
        if (cancelled) return
        if (error) {
          let msg = 'We could not claim your ticket.'
          try { const ctx = await (error as { context?: Response }).context?.json(); if (ctx?.error) msg = ctx.error } catch { /* keep default */ }
          setState({ kind: 'error', message: msg })
          return
        }
        if (!data?.ticket_id) { setState({ kind: 'error', message: data?.error || 'We could not claim your ticket.' }); return }
        setState({ kind: 'done', ticketId: data.ticket_id, already: !!data.already, eventTitle: title })
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Something went wrong. Please try again.' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [user, isLoading, eventId, token, location.pathname, title])

  const goAuth = (path: '/login' | '/signup') => navigate(path, { state: { from: { pathname: location.pathname } } })

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <OGMeta title="Claim your spot" description="Claim your free Co-Exist campout ticket." canonicalPath="/claim" />

      {(state.kind === 'loading') && (
        <div className="flex flex-col items-center">
          <Loader2 size={32} className="animate-spin text-primary-500" />
          <p className="mt-4 text-sm text-neutral-500">Loading your invite...</p>
        </div>
      )}

      {state.kind === 'needauth' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
            <Tent size={30} className="text-primary-600" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-neutral-900">You&apos;re invited</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            Your spot for <span className="font-semibold text-neutral-700">{state.eventTitle}</span> is waiting. Sign in (or create a free account) and we&apos;ll add your ticket and put you in the group chat.
          </p>
          <div className="mt-7 space-y-2.5">
            <Button variant="primary" size="lg" fullWidth onClick={() => goAuth('/signup')}>
              Create a free account
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={() => goAuth('/login')}>
              I already have an account
            </Button>
          </div>
        </motion.div>
      )}

      {state.kind === 'done' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-500 shadow-sm">
            <CheckCircle2 size={32} className="text-white" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-neutral-900">You&apos;re in!</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            {state.already
              ? <>You already had a spot for <span className="font-semibold text-neutral-700">{state.eventTitle}</span>. Your ticket and the group chat are ready.</>
              : <>Your free ticket for <span className="font-semibold text-neutral-700">{state.eventTitle}</span> is confirmed and you&apos;ve been added to the campout group chat.</>}
          </p>
          <div className="mt-7 space-y-2.5">
            <Button variant="primary" size="lg" fullWidth icon={<Ticket size={18} />} onClick={() => navigate(`/events/${eventId}/ticket-confirmation?ticket_id=${state.ticketId}`)}>
              View my ticket
            </Button>
            <Button variant="secondary" size="lg" fullWidth icon={<MessageCircle size={18} />} onClick={() => navigate('/chat')}>
              Open the group chat
            </Button>
          </div>
        </motion.div>
      )}

      {state.kind === 'error' && (
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-error-50">
            <AlertCircle size={30} className="text-error-500" />
          </div>
          <h1 className="font-heading text-xl font-bold text-neutral-900">Couldn&apos;t claim your spot</h1>
          <p className="mt-2 text-sm text-neutral-500">{state.message}</p>
          <Button variant="secondary" size="lg" fullWidth className="mt-6" onClick={() => navigate('/campouts')}>
            Back to campouts
          </Button>
        </div>
      )}
    </div>
  )
}
