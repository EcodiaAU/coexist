import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'
import { publicSupabaseAnonKey, publicSupabaseUrl } from './env'

/**
 * Browser Supabase client for the marketing site (anon key). Used by client
 * components for interactive reads/writes that go through RLS as anon:
 * newsletter signup, contact form, etc. No auth session is persisted - the
 * marketing site does not log users in; auth lives in the app at APP_URL.
 */
let cached: SupabaseClient<Database> | null = null

export function getBrowserSupabase(): SupabaseClient<Database> {
  if (cached) return cached
  cached = createClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
