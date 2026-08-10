import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { motion } from 'framer-motion'
import {
  Lock, AtSign, Shield, Trash2, AlertTriangle, Undo2,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { BottomSheet } from '@/components/bottom-sheet'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'
import { usePush } from '@/hooks/use-push'
import { supabase } from '@/lib/supabase'
import { isNativePlatform, shareBlobNative, isShareCancellation } from '@/lib/native-share'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'


/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="px-1 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 first:pt-2">
      {label}
    </h3>
  )
}

/* ------------------------------------------------------------------ */
/*  Menu row                                                           */
/* ------------------------------------------------------------------ */

interface MenuRowProps {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick?: () => void
  danger?: boolean
  hideDivider?: boolean
}

function MenuRow({ icon, label, subtitle, onClick, danger = false }: MenuRowProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="flex items-center w-full min-h-[52px] px-4 py-3 text-left transition-colors duration-100 cursor-pointer hover:bg-surface-3 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
      aria-label={label}
    >
      <span
        className={`flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mr-3 ${danger ? 'bg-error-100 text-error-600' : 'bg-neutral-100 text-neutral-500'}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium truncate ${danger ? 'text-error-600' : 'text-neutral-900'}`}>
          {label}
        </span>
        {subtitle && <span className="block text-xs text-neutral-500 truncate mt-0.5">{subtitle}</span>}
      </span>
      <span className="flex items-center shrink-0 ml-3 text-neutral-400">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </span>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  Change Password Sheet                                              */
/* ------------------------------------------------------------------ */

function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updatePassword } = useAuth()
  const { toast } = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setNewPassword('')
      setConfirmPassword('')
      setError('')
    }
  }, [open])

  const handleSubmit = async () => {
    setError('')
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const { error: err } = await updatePassword(newPassword)
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.5]}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
        <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-4">
          Change Password
        </h2>
        <div className="space-y-3">
          <Input
            type="password"
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            error={error && !confirmPassword ? error : undefined}
          />
          <Input
            type="password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            error={error && confirmPassword ? error : undefined}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Update Password
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Change Email Sheet                                                 */
/* ------------------------------------------------------------------ */

function ChangeEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setNewEmail('')
      setError('')
    }
  }, [open])

  const handleSubmit = async () => {
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError('Please enter a valid email')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ email: newEmail })
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      // The login email does NOT change until the new address is confirmed;
      // the current email stays active until then. Say so, so the user doesn't
      // think they're locked out of their old address.
      toast.success(`We sent a confirmation link to ${newEmail}. Your current email stays active until you confirm.`)
      setNewEmail('')
      onClose()
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.4]}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
        <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-2">
          Change Email
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Current: {user?.email}
        </p>
        <div className="space-y-3">
          <Input
            type="email"
            label="New Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
            error={error || undefined}
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Send Verification
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  GDPR Data Export / Deletion Sheet                                  */
/* ------------------------------------------------------------------ */

function DataPrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data, error } = await supabase.functions.invoke('data-export')
      if (error) throw error

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const filename = `coexist-data-export-${new Date().toISOString().slice(0, 10)}.json`

      if (isNativePlatform()) {
        // The Capacitor WKWebView / Android WebView has no <a download>
        // handler, so the anchor-click path is a silent no-op on device (the
        // user taps, sees a success toast, and no file is delivered). Hand the
        // blob to the native share sheet instead, so it can be saved to Files
        // or shared. Same root cause + primitive as the .ics/media share fix.
        await shareBlobNative(blob, filename, { title: 'Your Co-Exist data export' })
        toast.success('Your data is ready to save or share.')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Your data has been downloaded.')
      }
    } catch (err) {
      // Dismissing the native share sheet is not a failure - the export
      // succeeded, the user just chose not to save it. Stay silent then.
      if (!isShareCancellation(err)) {
        toast.error('Export request failed. Please try again.')
      }
    }
    setExporting(false)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.45]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-2">
        Your Data & Privacy
      </h2>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        Under GDPR and the Australian Privacy Act, you have the right to access, export,
        and delete your personal data.
      </p>
      <div className="space-y-2">
        <Button variant="secondary" fullWidth loading={exporting} onClick={handleExport}>
          Request Data Export
        </Button>
        <p className="text-xs text-neutral-500 text-center">
          {isNativePlatform()
            ? 'Your complete data is prepared as a JSON file you can save or share straight away.'
            : 'Your complete data downloads to this device as a JSON file straight away.'}
        </p>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete Account Sheet (typed re-confirmation)                       */
/*                                                                     */
/*  The in-app path starts the same destructive 30-day deletion from   */
/*  an already-authed session; a single tap was too easy to trigger by */
/*  accident. Require the user to type DELETE (matching the friction   */
/*  the public account-deletion path gets from re-auth). Works for     */
/*  password AND OAuth accounts, which a password re-prompt would not. */
/* ------------------------------------------------------------------ */

function DeleteAccountSheet({
  open,
  onClose,
  onConfirm,
  deleting,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const canDelete = typed.trim().toUpperCase() === 'DELETE'

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.55]}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-error-100 text-error-600">
          <AlertTriangle size={16} />
        </div>
        <h2 className="font-heading text-lg font-semibold text-neutral-900">Delete Account?</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        Your account will be marked for deletion. You have 30 days to recover it from Settings before
        all your data is permanently removed. To confirm, type <span className="font-semibold text-neutral-900">DELETE</span> below.
      </p>
      <Input
        label="Type DELETE to confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoCapitalize="characters"
        autoCorrect="off"
        placeholder="DELETE"
      />
      <div className="mt-4 space-y-2">
        <Button
          variant="danger"
          fullWidth
          loading={deleting}
          disabled={!canDelete}
          onClick={onConfirm}
        >
          Delete My Account
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose} disabled={deleting}>
          Keep My Account
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsAccountPage() {
  const navigate = useNavigate()
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { toast } = useToast()
  const { unregister: unregisterPush } = usePush()
  const shouldReduceMotion = useReducedMotion()

  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [showDataPrivacy, setShowDataPrivacy] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  type ProfileExt = { deleted_at?: string; deletion_status?: string; deletion_requested_at?: string }
  const profileExt = profile as unknown as ProfileExt | null

  const isPendingDeletion = profileExt?.deletion_status === 'pending_deletion'
  const deletionRequestedAt = profileExt?.deletion_requested_at
    ? new Date(profileExt.deletion_requested_at)
    : null
  const deletionDaysLeft = deletionRequestedAt
    ? Math.max(0, 30 - Math.floor((Date.now() - deletionRequestedAt.getTime()) / (1000 * 60 * 60 * 24)))
    : null

  const [deletingAccount, setDeletingAccount] = useState(false)
  const handleDeleteAccount = async () => {
    if (!user || deletingAccount) return
    setDeletingAccount(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        deletion_status: 'pending_deletion',
        deletion_requested_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      toast.error('Failed to delete account. Please contact support.')
      setDeletingAccount(false)
      return
    }
    toast.info('Account marked for deletion. You have 30 days to recover it.')
    await unregisterPush()
    await signOut()
    navigate('/welcome')
  }

  const [cancellingDeletion, setCancellingDeletion] = useState(false)
  const handleCancelDeletion = async () => {
    if (!user) return
    setCancellingDeletion(true)
    try {
      const { error } = await supabase.rpc('recover_pending_deletion', { uid: user.id })
      if (error) {
        toast.error('Failed to cancel deletion. Please contact support.')
        return
      }
      toast.success('Account deletion cancelled. Your account is safe.')
      await refreshProfile()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setCancellingDeletion(false)
    }
  }

  return (
    <Page noBackground stickyOverlay={<Header title="Account" back transparent className="collapse-header" />}>
      <div className="relative" style={{ paddingTop: '3.5rem' }}>

        <motion.div
          className="pb-8"
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* Pending deletion banner */}
          {isPendingDeletion && (
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
              <div className="mt-2 rounded-md border border-bark-200 bg-bark-50/90 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-sm bg-bark-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-bark-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-bark-800 text-sm">Account scheduled for deletion</p>
                    <p className="text-xs text-bark-600 mt-0.5">
                      {deletionDaysLeft != null && deletionDaysLeft > 0
                        ? `Your data will be permanently removed in ${deletionDaysLeft} day${deletionDaysLeft === 1 ? '' : 's'}.`
                        : 'Your data will be permanently removed soon.'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  icon={<Undo2 size={16} />}
                  loading={cancellingDeletion}
                  onClick={handleCancelDeletion}
                >
                  Cancel deletion
                </Button>
              </div>
            </motion.div>
          )}

          {/* ---- Security ---- */}
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SectionHeader label="Security" />
            <div className="bg-white/90 rounded-md shadow-sm border border-neutral-100 overflow-hidden">
              <MenuRow
                icon={<Lock size={18} />}
                label="Change Password"
                onClick={() => setShowChangePassword(true)}
              />
              <MenuRow
                icon={<AtSign size={18} />}
                label="Change Email"
                subtitle={user?.email}
                onClick={() => setShowChangeEmail(true)}
              />
            </div>
          </motion.div>

          {/* ---- Data ---- */}
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SectionHeader label="Data & Privacy" />
            <div className="bg-white/90 rounded-md shadow-sm border border-neutral-100 overflow-hidden">
              <MenuRow
                icon={<Shield size={18} />}
                label="Your Data & Privacy"
                subtitle="Export or delete your data (GDPR)"
                onClick={() => setShowDataPrivacy(true)}
              />
            </div>
          </motion.div>

          {/* ---- Danger Zone ---- */}
          {!isPendingDeletion && (
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
              <SectionHeader label="Danger Zone" />
              <div className="bg-white/90 rounded-md shadow-sm border border-error-100 overflow-hidden">
                <MenuRow
                  icon={<Trash2 size={18} />}
                  label="Delete Account"
                  danger
                  onClick={() => setShowDeleteConfirm(true)}
                />
              </div>
            </motion.div>
          )}

          {/* Sheets */}
          <ChangePasswordSheet open={showChangePassword} onClose={() => setShowChangePassword(false)} />
          <ChangeEmailSheet open={showChangeEmail} onClose={() => setShowChangeEmail(false)} />
          <DataPrivacySheet open={showDataPrivacy} onClose={() => setShowDataPrivacy(false)} />

          <DeleteAccountSheet
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDeleteAccount}
            deleting={deletingAccount}
          />
        </motion.div>
      </div>
    </Page>
  )
}
