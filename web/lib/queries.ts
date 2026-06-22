import { getPublicSupabase } from './supabase-public'
import { getServerSupabase } from './supabase-server'

/* ------------------------------------------------------------------ */
/*  View-model types (what the public pages actually render)           */
/* ------------------------------------------------------------------ */

export interface EventVM {
  id: string
  title: string
  description: string | null
  activity_type: string | null
  date_start: string
  date_end: string | null
  timezone: string | null
  address: string | null
  cover_image_url: string | null
  capacity: number | null
  is_ticketed: boolean | null
  external_registration_url: string | null
  collective: { name: string; slug: string; region: string | null } | null
}

export interface CollectiveVM {
  id: string
  name: string
  slug: string
  region: string | null
  state: string | null
  description: string | null
  cover_image_url: string | null
  member_count: number | null
}

export interface NewsVM {
  id: string
  title: string
  content: string | null
  image_url: string | null
  is_pinned: boolean | null
  created_at: string
}

export interface LegalPageVM {
  slug: string
  title: string
  summary: string | null
  content: string
  updated_at: string | null
}

/* ------------------------------------------------------------------ */
/*  Events (anon, is_public + published, upcoming first)               */
/* ------------------------------------------------------------------ */

export async function getUpcomingEvents(limit = 60): Promise<EventVM[]> {
  const supabase = getPublicSupabase()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, description, activity_type, date_start, date_end, timezone, address, cover_image_url, capacity, is_ticketed, external_registration_url, collectives(name, slug, region)',
    )
    .eq('is_public', true)
    .eq('status', 'published')
    .gte('date_start', nowIso)
    .order('date_start', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapEvent)
}

export async function getEvent(id: string): Promise<EventVM | null> {
  const supabase = getPublicSupabase()
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, description, activity_type, date_start, date_end, timezone, address, cover_image_url, capacity, is_ticketed, external_registration_url, collectives(name, slug, region)',
    )
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()
  if (error) throw error
  return data ? mapEvent(data) : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(r: any): EventVM {
  const c = Array.isArray(r.collectives) ? r.collectives[0] : r.collectives
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    activity_type: r.activity_type,
    date_start: r.date_start,
    date_end: r.date_end,
    timezone: r.timezone,
    address: r.address,
    cover_image_url: r.cover_image_url,
    capacity: r.capacity,
    is_ticketed: r.is_ticketed,
    external_registration_url: r.external_registration_url,
    collective: c ? { name: c.name, slug: c.slug, region: c.region } : null,
  }
}

/* ------------------------------------------------------------------ */
/*  Collectives (anon, active, non-national)                           */
/* ------------------------------------------------------------------ */

export async function getCollectives(): Promise<CollectiveVM[]> {
  const supabase = getPublicSupabase()
  const { data, error } = await supabase
    .from('collectives')
    .select('id, name, slug, region, state, description, cover_image_url, member_count')
    .eq('is_active', true)
    .eq('is_national', false)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as CollectiveVM[]
}

export async function getCollective(slug: string): Promise<CollectiveVM | null> {
  const supabase = getPublicSupabase()
  const { data, error } = await supabase
    .from('collectives')
    .select('id, name, slug, region, state, description, cover_image_url, member_count')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data as CollectiveVM) ?? null
}

/* ------------------------------------------------------------------ */
/*  News (server/service-role: updates has no anon policy yet; the     */
/*  proper anon SELECT for target_audience='all' is a P6 migration)    */
/* ------------------------------------------------------------------ */

export async function getNews(limit = 30): Promise<NewsVM[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('updates')
    .select('id, title, content, image_url, is_pinned, created_at')
    .eq('target_audience', 'all')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as NewsVM[]
}

/* ------------------------------------------------------------------ */
/*  Legal pages (anon, published; content is first-party HTML)         */
/* ------------------------------------------------------------------ */

export async function getLegalPage(slug: string): Promise<LegalPageVM | null> {
  const supabase = getPublicSupabase()
  const { data, error } = await supabase
    .from('legal_pages')
    .select('slug, title, summary, content, updated_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()
  if (error) throw error
  return (data as LegalPageVM) ?? null
}

export async function getLegalSlugs(): Promise<string[]> {
  const supabase = getPublicSupabase()
  const { data, error } = await supabase
    .from('legal_pages')
    .select('slug')
    .eq('is_published', true)
  if (error) throw error
  return (data ?? []).map((r) => r.slug as string)
}
