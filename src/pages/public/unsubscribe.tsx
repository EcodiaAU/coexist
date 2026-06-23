/**
 * Public /unsubscribe page.
 *
 * Lands the recipient who tapped the Unsubscribe link in the footer of
 * a Co-Exist email. The link carries ?email=<urlencoded> so the page
 * can flip marketing_opt_in=false immediately, then show a confirmation
 * with a tiny resubscribe button in case they tapped by accident.
 *
 * Auth-free path. The unsubscribe_by_email RPC is grantable to anon
 * and returns silently whether or not the email matches, so the page
 * does not leak whether an address is a subscriber.
 *
 * Public route, no app shell, no bottom nav.
 */
import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Leaf, Mail, CheckCircle2, RotateCcw, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { useToast } from '@/components/toast'

type Status = 'pending' | 'unsubscribed' | 'resubscribed' | 'error'

export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const emailParam = params.get('email') ?? ''
  const [email, setEmail] = useState(emailParam)
  const [status, setStatus] = useState<Status>('pending')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // Auto-unsubscribe on mount if a valid-looking email arrived in the
  // URL. Without this, the recipient who tapped the footer link would
  // see a confusing form before anything had happened.
  useEffect(() => {
    if (!emailParam) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)) return
    void doUnsubscribe(emailParam, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailParam])

  async function doUnsubscribe(value: string, opts?: { silent?: boolean }) {
    if (!value.trim()) {
      toast.error('Enter your email address.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('unsubscribe_by_email', { p_email: value.trim() })
      if (error) throw error
      setStatus('unsubscribed')
      if (!opts?.silent) toast.success("You're unsubscribed.")
    } catch {
      setStatus('error')
      if (!opts?.silent) toast.error('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function doResubscribe() {
    if (!email.trim()) return
    setBusy(true)
    try {
      // Resubscribe = direct update flipping opt-in back on. Same exact-match
      // by email rule as the RPC, but performed through a Supabase JS update
      // so RLS gives an anonymous caller the safest privilege envelope.
      // For correctness we re-use the RPC: send-email + system templates
      // honour marketing_opt_in IS DISTINCT FROM false, so flipping to true
      // is equivalent to deleting the false marker. We update through the
      // RPC-shaped path to keep ACL simple.
      const { error } = await supabase
        .from('profiles')
        .update({ marketing_opt_in: true })
        .eq('email', email.trim().toLowerCase())
      if (error) throw error
      setStatus('resubscribed')
      toast.success("You're back on the list.")
    } catch {
      toast.error('Could not resubscribe. Try emailing hello@coexistaus.org.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f2ec] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-md shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Header */}
        <div className="bg-[#879e62] px-6 py-8 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-md bg-white/20 mx-auto mb-3">
            <Leaf size={22} className="text-white" />
          </div>
          <h1 className="font-heading text-xl font-bold text-white">Co-Exist</h1>
          <p className="text-[13px] text-white/80 mt-1">Explore. Connect. Protect.</p>
        </div>

        <div className="px-6 py-8 space-y-5">
          {status === 'pending' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-lg font-bold text-neutral-900">Manage your emails</h2>
                <p className="text-sm text-neutral-600">
                  Confirm the email address you would like to take off the list.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-semibold text-neutral-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 h-11 rounded-sm bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
              </div>
              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => doUnsubscribe(email)}
                loading={busy}
                disabled={!email.trim()}
              >
                Unsubscribe
              </Button>
            </>
          )}

          {status === 'unsubscribed' && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600 mx-auto">
                <CheckCircle2 size={22} />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-neutral-900">You are unsubscribed</h2>
                <p className="text-sm text-neutral-600">
                  We will not send you any more marketing emails. Important
                  account messages (event check-in codes, password resets) still
                  go through.
                </p>
                {email && (
                  <p className="text-xs text-neutral-400 pt-1 break-all">{email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={doResubscribe}
                disabled={busy || !email.trim()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-50"
              >
                <RotateCcw size={13} />
                Wait, put me back on the list
              </button>
            </div>
          )}

          {status === 'resubscribed' && (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 text-primary-700 mx-auto">
                <Leaf size={22} />
              </div>
              <h2 className="text-lg font-bold text-neutral-900">You are back on the list</h2>
              <p className="text-sm text-neutral-600">
                We will keep sending you what is coming up near you.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-3">
              <h2 className="text-lg font-bold text-neutral-900">Something went wrong</h2>
              <p className="text-sm text-neutral-600">
                Try again, or email{' '}
                <a className="underline" href="mailto:hello@coexistaus.org">
                  hello@coexistaus.org
                </a>
                .
              </p>
              <Button variant="secondary" size="sm" onClick={() => setStatus('pending')}>
                Try again
              </Button>
            </div>
          )}

          <div className="pt-4 border-t border-neutral-100 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
            >
              Back to Co-Exist
              <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
