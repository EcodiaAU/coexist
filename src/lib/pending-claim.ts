/**
 * A campout claim link (/claim/:eventId/:token) opened by a signed-out invitee
 * has to survive the whole login -> sign-up -> onboarding -> TOS detour, which
 * drops React Router's `from` state. We stash the target path here and resume
 * it once the user is authed and onboarded.
 */
const KEY = 'coexist_pending_claim'

export function setPendingClaim(path: string): void {
  try { localStorage.setItem(KEY, path) } catch { /* storage may be unavailable */ }
}

/** Returns the stashed claim path (if any) and clears it. */
export function takePendingClaim(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v) localStorage.removeItem(KEY)
    return v && v.startsWith('/claim/') ? v : null
  } catch { return null }
}

export function clearPendingClaim(): void {
  try { localStorage.removeItem(KEY) } catch { /* storage may be unavailable */ }
}
