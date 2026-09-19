/**
 * Build-time guard: refuse to produce a bundle that has no Supabase config.
 *
 * Origin (2026-09-18/19): OTA 2.3.35 was built by `vite build` in a git
 * worktree. `.env.production` and `.env.local` are gitignored, so a worktree
 * never has them. Vite does not fail when an env var is missing: it inlines
 * `import.meta.env.VITE_SUPABASE_URL` as `undefined`, and it leaves an unknown
 * `%VITE_*%` placeholder in index.html as a literal with one warning line in
 * several hundred lines of output. The build exited 0, the upload succeeded,
 * the delivery probe said DELIVERY PROVEN, and every device that took the
 * bundle died at module load with "supabaseUrl is required".
 *
 * Imported by vite.config.ts (build only), so every build path meets it:
 * ship-web-ota.sh, build:ios / build:android, Vercel and CI.
 *
 * Pure functions, no Vite types, so vitest can exercise them directly.
 */

export const REQUIRED_BUILD_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

// An unreplaced index.html placeholder, or one that leaked into a chunk.
const PLACEHOLDER_RE = /%VITE_[A-Z0-9_]+%/g

/** Every reason this env cannot produce a working bundle. Empty means OK. */
export function buildEnvProblems(env: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const key of REQUIRED_BUILD_ENV) {
    const value = env[key]
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`${key} is not set`)
    } else if (value.includes('%')) {
      problems.push(`${key} is a placeholder, not a value`)
    }
  }
  const url = env.VITE_SUPABASE_URL
  if (typeof url === 'string' && url.trim() !== '' && !url.includes('%')) {
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }
    if (!parsed || parsed.protocol !== 'https:') {
      problems.push('VITE_SUPABASE_URL is not an https URL')
    }
  }
  return problems
}

/** Distinct `%VITE_*%` placeholders left in built output. Empty means OK. */
export function findUnreplacedPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])]
}

export function buildEnvFailureMessage(problems: string[], root: string, mode: string): string {
  return [
    `Refusing to build: this bundle would ship with no Supabase config (mode "${mode}").`,
    ...problems.map((p) => `  - ${p}`),
    `Vite read env files from ${root}.`,
    'A git worktree does NOT carry .env.production or .env.local (both gitignored).',
    'Copy them in from the main checkout, or export the VITE_ variables, then rebuild.',
    'A bundle built without them crashes on open with "supabaseUrl is required" (OTA 2.3.35, 2026-09-18).',
  ].join('\n')
}
