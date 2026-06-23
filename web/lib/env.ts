/** Centralised, validated environment access for the marketing site. */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in web/.env.local (see web/.env.local.example).`,
    )
  }
  return value
}

/** Public, browser-safe Supabase config. */
export const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** Server-only service-role key. NEVER imported into a client component. */
export function serviceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function publicSupabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', PUBLIC_SUPABASE_URL)
}

export function publicSupabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', PUBLIC_SUPABASE_ANON_KEY)
}

/** Canonical app URL - where commerce + auth flows live (single source of truth). */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.coexistaus.org'

/** This marketing site's own canonical origin (for metadata / sitemap / OG). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://coexistaus.org'

/** Co-Exist app store listings (verified from the app repo). */
export const APP_STORE_URL = 'https://apps.apple.com/au/app/co-exist/id6760897574'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.coexistaus.app'
