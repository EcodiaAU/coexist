import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'

/**
 * App-wide "your account is scheduled for deletion" banner.
 *
 * Why this exists (D7, silent account loss): the delete flow was changed to
 * an informed-choice model - logging back in NO LONGER auto-recovers a
 * pending deletion (use-auth.ts loadUserData: "We no longer auto-recover on
 * login"). Recovery is only via Settings > Account > Cancel deletion. But a
 * user who deletes, reconsiders, and logs back in lands on a normal-looking
 * app with no reminder, then gets permanently purged by the daily
 * cleanup_deleted_accounts() cron at day 30. The only pending-deletion notice
 * lived on the Settings > Account page, which such a user never opens. This
 * banner surfaces the pending state (and a one-tap cancel) on EVERY authed
 * screen so the loss cannot be silent.
 *
 * Self-hides on /settings/account, where the dedicated banner + Cancel
 * deletion control already live, to avoid a duplicate.
 */
type ProfileDeletionExt = {
  deletion_status?: string
  deletion_requested_at?: string
}

export function PendingDeletionBanner() {
  const { user, profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [cancelling, setCancelling] = useState(false)

  const ext = profile as unknown as ProfileDeletionExt | null
  const isPending = ext?.deletion_status === 'pending_deletion'

  // The Settings > Account page carries its own richer banner + control.
  const onAccountPage = location.pathname.startsWith('/settings/account')

  if (!user || !isPending || onAccountPage) return null

  const requestedAt = ext?.deletion_requested_at ? new Date(ext.deletion_requested_at) : null
  const daysLeft = requestedAt
    ? Math.max(0, 30 - Math.floor((Date.now() - requestedAt.getTime()) / (1000 * 60 * 60 * 24)))
    : null

  const handleCancel = async () => {
    if (!user || cancelling) return
    setCancelling(true)
    try {
      const { error } = await supabase.rpc('recover_pending_deletion', { uid: user.id })
      if (error) {
        toast.error('Could not cancel deletion. Open Settings > Account, or contact support.')
        return
      }
      toast.success('Account deletion cancelled. Your account is safe.')
      await refreshProfile()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-bark-600 text-white text-sm"
    >
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[12rem] font-medium">
        {daysLeft != null && daysLeft > 0
          ? `Your account is scheduled for deletion in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
          : 'Your account is scheduled for deletion.'}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className="inline-flex items-center gap-1.5 rounded-sm bg-white/15 hover:bg-white/25 disabled:opacity-60 px-3 py-1.5 font-semibold transition-colors"
        >
          <Undo2 size={14} aria-hidden="true" />
          {cancelling ? 'Cancelling...' : 'Cancel deletion'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings/account')}
          className="rounded-sm px-2 py-1.5 font-medium text-white/80 hover:text-white underline underline-offset-2"
        >
          Details
        </button>
      </div>
    </div>
  )
}
