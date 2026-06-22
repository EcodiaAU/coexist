import { useState, useCallback, useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import { motion } from 'framer-motion'
import { Eye, Mail, ShieldOff } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Toggle } from '@/components/toggle'
import { BottomSheet } from '@/components/bottom-sheet'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'
import { supabase } from '@/lib/supabase'
import { patchNotificationPrefs } from '@/lib/profile-prefs'
import { useBlockedUsers, useUnblockUser } from '@/hooks/use-user-blocks'
import type { NotificationPreferences } from '@/hooks/use-notifications'
import { DEFAULT_PREFERENCES } from '@/hooks/use-notifications'
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

function MenuRow({
  icon,
  label,
  subtitle,
  onClick,
  rightContent,
}: {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick?: () => void
  rightContent?: React.ReactNode
}) {
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
      <span className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mr-3 bg-neutral-100 text-neutral-500" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-neutral-900 truncate">{label}</span>
        {subtitle && <span className="block text-xs text-neutral-500 truncate mt-0.5">{subtitle}</span>}
      </span>
      <span className="flex items-center shrink-0 ml-3 text-neutral-400">
        {rightContent}
      </span>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  Blocked Users Sheet                                                */
/* ------------------------------------------------------------------ */

function BlockedUsersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: blockedUsers, isLoading } = useBlockedUsers()
  const unblock = useUnblockUser()
  const { toast } = useToast()

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.55]}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-error-100 text-error-600">
          <ShieldOff size={16} />
        </div>
        <h2 className="font-heading text-lg font-semibold text-neutral-900">
          Blocked Users
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton variant="text" className="h-12 rounded-lg" />
          <Skeleton variant="text" className="h-12 rounded-lg" />
        </div>
      ) : !blockedUsers || blockedUsers.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-6">
          You haven&apos;t blocked anyone
        </p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {blockedUsers.map((block) => (
            <div key={block.blocked_id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-neutral-50">
              <span className="text-sm text-neutral-700 truncate flex-1">{block.blocked_id}</span>
              <button
                type="button"
                onClick={() => {
                  unblock.mutate(block.blocked_id, {
                    onSuccess: () => toast.success('User unblocked'),
                    onError: () => toast.error('Failed to unblock'),
                  })
                }}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-700 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer select-none"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPrivacyPage() {
  const { user, profile } = useAuth()
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()

  const [showBlockedUsers, setShowBlockedUsers] = useState(false)

  // Privacy state
  // IMPORTANT: initial state is null, not a default. We refuse to render
  // toggles or allow writes until we've hydrated from the DB. Previous bug:
  // initial `true` defaults were written to the DB if the user toggled before
  // hydration finished, silently flipping saved privacy settings back to public.
  type ProfileExt = { notification_preferences?: Partial<NotificationPreferences> & { sound_enabled?: boolean; profile_visible?: boolean }; marketing_opt_in?: boolean }
  const profileExt = profile as unknown as ProfileExt | null

  const [profileVisible, setProfileVisible] = useState<boolean | null>(null)
  const [marketingOptIn, setMarketingOptIn] = useState<boolean | null>(null)
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!profileExt || hydrated) return
    const saved = profileExt.notification_preferences
    if (saved) {
      setPrefs((prev) => ({ ...prev, ...(saved as Partial<NotificationPreferences>) }))
      // Absence of a saved value means never-explicitly-set. Default policy:
      // profile_visible defaults to true (public), sound_enabled defaults to true.
      setSoundEnabled(saved.sound_enabled !== undefined ? saved.sound_enabled : true)
      setProfileVisible(saved.profile_visible !== undefined ? saved.profile_visible : true)
    } else {
      setSoundEnabled(true)
      setProfileVisible(true)
    }
    setMarketingOptIn(profileExt.marketing_opt_in !== false)
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileExt])

  const handleVisibilityToggle = useCallback(
    (value: boolean) => {
      // Hard gate: refuse to write until hydrated. Prevents the silent-revert bug.
      if (!user || !hydrated) return
      const prev = profileVisible
      setProfileVisible(value)
      // Merge-write via helper - never touches fields owned by other pages.
      patchNotificationPrefs(user.id, { profile_visible: value }).then(({ error }) => {
        if (error) {
          console.error('Failed to save profile visibility:', error)
          setProfileVisible(prev)
          toast.error('Could not save - try again')
        }
      })
    },
    [user, hydrated, profileVisible, toast],
  )

  const handleMarketingToggle = useCallback(
    (value: boolean) => {
      if (!user || !hydrated) return
      const prev = marketingOptIn
      setMarketingOptIn(value)
      supabase
        .from('profiles')
        .update({ marketing_opt_in: value })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to save marketing opt-in:', error)
            setMarketingOptIn(prev)
            toast.error('Could not save - try again')
          }
        })
    },
    [user, hydrated, marketingOptIn, toast],
  )

  return (
    <Page noBackground stickyOverlay={<Header title="Privacy" back transparent className="collapse-header" />}>
      <div className="relative" style={{ paddingTop: '3.5rem' }}>

        <motion.div
          className="pb-8"
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* ---- Visibility ---- */}
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SectionHeader label="Visibility" />
            <div className="bg-white/90 rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
              <MenuRow
                icon={<Eye size={18} />}
                label="Profile Visibility"
                subtitle={hydrated ? (profileVisible ? 'Public' : 'Only collective members') : 'Loading…'}
                rightContent={
                  hydrated ? (
                    // stopPropagation so the inner Toggle button's click doesn't
                    // bubble up to MenuRow's outer button. Without this, tapping
                    // the switch fires both handlers (nested <button> inside
                    // <button> is invalid HTML and double-dispatches).
                    <span onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={profileVisible ?? true}
                        onChange={handleVisibilityToggle}
                        size="sm"
                      />
                    </span>
                  ) : (
                    <Skeleton variant="text" className="w-10 h-6 rounded-full" />
                  )
                }
                onClick={() => hydrated && handleVisibilityToggle(!profileVisible)}
              />
              <MenuRow
                icon={<Mail size={18} />}
                label="Marketing Emails"
                subtitle={hydrated ? (marketingOptIn ? 'Subscribed' : 'Unsubscribed') : 'Loading…'}
                rightContent={
                  hydrated ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={marketingOptIn ?? true}
                        onChange={handleMarketingToggle}
                        size="sm"
                      />
                    </span>
                  ) : (
                    <Skeleton variant="text" className="w-10 h-6 rounded-full" />
                  )
                }
                onClick={() => hydrated && handleMarketingToggle(!marketingOptIn)}
              />
            </div>
          </motion.div>

          {/* ---- Blocked Users ---- */}
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
            <SectionHeader label="Blocked Users" />
            <div className="bg-white/90 rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
              <MenuRow
                icon={<ShieldOff size={18} />}
                label="Blocked Users"
                subtitle="Manage blocked accounts"
                onClick={() => setShowBlockedUsers(true)}
              />
            </div>
          </motion.div>

          <BlockedUsersSheet
            open={showBlockedUsers}
            onClose={() => setShowBlockedUsers(false)}
          />
        </motion.div>
      </div>
    </Page>
  )
}
