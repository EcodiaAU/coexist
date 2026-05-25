import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { supabase } from '@/lib/supabase'
import { resolveCapabilities } from '@/lib/capabilities'
import { CURRENT_TOS_VERSION, GLOBAL_ROLE_RANK, COLLECTIVE_ROLE_RANK } from '@/lib/constants'
import type { Database } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  One-time SocialLogin initialization (native only)                  */
/* ------------------------------------------------------------------ */

const initialized = new Set<'google' | 'apple'>()
const initInFlight = new Map<'google' | 'apple', Promise<void>>()

function ensureSocialLogin(provider: 'google' | 'apple'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  if (initialized.has(provider)) return Promise.resolve()
  const existing = initInFlight.get(provider)
  if (existing) return existing

  let config: Parameters<typeof SocialLogin.initialize>[0]
  if (provider === 'google') {
    // The webClientId MUST be the Google Cloud "Web application" OAuth client ID
    // (client_type 3 in google-services.json), NOT the Android client. Android
    // sign-in via CredentialManager requires the web client ID even though the
    // call happens on a phone. Fall back to the known project value so a missing
    // env var on a build machine doesn't silently break Google sign-in.
    const webClientId =
      import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
      '528428779228-8ggdoqckphnq0hcvj0pr2b4r124530st.apps.googleusercontent.com'
    const iOSClientId = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID
    config = {
      google: {
        webClientId,
        ...(iOSClientId ? { iOSClientId, iOSServerClientId: webClientId } : {}),
        mode: 'online',
      },
    }
  } else {
    const appleServiceId = import.meta.env.VITE_APPLE_SERVICE_ID
    // On Android the Apple plugin requires a Service ID + redirectUrl (web OAuth flow).
    // iOS uses native Sign in with Apple and ignores these.
    if (Capacitor.getPlatform() === 'android' && !appleServiceId) {
      return Promise.reject(
        new Error('Apple sign-in is not yet configured for Android. Please use Google or email.'),
      )
    }
    config = {
      apple: {
        clientId: appleServiceId,
        redirectUrl: `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/callback`,
      },
    }
  }

  const p = SocialLogin.initialize(config)
    .then(() => { initialized.add(provider) })
    .catch((err) => {
      console.error(`[social-login] init failed for ${provider}:`, err)
      throw err
    })
    .finally(() => { initInFlight.delete(provider) })
  initInFlight.set(provider, p)
  return p
}

type Profile = Database['public']['Tables']['profiles']['Row']
type UserRole = Database['public']['Enums']['user_role']
type CollectiveRole = Database['public']['Enums']['collective_role']


/* ------------------------------------------------------------------ */
/*  Capacitor persistence helpers                                      */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'coexist-auth-session'
const PROFILE_STORAGE_KEY = 'coexist-auth-profile'
const ONBOARDING_DONE_KEY = 'coexist-onboarding-done'

async function persistSession(session: Session | null) {
  if (!Capacitor.isNativePlatform()) return
  if (session) {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(session) })
  } else {
    await Preferences.remove({ key: STORAGE_KEY })
  }
}

async function restoreSession(): Promise<Session | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { value } = await Preferences.get({ key: STORAGE_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as Session
  } catch {
    return null
  }
}

/** Lightweight flag that survives even when profile fetch fails */
function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, '1')
  } catch { /* non-critical */ }
  if (Capacitor.isNativePlatform()) {
    Preferences.set({ key: ONBOARDING_DONE_KEY, value: '1' }).catch(() => {})
  }
}

function getOnboardingDoneSync(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'
  } catch {
    return false
  }
}

async function persistProfile(profile: Profile | null) {
  try {
    if (profile) {
      await Preferences.set({ key: PROFILE_STORAGE_KEY, value: JSON.stringify(profile) })
    } else {
      await Preferences.remove({ key: PROFILE_STORAGE_KEY })
    }
  } catch {
    // Non-critical - worst case user sees a brief loading state
  }
}

async function restoreProfile(): Promise<Profile | null> {
  try {
    const { value } = await Preferences.get({ key: PROFILE_STORAGE_KEY })
    if (!value) return null
    return JSON.parse(value) as Profile
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Auth context types                                                 */
/* ------------------------------------------------------------------ */

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  session: Session | null
  role: UserRole
  collectiveRoles: CollectiveMembership[]
  isLoading: boolean
  authError: string | null
  isSuspended: boolean
  suspendedReason: string | null
  suspendedUntil: string | null
  needsTosAcceptance: boolean
  isLeader: (collectiveId: string) => boolean
  isAssistLeader: (collectiveId: string) => boolean
  isCoLeader: (collectiveId: string) => boolean
  capabilities: Set<string>
  hasCapability: (key: string) => boolean
  isStaff: boolean
  isManager: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  managedCollectiveIds: string[]
  signUp: (email: string, password: string, displayName: string, dateOfBirth?: string) => Promise<{ error: AuthError | null; hasSession?: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signInWithApple: () => Promise<{ error: AuthError | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
  refreshProfile: () => Promise<void>
  acceptTos: (version: string) => Promise<void>
  onboardingDone: boolean
  markOnboardingComplete: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/* ------------------------------------------------------------------ */
/*  Provider hook (internal)                                           */
/* ------------------------------------------------------------------ */

interface CollectiveMembership {
  collective_id: string
  role: CollectiveRole
}

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [collectiveRoles, setCollectiveRoles] = useState<CollectiveMembership[]>([])
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean> | null>(null)
  const [managedCollectiveIds, setManagedCollectiveIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(getOnboardingDoneSync)

  /* ---- fetch profile ---- */
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) {
        console.error('[auth] fetchProfile error:', error.message, error.code)
        return null
      }
      return data
    } catch (err) {
      console.error('[auth] fetchProfile exception:', err)
      return null
    }
  }, [])

  /* ---- fetch staff permission overrides + managed collectives ---- */
  const fetchStaffData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('staff_roles')
        .select('permissions, managed_collectives')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) return { permissions: null, managedCollectives: [] as string[] }
      return {
        permissions: (data?.permissions ?? null) as Record<string, boolean> | null,
        managedCollectives: ((data as Record<string, unknown>)?.managed_collectives ?? []) as string[],
      }
    } catch {
      return { permissions: null, managedCollectives: [] as string[] }
    }
  }, [])

  /* ---- fetch collective memberships ---- */
  const fetchCollectiveRoles = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('collective_members')
        .select('collective_id, role')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (error) {
        console.error('[auth] fetchCollectiveRoles error:', error.message, error.code)
        return []
      }
      return data ?? []
    } catch (err) {
      console.error('[auth] fetchCollectiveRoles exception:', err)
      return []
    }
  }, [])

  /* ---- load user data (profile + collective roles) ---- */
  const loadUserData = useCallback(async (userId: string) => {
    const [profileData, roles, staffData] = await Promise.all([
      fetchProfile(userId),
      fetchCollectiveRoles(userId),
      fetchStaffData(userId),
    ])
    const permOverrides = staffData.permissions
    const managedCols = staffData.managedCollectives
    // Helper to apply all fetched state
    const applyState = (p: Profile) => {
      setProfile(p)
      setCollectiveRoles(roles as CollectiveMembership[])
      setPermissionOverrides(permOverrides)
      setManagedCollectiveIds(managedCols)
      persistProfile(p)
      if (p.onboarding_completed) { markOnboardingDone(); setOnboardingDone(true) }
    }

    // If no profile row exists, it likely means the fetch timed out or
    // the auth trigger hasn't fired yet. Retry once before creating.
    if (!profileData) {
      const retried = await fetchProfile(userId)
      if (retried) {
        applyState(retried)
        return retried
      }

      try {
        const { data: authUser } = await supabase.auth.getUser()
        const meta = authUser?.user?.user_metadata
        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            display_name: meta?.display_name ?? meta?.full_name ?? meta?.email?.split('@')[0] ?? 'New User',
            avatar_url: meta?.avatar_url ?? null,
          }, { onConflict: 'id' })
          .select('*')
          .single()
        if (createErr) {
          console.error('[auth] Profile create/upsert error:', createErr.message, createErr.code)
          setAuthError('Failed to set up your profile. Please try again.')
        }
        if (created) {
          setAuthError(null)
          applyState(created)
          return created
        }
      } catch (err) {
        console.error('[auth] Failed to create profile:', err)
        setAuthError('Failed to set up your profile. Please try again.')
      }
    }

    // Check suspension server-side (the RPC handles expiry clearance securely)
    if (profileData?.is_suspended) {
      try {
        const { data: suspCheck } = await supabase.rpc('check_user_suspended', { uid: userId })
        const suspResult = suspCheck as { suspended?: boolean } | null
        if (suspResult && !suspResult.suspended) {
          // Server cleared the expired suspension - refresh profile data
          profileData.is_suspended = false
          profileData.suspended_reason = null
          profileData.suspended_until = null
        }
      } catch {
        // If RPC fails, keep the client-side suspended state as-is
      }
    }

    // If account is pending deletion, keep the status so the UI can show it.
    // The user can cancel deletion from Settings. We no longer auto-recover
    // on login so the user sees the pending state and can make an informed choice.

    setProfile(profileData)
    setCollectiveRoles(roles as CollectiveMembership[])
    setPermissionOverrides(permOverrides)
    setManagedCollectiveIds(managedCols)
    persistProfile(profileData)
    if (profileData?.onboarding_completed) { markOnboardingDone(); setOnboardingDone(true) }
    return profileData
  }, [fetchProfile, fetchCollectiveRoles, fetchStaffData])

  /* ---- refresh profile (public) ---- */
  const refreshProfile = useCallback(async () => {
    if (!user) return
    setAuthError(null)
    await loadUserData(user.id)
  }, [user, loadUserData])

  /* ---- init: restore session + subscribe ---- */
  useEffect(() => {
    let mounted = true

    // Immediately seed cached profile so the route guard never flashes
    // onboarding while we wait for Supabase auth to resolve.
    restoreProfile().then((cached) => {
      if (cached && mounted) {
        setProfile(cached)
        if (cached.onboarding_completed) { markOnboardingDone(); setOnboardingDone(true) }
      }
    })

    // For native: restore the persisted session and set it on the client.
    // This triggers onAuthStateChange SIGNED_IN which handles everything.
    if (Capacitor.isNativePlatform()) {
      restoreSession().then(async (restored) => {
        if (restored) {
          await supabase.auth.setSession(restored)
        }
        // If no restored session, onAuthStateChange INITIAL_SESSION
        // will fire with null - handled below.
      })
    }

    // Let onAuthStateChange be the single source of truth for auth state.
    // This avoids the getSession() timeout / lock deadlock issues.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return

        setSession(newSession)
        setUser(newSession?.user ?? null)
        persistSession(newSession)

        if (newSession?.user) {
          const userId = newSession.user.id
          // Defer loadUserData - calling it inside onAuthStateChange can
          // deadlock because the Supabase JS client holds an internal auth
          // lock during token recovery, blocking any fetch that needs auth.
          setTimeout(async () => {
            if (!mounted) return
            try {
              await loadUserData(userId)

              // Accept pending referral code (stored during signup, consumed once)
              try {
                const pendingRef = localStorage.getItem('coexist_referral_code')
                if (pendingRef) {
                  localStorage.removeItem('coexist_referral_code')
                  await supabase.rpc('accept_referral', { referral_code: pendingRef })
                }
              } catch { /* referral acceptance is best-effort */ }
            } catch (err) {
              console.error('[auth] loadUserData failed:', err)
            } finally {
              if (mounted) {
                setIsLoading(false)
              }
            }
          }, 0)
        } else {
          setProfile(null)
          setCollectiveRoles([])
          setPermissionOverrides(null)
          setManagedCollectiveIds([])
          persistProfile(null)
          setIsLoading(false)
        }
      },
    )

    // Safety: if nothing fires within 10s, unblock the UI.
    const safety = setTimeout(() => {
      if (mounted) {
        setIsLoading(false)
      }
    }, 10000)

    return () => {
      mounted = false
      clearTimeout(safety)
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- realtime: refresh on role/profile changes ---- */
  useEffect(() => {
    if (!user) return

    // Subscribe to changes on the user's collective_members rows
    const memberChannel = supabase
      .channel(`auth-member-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collective_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => { loadUserData(user.id) },
      )
      .subscribe()

    // Subscribe to changes on the user's profile (role, suspension, etc.)
    const profileChannel = supabase
      .channel(`auth-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => { loadUserData(user.id) },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(memberChannel)
      supabase.removeChannel(profileChannel)
    }
  }, [user, loadUserData])

  /* ---- collective role checkers ---- */
  const getCollectiveRole = useCallback(
    (collectiveId: string): CollectiveRole | null => {
      const membership = collectiveRoles.find((m) => m.collective_id === collectiveId)
      return membership?.role ?? null
    },
    [collectiveRoles],
  )

  const isLeader = useCallback(
    (collectiveId: string) => getCollectiveRole(collectiveId) === 'leader',
    [getCollectiveRole],
  )

  const isAssistLeader = useCallback(
    (collectiveId: string) => {
      const role = getCollectiveRole(collectiveId)
      return role !== null && COLLECTIVE_ROLE_RANK[role] >= COLLECTIVE_ROLE_RANK.assist_leader
    },
    [getCollectiveRole],
  )

  const isCoLeader = useCallback(
    (collectiveId: string) => {
      const role = getCollectiveRole(collectiveId)
      return role !== null && COLLECTIVE_ROLE_RANK[role] >= COLLECTIVE_ROLE_RANK.co_leader
    },
    [getCollectiveRole],
  )

  /* ---- global role checks ---- */
  const role = profile?.role ?? 'participant'
  const roleRank = GLOBAL_ROLE_RANK[role] ?? 0
  const isStaff = roleRank >= GLOBAL_ROLE_RANK.national_leader
  const isAdmin = roleRank >= GLOBAL_ROLE_RANK.admin
  const isManager = roleRank >= GLOBAL_ROLE_RANK.manager
  const isSuperAdmin = isAdmin // kept for backwards compat, same as isAdmin

  /* ---- capabilities (frontend-only gating) ---- */
  const capabilities = useMemo(
    () => resolveCapabilities(role, permissionOverrides),
    [role, permissionOverrides],
  )

  const hasCapability = useCallback(
    (key: string) => capabilities.has(key),
    [capabilities],
  )

  /* ---- suspended / TOS checks ---- */
  const isSuspended = profile?.is_suspended ?? false
  const suspendedReason = profile?.suspended_reason ?? null
  const suspendedUntil = profile?.suspended_until ?? null
  const needsTosAcceptance = !!profile && profile.tos_accepted_version !== CURRENT_TOS_VERSION

  const markOnboardingComplete = useCallback(() => {
    markOnboardingDone()
    setOnboardingDone(true)
  }, [])

  const acceptTos = useCallback(async (version: string) => {
    if (!user) return
    // Only allow accepting the current TOS version to prevent future-version bypass
    if (version !== CURRENT_TOS_VERSION) return
    const { error } = await supabase
      .from('profiles')
      .update({ tos_accepted_version: version, tos_accepted_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) throw new Error('Failed to accept Terms of Service. Please try again.')
    await loadUserData(user.id)
  }, [user, loadUserData])

  /* ---- auth actions ---- */
  const signUp = useCallback(async (email: string, password: string, displayName: string, dateOfBirth?: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, date_of_birth: dateOfBirth },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback`,
      },
    })

    // Send welcome email on successful signup
    if (!error && data.user) {
      supabase.functions.invoke('send-email', {
        body: {
          type: 'welcome',
          to: email,
          data: {
            name: displayName,
            app_url: 'https://app.coexistaus.org',
          },
        },
      }).catch(console.error)
    }

    // When the project has `mailer_autoconfirm` enabled, signUp returns a
    // full session immediately and no verification email is sent. Surface
    // that so the caller can skip the "check your email" screen.
    return { error, hasSession: !!data?.session }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    // Native: use Google SDK → get ID token → pass to Supabase
    if (Capacitor.isNativePlatform()) {
      try {
        await ensureSocialLogin('google')
        // Do NOT pass `scopes` here. @capgo/capacitor-social-login on Android
        // hard-rejects ANY scopes array unless MainActivity extends
        // ModifiedMainActivityForSocialLoginPlugin (see GoogleProvider.java).
        // email + profile + openid are added as defaults by the plugin on
        // both Android and iOS, which is exactly what Supabase signInWithIdToken
        // needs - so passing scopes is both redundant and breaks Android signup.
        const result = await SocialLogin.login({ provider: 'google', options: {} })
        const idToken = (result?.result as unknown as Record<string, unknown>)?.idToken as string | undefined
        if (!idToken) return { error: { message: 'No ID token received from Google', status: 400 } as unknown as AuthError }
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
        return { error }
      } catch (err: unknown) {
        // User cancelled = not an error
        const e = err as { message?: string; code?: string }
        if (e?.message?.includes('cancel') || e?.code === 'SIGN_IN_CANCELLED') return { error: null }
        return { error: { message: e?.message ?? 'Google sign-in failed', status: 500 } as unknown as AuthError }
      }
    }
    // Web: use Supabase OAuth redirect
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback` },
    })
    return { error }
  }, [])

  const signInWithApple = useCallback(async () => {
    // Native: use Apple SDK → get ID token → pass to Supabase
    if (Capacitor.isNativePlatform()) {
      try {
        await ensureSocialLogin('apple')
        const result = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'] } })
        const idToken = (result?.result as unknown as Record<string, unknown>)?.idToken as string | undefined
        if (!idToken) return { error: { message: 'No ID token received from Apple', status: 400 } as unknown as AuthError }
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken })
        return { error }
      } catch (err: unknown) {
        // User cancelled = not an error
        const e = err as { message?: string; code?: string }
        if (e?.message?.includes('cancel') || e?.code === '1001') return { error: null }
        return { error: { message: e?.message ?? 'Apple sign-in failed', status: 500 } as unknown as AuthError }
      }
    }
    // Web: use Supabase OAuth redirect
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback` },
    })
    return { error }
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback` },
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    await persistSession(null)
    await persistProfile(null)
    // Clear onboarding flag so a different user gets a fresh start
    try {
      localStorage.removeItem(ONBOARDING_DONE_KEY)
      localStorage.removeItem('coexist_referral_code')
    } catch { /* */ }
    if (Capacitor.isNativePlatform()) {
      Preferences.remove({ key: ONBOARDING_DONE_KEY }).catch(() => {})
    }
    setOnboardingDone(false)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
    })
    return { error }
  }, [])

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error }
  }, [])

  return useMemo(
    () => ({
      user,
      profile,
      session,
      role,
      collectiveRoles,
      capabilities,
      hasCapability,
      isLoading,
      authError,
      isSuspended,
      suspendedReason,
      suspendedUntil,
      needsTosAcceptance,
      isLeader,
      isAssistLeader,
      isCoLeader,
      isStaff,
      isManager,
      isAdmin,
      isSuperAdmin,
      managedCollectiveIds,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signInWithMagicLink,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
      acceptTos,
      onboardingDone,
      markOnboardingComplete,
    }),
    [
      user, profile, session, role, collectiveRoles, capabilities, hasCapability,
      isLoading, authError, isSuspended, suspendedReason, suspendedUntil, needsTosAcceptance,
      isLeader, isAssistLeader, isCoLeader, isStaff, isManager, isAdmin, isSuperAdmin, managedCollectiveIds,
      signUp, signIn, signInWithGoogle, signInWithApple, signInWithMagicLink,
      signOut, resetPassword, updatePassword, refreshProfile, acceptTos,
      onboardingDone, markOnboardingComplete,
    ],
  )
}

/* ------------------------------------------------------------------ */
/*  Public exports                                                     */
/* ------------------------------------------------------------------ */

export { AuthContext }
export type { AuthContextValue, Profile, UserRole, CollectiveRole }

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
