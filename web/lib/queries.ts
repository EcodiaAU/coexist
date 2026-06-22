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

/* ------------------------------------------------------------------ */
/*  CMS: site_content (singletons) + team_members + partners           */
/*  New P6 tables, not yet in generated database.types - cast the       */
/*  client for these reads (type regen is a follow-up cleanup).         */
/* ------------------------------------------------------------------ */

export interface TeamMemberVM {
  id: string
  name: string
  role_title: string | null
  bio: string | null
  photo_url: string | null
  team_group: string
}

export interface PartnerVM {
  id: string
  name: string
  logo_url: string | null
  url: string | null
}

/** Returns a flat key->text map of editable copy, with safe fallback to {}. */
export async function getSiteContent(): Promise<Record<string, string>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getPublicSupabase() as any
    const { data, error } = await supabase.from('site_content').select('key, value')
    if (error) return {}
    const out: Record<string, string> = {}
    for (const row of data ?? []) {
      const v = row.value
      out[row.key] = typeof v === 'string' ? v : (v?.text ?? '')
    }
    return out
  } catch {
    return {}
  }
}

export async function getTeamMembers(): Promise<TeamMemberVM[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getPublicSupabase() as any
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, role_title, bio, photo_url, team_group, sort_order, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
    if (error) return []
    return (data ?? []) as TeamMemberVM[]
  } catch {
    return []
  }
}

export async function getPartners(): Promise<PartnerVM[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getPublicSupabase() as any
    const { data, error } = await supabase
      .from('partners')
      .select('id, name, logo_url, url, sort_order, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
    if (error) return []
    return (data ?? []) as PartnerVM[]
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/*  Shop (merch_products has no anon SELECT policy -> read server-side  */
/*  with the service-role client; the catalog is public anyway).       */
/* ------------------------------------------------------------------ */

export interface ProductVariant {
  id: string
  label?: string
  price_cents?: number
  is_active?: boolean
}
export interface ProductVM {
  id: string
  name: string
  slug: string
  description: string | null
  price: number | null
  base_price_cents: number | null
  images: string[]
  variants: ProductVariant[]
  category: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(r: any): ProductVM {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    price: r.price != null ? Number(r.price) : null,
    base_price_cents: r.base_price_cents,
    images: Array.isArray(r.images) ? r.images : [],
    variants: Array.isArray(r.variants) ? r.variants : [],
    category: r.category,
  }
}

export async function getProducts(): Promise<ProductVM[]> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('merch_products')
      .select('id, name, slug, description, price, base_price_cents, images, variants, category, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (error) return []
    return (data ?? []).map(mapProduct)
  } catch {
    return []
  }
}

export async function getProduct(slug: string): Promise<ProductVM | null> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('merch_products')
      .select('id, name, slug, description, price, base_price_cents, images, variants, category, is_active')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) return null
    return mapProduct(data)
  } catch {
    return null
  }
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
