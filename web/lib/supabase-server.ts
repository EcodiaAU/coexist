import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'
import { publicSupabaseUrl, serviceRoleKey } from './env'

/**
 * Server-only Supabase client for the marketing site.
 *
 * Uses the service-role key so server components / route handlers can compute
 * accurate public figures (e.g. national impact totals) from tables that are
 * RLS-locked to authenticated users (event_impact is FOR SELECT TO authenticated).
 * The 'server-only' import guarantees this module can never be bundled into a
 * client component, so the service-role key never reaches the browser.
 *
 * Read-only usage only: the marketing site never writes via this client.
 */
let cached: SupabaseClient<Database> | null = null

export function getServerSupabase(): SupabaseClient<Database> {
  if (cached) return cached
  cached = createClient<Database>(publicSupabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
