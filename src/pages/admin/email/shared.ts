import DOMPurify from 'dompurify'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface EmailTag {
  id: string
  name: string
  colour: string
  description: string | null
  created_at: string
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
  body_text: string
  category: string
  created_by: string | null
  updated_at: string
  created_at: string
}

export interface EmailCampaign {
  id: string
  name: string
  subject: string
  body_html: string
  body_text: string
  template_id: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  target_all: boolean
  target_tag_ids: string[]
  target_collective_ids: string[]
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_delivered: number
  total_opened: number
  total_clicked: number
  total_bounced: number
  total_unsubscribed: number
  created_by: string | null
  updated_at: string
  created_at: string
}

/* ================================================================== */
/*  Hooks                                                              */
/* ================================================================== */

export function useEmailMarketingStats() {
  return useQuery({
    queryKey: ['admin-email-marketing-stats'],
    queryFn: async () => {
      const [subscribersRes, campaignsRes, bouncesRes, suppressedRes] = await Promise.all([
        supabase.rpc('email_subscriber_count'),
        supabase
          .from('email_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent'),
        // email_events is the dead SendGrid-era table (0 rows on 2026-09-25) and
        // read 0 here while 45 addresses sat suppressed after a hard bounce.
        // email_suppressions is what resend-webhook actually writes.
        supabase
          .from('email_suppressions')
          .select('id', { count: 'exact', head: true })
          .eq('reason', 'bounce'),
        supabase
          .from('email_suppressions')
          .select('id', { count: 'exact', head: true }),
      ])

      return {
        subscribers: (subscribersRes.data as number) ?? 0,
        campaignsSent: campaignsRes.count ?? 0,
        bounces: bouncesRes.count ?? 0,
        suppressed: suppressedRes.count ?? 0,
      }
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['admin-email-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as EmailCampaign[]
    },
    staleTime: 30 * 1000,
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as EmailTemplate[]
    },
    staleTime: 60 * 1000,
  })
}

export function useSubscribers(search: string, tagFilter: string | null) {
  return useQuery({
    queryKey: ['admin-email-subscribers', search, tagFilter],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          display_name,
          avatar_url,
          location,
          interests,
          membership_level,
          points,
          onboarding_completed,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,location.ilike.%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error

      let profiles = data ?? []

      // Load marketing_opt_in from profiles (added by migration 005, not in generated types)
      // The select('*') would get it but we need to be explicit - use a separate query.
      // Skip the network call entirely when there are no ids. Passing a sentinel
      // string for a uuid column 400s on PostgREST.
      const profileIds = profiles.map((p) => p.id)
      const optInMap = new Map<string, boolean>()
      if (profileIds.length) {
        const { data: optInData } = await supabase
          .from('profiles')
          .select('id, marketing_opt_in')
          .in('id', profileIds)
        for (const row of optInData ?? []) {
          optInMap.set(row.id, row.marketing_opt_in !== false)
        }
      }

      // If tag filter, filter by profile_tags
      if (tagFilter) {
        const { data: taggedIds } = await supabase
          .from('profile_tags')
          .select('profile_id')
          .eq('tag_id', tagFilter)
        const idSet = new Set((taggedIds ?? []).map((t) => t.profile_id))
        profiles = profiles.filter((p) => idSet.has(p.id))
      }

      // Load tags for each profile (same uuid-sentinel guard as above)
      const finalIds = profiles.map((p) => p.id)
      const tagMap = new Map<string, EmailTag[]>()
      if (finalIds.length) {
        const { data: allTags } = await supabase
          .from('profile_tags')
          .select('profile_id, tag_id, email_tags(id, name, colour, description, created_at)')
          .in('profile_id', finalIds)
        for (const pt of allTags ?? []) {
          const existing = tagMap.get(pt.profile_id) ?? []
          if (pt.email_tags) existing.push(pt.email_tags)
          tagMap.set(pt.profile_id, existing)
        }
      }

      return profiles.map((p) => ({
        ...p,
        marketing_opt_in: optInMap.get(p.id) ?? true,
        tags: tagMap.get(p.id) ?? [],
      }))
    },
    staleTime: 30 * 1000,
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['admin-email-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_tags')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as unknown as EmailTag[]
    },
    staleTime: 60 * 1000,
  })
}

export function useCollectives() {
  return useQuery({
    queryKey: ['admin-collectives-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name')
        .order('name')
      if (error) throw error
      return (data ?? []) as unknown as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Bounces and complaints read email_suppressions, the table resend-webhook
 * writes on a hard bounce or a spam complaint. Until 2026-09-25 they read
 * email_events, the dead SendGrid-era table, so this tab said "No bounces" while
 * 45 addresses were suppressed. resend_events holds the raw events but has RLS
 * with no admin policy, and every row shown here is badged Suppressed anyway.
 */
export function useEmailBounces() {
  return useQuery({
    queryKey: ['admin-email-bounces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_suppressions')
        .select('id, email, reason, created_at')
        .eq('reason', 'bounce')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    staleTime: 60 * 1000,
  })
}

export function useEmailComplaints() {
  return useQuery({
    queryKey: ['admin-email-complaints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_suppressions')
        .select('id, email, reason, created_at')
        .eq('reason', 'complaint')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Why a member cannot receive app email. Computed in the database by
 * admin_unreachable_members() (migration 20260925120000), which judges the
 * address the SENDER would use, so this list and the sender cannot disagree.
 */
export type UnreachableReason =
  | 'no_address'
  | 'no_tld'
  | 'malformed'
  | 'bounced'
  | 'complained'
  | 'suppressed'
  | 'typo_domain'

export interface UnreachableMember {
  user_id: string
  display_name: string | null
  auth_email: string | null
  profile_email: string | null
  /** The address the sender would use, or the stored one when none is usable. */
  judged_email: string | null
  reasons: UnreachableReason[]
  suppression_reason: string | null
  suppressed_at: string | null
  /** A likely intended address. A hint for a human to confirm, never applied. */
  suggested_email: string | null
  collectives: string[]
  member_since: string
  last_sign_in_at: string | null
}

export const unreachableReasonLabel: Record<UnreachableReason, string> = {
  no_address: 'No email on the account',
  no_tld: 'Address has no ending (.com)',
  malformed: 'Address is not valid',
  bounced: 'Bounced, mail is blocked',
  complained: 'Marked our email as spam',
  suppressed: 'Mail is blocked',
  typo_domain: 'Likely a typo',
}

/**
 * Members who cannot receive Co-Exist email. Read-only: the RPC never changes an
 * address, and neither does this page. Gated in the database on
 * is_admin_or_staff + has_cap('manage_email'), the same gate as this route.
 */
export function useUnreachableMembers() {
  return useQuery({
    queryKey: ['admin-email-unreachable-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_unreachable_members')
      if (error) throw error
      return (data ?? []) as UnreachableMember[]
    },
    staleTime: 60 * 1000,
  })
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

export function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'img', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'pre', 'code', 'sup', 'sub',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class', 'target', 'width', 'height'],
  })
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-primary-100', text: 'text-primary-600', label: 'Draft' },
  scheduled: { bg: 'bg-info-100', text: 'text-info-700', label: 'Scheduled' },
  sending: { bg: 'bg-warning-100', text: 'text-warning-700', label: 'Sending' },
  sent: { bg: 'bg-success-100', text: 'text-success-700', label: 'Sent' },
  cancelled: { bg: 'bg-error-100', text: 'text-error-700', label: 'Cancelled' },
}

export function extractTemplateVariables(html: string): string[] {
  const matches = html.match(/\{\{([a-z_]+)\}\}/gi) ?? []
  return [...new Set(
    matches
      .map((m) => m.replace(/[{}]/g, ''))
      .filter((v) => v !== 'name' && v !== 'subject'),
  )]
}
