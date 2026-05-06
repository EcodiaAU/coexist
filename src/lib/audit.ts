import { supabase } from '@/lib/supabase'

import type { Json } from '@/types/database.types'

interface AuditEntry {
  action: string
  target_type?: string
  target_id?: string | null
  details?: Record<string, Json | undefined>
}

/**
 * Log an admin action to the audit_log table.
 * Non-throwing - logs errors to console but never blocks the caller.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('audit_log').insert({
      user_id: user.id,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      details: entry.details ?? {},
    })
    if (error) console.error('[audit] Supabase error logging:', entry.action, error)
  } catch (err) {
    console.error('[audit] Failed to log:', entry.action, err)
  }
}
