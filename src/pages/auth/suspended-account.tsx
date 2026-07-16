import { Navigate, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldX, Mail } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { CONTACT_EMAIL } from '@/lib/constants'

export default function SuspendedAccountPage() {
  const navigate = useNavigate()
  const { profile, signOut, isSuspended, user } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  // Non-suspended or unauthenticated users shouldn't see this page
  if (!user) return <Navigate data-eos-id="src/pages/auth/suspended-account.tsx#0" data-eos-v="2" to="/login" replace />
  if (!isSuspended) return <Navigate data-eos-id="src/pages/auth/suspended-account.tsx#1" to="/" replace />

  const reason = profile?.suspended_reason ?? 'No reason provided.'

  async function handleSignOut() {
    await signOut()
    navigate('/welcome', { replace: true })
  }

  return (
    <div data-eos-id="src/pages/auth/suspended-account.tsx#2" className="min-h-dvh flex flex-col items-center justify-center px-6 bg-white">
      <OGMeta data-eos-id="src/pages/auth/suspended-account.tsx#3"
        title="Account Suspended"
        description="Your Co-Exist account has been suspended. Contact us to appeal."
        noindex
      />
      <motion.div data-eos-id="src/pages/auth/suspended-account.tsx#4"
        initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mb-6"
      >
        <ShieldX data-eos-id="src/pages/auth/suspended-account.tsx#5" className="w-10 h-10 text-error" />
      </motion.div>

      <motion.div data-eos-id="src/pages/auth/suspended-account.tsx#6"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="text-center max-w-sm"
      >
        <h1 data-eos-id="src/pages/auth/suspended-account.tsx#7" className="font-heading text-2xl font-bold text-neutral-900">
          Account Suspended
        </h1>

        <p data-eos-id="src/pages/auth/suspended-account.tsx#8" className="mt-3 text-neutral-500 leading-relaxed">
          Your account has been suspended and you cannot access the app at this time.
        </p>

        {/* Reason card */}
        <div data-eos-id="src/pages/auth/suspended-account.tsx#9" className="mt-6 rounded-sm bg-white border border-neutral-100 p-4 text-left">
          <p data-eos-id="src/pages/auth/suspended-account.tsx#10" className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
            Reason
          </p>
          <p data-eos-id="src/pages/auth/suspended-account.tsx#11" className="text-sm text-neutral-900 leading-relaxed">{reason}</p>
        </div>

        {/* Appeal info */}
        <div data-eos-id="src/pages/auth/suspended-account.tsx#12" className="mt-6 rounded-sm bg-white border border-neutral-100 p-4">
          <p data-eos-id="src/pages/auth/suspended-account.tsx#13" className="text-sm text-neutral-900 leading-relaxed">
            If you believe this is a mistake, please contact us to appeal:
          </p>
          <a data-eos-href="dynamic" data-eos-href-label="Value" data-eos-href-scope="prop" data-eos-id="src/pages/auth/suspended-account.tsx#14"
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 inline-flex items-center gap-2 text-neutral-500 font-medium text-sm hover:underline"
          >
            <Mail data-eos-id="src/pages/auth/suspended-account.tsx#15" size={16} />
            {CONTACT_EMAIL}
          </a>
        </div>
      </motion.div>

      <motion.div data-eos-id="src/pages/auth/suspended-account.tsx#16"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 w-full max-w-sm"
      >
        <Button data-eos-id="src/pages/auth/suspended-account.tsx#17"
          variant="ghost"
          size="lg"
          fullWidth
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </motion.div>
    </div>
  )
}
