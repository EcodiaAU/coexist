import { type ReactNode, useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import type { Database } from '@/types/database.types'
import { GLOBAL_ROLE_RANK as _GLOBAL_RANK } from '@/lib/constants'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/button'

type UserRole = Database['public']['Enums']['user_role']
type CollectiveRole = Database['public']['Enums']['collective_role']

/* ------------------------------------------------------------------ */
/*  Shared loading spinner for all guard components                    */
/* ------------------------------------------------------------------ */

function GuardSpinner() {
  return (
    <div data-eos-id="src/components/route-guard.tsx#0" data-eos-v="2" className="min-h-dvh bg-white flex items-center justify-center">
      <div data-eos-id="src/components/route-guard.tsx#1" className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  RequireAuth - redirect to /login if not authenticated              */
/* ------------------------------------------------------------------ */

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, profile, isLoading, isSuspended, needsTosAcceptance, onboardingDone, authError, refreshProfile, signOut } = useAuth()
  const location = useLocation()
  const [guardTimedOut, setGuardTimedOut] = useState(false)

  useEffect(() => {
    if (profile || onboardingDone || !user || isLoading) {
      setGuardTimedOut(false)
      return
    }
    const timer = setTimeout(() => setGuardTimedOut(true), 10_000)
    return () => clearTimeout(timer)
  }, [profile, onboardingDone, user, isLoading])

  if (isLoading) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#2" />
  }

  if (!user) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#3" to="/login" state={{ from: location }} replace />
  }

  if (isSuspended) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#4" to="/suspended" replace />
  }

  if (needsTosAcceptance && !location.pathname.startsWith('/accept-terms')) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#5" to="/accept-terms" replace />
  }

  if ((authError || guardTimedOut) && !profile && !onboardingDone) {
    return (
      <div data-eos-id="src/components/route-guard.tsx#6" className="min-h-dvh bg-white flex flex-col items-center justify-center px-6">
        <div data-eos-id="src/components/route-guard.tsx#7" className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
          <AlertCircle data-eos-id="src/components/route-guard.tsx#8" className="w-10 h-10 text-error" />
        </div>
        <h1 data-eos-id="src/components/route-guard.tsx#9" className="mt-6 font-heading text-2xl font-bold text-neutral-900">
          Something went wrong
        </h1>
        <p data-eos-id="src/components/route-guard.tsx#10" className="mt-2 text-neutral-500 text-center max-w-xs">
          {authError || 'Profile loading timed out. Please try again.'}
        </p>
        <div data-eos-id="src/components/route-guard.tsx#11" className="mt-8 w-full max-w-xs space-y-3">
          <Button data-eos-id="src/components/route-guard.tsx#12"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              setGuardTimedOut(false)
              refreshProfile()
            }}
          >
            Try again
          </Button>
          <Button data-eos-id="src/components/route-guard.tsx#13"
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => signOut()}
          >
            Back to login
          </Button>
        </div>
      </div>
    )
  }

  if (!profile && !onboardingDone) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#14" />
  }

  const onboardingPaths = ['/onboarding', '/leader-welcome', '/welcome-back']
  const isOnboardingPath = onboardingPaths.some((p) => location.pathname.startsWith(p))
  if (!onboardingDone && (!profile || !profile.onboarding_completed) && !isOnboardingPath) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#15" to="/onboarding" replace />
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  RequireRole - check global role minimum                            */
/* ------------------------------------------------------------------ */

interface RequireRoleProps {
  minRole: UserRole
  children: ReactNode
}

export function RequireRole({ minRole, children }: RequireRoleProps) {
  const { user, role, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#16" />
  }

  // Must be authenticated first
  if (!user) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#17" to="/login" state={{ from: location }} replace />
  }

  if (_GLOBAL_RANK[role] < _GLOBAL_RANK[minRole]) {
    return (
      <EmptyState data-eos-id="src/components/route-guard.tsx#18"
        illustration="error"
        title="Access restricted"
        description="You don't have permission to view this page. Contact an admin if you think this is a mistake."
        action={{ label: 'Go home', to: '/' }}
      />
    )
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  RequireLeaderAccess - collective leader roles OR national staff+    */
/* ------------------------------------------------------------------ */

const _LEADER_ROLES: CollectiveRole[] = ['assist_leader', 'co_leader', 'leader']

interface RequireLeaderAccessProps {
  children: ReactNode
}

/**
 * Grants access if the user holds assist_leader / co_leader / leader
 * in any collective, OR has a global role of national_leader or above,
 * OR is a manager with managed_collectives assigned.
 */
export function RequireLeaderAccess({ children }: RequireLeaderAccessProps) {
  const { user, role, collectiveRoles, managedCollectiveIds, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#19" />
  }

  if (!user) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#20" to="/login" state={{ from: location }} replace />
  }

  // National staff and above always have access
  const isStaffPlus = _GLOBAL_RANK[role] >= _GLOBAL_RANK.national_leader

  // Managers with assigned collectives can access the leader suite
  const isManagerWithCollectives = _GLOBAL_RANK[role] >= _GLOBAL_RANK.manager && managedCollectiveIds.length > 0

  // Check if user holds a qualifying collective role
  const hasLeaderRole = collectiveRoles.some((m) => _LEADER_ROLES.includes(m.role as CollectiveRole))

  if (!isStaffPlus && !isManagerWithCollectives && !hasLeaderRole) {
    return (
      <EmptyState data-eos-id="src/components/route-guard.tsx#21"
        illustration="error"
        title="Leader access required"
        description="You need to be a collective leader, co-leader, or assist-leader to access this area."
        action={{ label: 'Go home', to: '/' }}
      />
    )
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  RequireCollectiveRole - check collective-specific role              */
/* ------------------------------------------------------------------ */

interface RequireCollectiveRoleProps {
  minRole: CollectiveRole
  collectiveId: string
  children: ReactNode
}

/* ------------------------------------------------------------------ */
/*  RequireCapability - check frontend capability                      */
/* ------------------------------------------------------------------ */

interface RequireCapabilityProps {
  cap: string
  children: ReactNode
}

export function RequireCapability({ cap, children }: RequireCapabilityProps) {
  const { user, hasCapability, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#22" />
  }

  if (!user) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#23" to="/login" state={{ from: location }} replace />
  }

  if (!hasCapability(cap)) {
    return (
      <EmptyState data-eos-id="src/components/route-guard.tsx#24"
        illustration="error"
        title="Permission required"
        description="You don't have the required permission to access this section. Contact an admin to request access."
        action={{ label: 'Back to dashboard', to: '/admin' }}
      />
    )
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  RequireCollectiveRole - check collective-specific role              */
/* ------------------------------------------------------------------ */

export function RequireCollectiveRole({
  minRole,
  collectiveId,
  children,
}: RequireCollectiveRoleProps) {
  const { user, role, isLoading: authLoading } = useAuth()
  const { hasMinRole, isLoading } = useCollectiveRole(collectiveId)
  const location = useLocation()

  if (authLoading || isLoading) {
    return <GuardSpinner data-eos-id="src/components/route-guard.tsx#25" />
  }

  // Must be authenticated first
  if (!user) {
    return <Navigate data-eos-id="src/components/route-guard.tsx#26" to="/login" state={{ from: location }} replace />
  }

  // National staff+ always have access to collective-scoped routes
  const isStaffPlus = _GLOBAL_RANK[role] >= _GLOBAL_RANK.national_leader

  if (!isStaffPlus && !hasMinRole(minRole)) {
    return (
      <EmptyState data-eos-id="src/components/route-guard.tsx#27"
        illustration="error"
        title="Insufficient role"
        description="You need a higher collective role to access this page."
        action={{ label: 'Go home', to: '/' }}
      />
    )
  }

  return <>{children}</>
}
