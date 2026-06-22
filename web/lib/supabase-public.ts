import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'
import { publicSupabaseAnonKey, publicSupabaseUrl } from './env'

/**
 * Anon Supabase client for SERVER-SIDE public reads (events, collectives,
 * legal pages). Using the anon key keeps RLS as the guardrail - the site can
 * only ever read rows the public is allowed to see (is_public / is_active /
 * is_published), so a query mistake can't leak private data. The service-role
 * client is reserved for the impact-stats aggregation, which genuinely needs
 * to read the authenticated-only event_impact table.
 */
let cached: SupabaseClient<Database> | null = null

export function getPublicSupabase(): SupabaseClient<Database> {
  if (cached) return cached
  cached = createClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
