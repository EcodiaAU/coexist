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
        supabase
          .from('email_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'bounce'),
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

export function useEmailBounces() {
  return useQuery({
    queryKey: ['admin-email-bounces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_events')
        .select('*')
        .eq('event_type', 'bounce')
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
        .from('email_events')
        .select('*')
        .eq('event_type', 'complaint')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
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
