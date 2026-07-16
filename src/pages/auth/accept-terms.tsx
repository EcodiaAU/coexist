import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { Button } from '@/components/button'
import { Checkbox } from '@/components/checkbox'
import { Header } from '@/components/header'
import { useAuth } from '@/hooks/use-auth'
import { CURRENT_TOS_VERSION, TOS_CHANGE_SUMMARY, TOS_CHANGE_HIGHLIGHTS, TOS_COMMUNITY_STANDARDS } from '@/lib/constants'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

export default function AcceptTermsPage() {
  const navigate = useNavigate()
  const { acceptTos, signOut, isSuspended, user, needsTosAcceptance } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const [agreed, setAgreed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Suspended users should not be on this page
  if (isSuspended) return <Navigate to="/suspended" replace />
  // If not authenticated, redirect to login
  if (!user) return <Navigate to="/login" replace />
  // If TOS is already accepted, go home
  if (!needsTosAcceptance) return <Navigate to="/" replace />

  const handleAccept = async () => {
    setIsSubmitting(true)
    try {
      await acceptTos(CURRENT_TOS_VERSION)
      navigate('/', { replace: true })
    } catch {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async () => {
    await signOut()
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <Header title="Updated Terms" />

      <motion.div
        className="flex-1 flex flex-col px-6 pt-6"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-sm bg-neutral-50 text-neutral-400">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-neutral-900">
              Terms & Conditions Updated
            </h1>
            <p className="text-sm text-neutral-500">Version {CURRENT_TOS_VERSION}</p>
          </div>
        </motion.div>

        <motion.p variants={shouldReduceMotion ? undefined : fadeUp} className="text-sm text-neutral-500 leading-relaxed mb-4">
          We've updated our Terms of Service and Privacy Policy. Please review and accept
          the updated terms to continue using Co-Exist.
        </motion.p>

        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex-1 overflow-y-auto rounded-sm border border-neutral-100 bg-white p-4 mb-4 max-h-[50vh]">
          <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
            Summary of Changes
          </h2>
          <ul className="space-y-2 text-xs text-neutral-500 list-disc pl-4">
            {TOS_CHANGE_SUMMARY.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {TOS_CHANGE_HIGHLIGHTS.map((h) => (
              <li key={h.label}><strong className="text-neutral-900">{h.label}</strong> &mdash; {h.detail}</li>
            ))}
          </ul>

          <h2 className="font-heading text-sm font-semibold text-neutral-900 mt-4 mb-2">
            Community Standards
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            {TOS_COMMUNITY_STANDARDS}
          </p>
        </motion.div>

        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            label="I have read and agree to the updated Terms of Service and Privacy Policy"
          />
        </motion.div>

        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="mt-6 space-y-3"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!agreed}
            loading={isSubmitting}
            onClick={handleAccept}
          >
            Accept & Continue
          </Button>

          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleDecline}
            className="text-neutral-500"
          >
            Decline & Log Out
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}
