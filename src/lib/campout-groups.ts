import { TreePine, Users, Flame, Sunrise, type LucideIcon } from 'lucide-react'

// Shared campout-grouping logic used by both the /campouts index page and the
// /campouts/:type detail page. Two FLAGSHIP locations carry curated copy; any
// other published campout is folded into a DERIVED group keyed by its location
// so a newly-published campout appears automatically without a code change.

export interface Highlight {
  icon: LucideIcon
  label: string
}

// The raw event shape both pages fetch. Detail-only fields (event_extras) are
// optional so the index page can pass a lighter row set.
export interface CampoutEvent {
  id: string
  title: string
  address: string | null
  description: string | null
  date_start: string
  date_end: string | null
  cover_image_url: string | null
  event_extras?: Record<string, unknown> | null
}

export interface CampoutGroup {
  slug: string
  name: string
  place: string
  blurb: string
  highlights: Highlight[]
  events: CampoutEvent[]
  cover: string | null
  minPrice: number | null
  count: number
  isFlagship: boolean
}

interface Flagship {
  slug: string
  name: string
  place: string
  blurb: string
  highlights: Highlight[]
  match: (title: string) => boolean
}

// Order matters: this is the on-page tile order for the flagship 2-tile state,
// which is the current production look and must not change. Rainforest first.
const FLAGSHIPS: Flagship[] = [
  {
    slug: 'rainforest',
    name: 'Rainforest Campout',
    place: 'Wild Mountains, Running Creek QLD',
    blurb:
      "Deep in the Wild Mountains rainforest. Camp under the canopy and help restore one of the region's richest ecosystems. A weekend of real work and real people, far from the noise.",
    highlights: [
      { icon: TreePine, label: 'Restore ancient rainforest' },
      { icon: Flame, label: 'Camp under the canopy' },
      { icon: Users, label: 'A weekend with your people' },
      { icon: Sunrise, label: 'Friday arvo to Sunday morning' },
    ],
    match: (t) => /wild mountain/i.test(t),
  },
  {
    slug: 'outback',
    name: 'Outback Campout',
    place: 'Myall Park Botanic Garden, Glenmorgan QLD',
    blurb:
      'Out west at Myall Park Botanic Garden. Wide skies, campfires under the stars, and hands-on restoration in the Queensland outback. Arrive Friday afternoon, wrap up Sunday morning.',
    highlights: [
      { icon: TreePine, label: 'Hands-on habitat restoration' },
      { icon: Flame, label: 'Campfires under big outback skies' },
      { icon: Users, label: 'A weekend with your people' },
      { icon: Sunrise, label: 'Friday arvo to Sunday morning' },
    ],
    match: (t) => /myall park/i.test(t),
  },
]

// Generic set for derived (non-flagship) groups.
const GENERIC_HIGHLIGHTS: Highlight[] = [
  { icon: TreePine, label: 'Hands-on habitat restoration' },
  { icon: Flame, label: 'Camp out under the stars' },
  { icon: Users, label: 'A weekend with your people' },
  { icon: Sunrise, label: 'Friday arvo to Sunday morning' },
]

const GENERIC_BLURB =
  'A conservation campout with Co-Exist Australia. Camp out, restore real habitat, and meet good people. Arrive Friday afternoon, wrap up Sunday morning.'

function isUpcoming(e: CampoutEvent, now: Date): boolean {
  return new Date((e.date_end ?? e.date_start) as string) >= now
}

// Location identity for a derived group: the event address, normalised. Falls
// back to the title when an event has no address.
function locationKey(e: CampoutEvent): string {
  return (e.address ?? e.title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Short human label for the slug: first comma-segment of the address
// (e.g. "Morgan" from "Morgan, South Australia"), else the title.
function shortLabel(e: CampoutEvent): string {
  const src = (e.address ?? e.title ?? 'campout').trim()
  const first = src.split(',')[0].trim()
  return first || src
}

function kebab(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'campout'
  )
}

function coverOf(evs: CampoutEvent[]): string | null {
  return evs.find((e) => e.cover_image_url)?.cover_image_url ?? null
}

function minPriceOf(evs: CampoutEvent[], priceByEvent?: Record<string, number>): number | null {
  if (!priceByEvent) return null
  return evs.reduce<number | null>((m, e) => {
    const p = priceByEvent[e.id]
    return p === undefined ? m : m === null ? p : Math.min(m, p)
  }, null)
}

/**
 * Group all upcoming published campout events into flagship + derived groups.
 * An event is "upcoming" if new Date(date_end ?? date_start) >= now.
 * Pass priceByEvent (cents, min per event) to populate group.minPrice.
 * Only groups with >= 1 upcoming event are returned. Flagships come first in
 * their canonical order; derived groups follow, ordered by their earliest date.
 */
export function groupUpcomingCampouts(
  events: CampoutEvent[],
  priceByEvent?: Record<string, number>,
): CampoutGroup[] {
  const now = new Date()
  const upcoming = events
    .filter((e) => isUpcoming(e, now))
    .slice()
    .sort((a, b) => (a.date_start < b.date_start ? -1 : a.date_start > b.date_start ? 1 : 0))

  const flagshipEvents = new Map<string, CampoutEvent[]>()
  const derived = new Map<string, { label: string; events: CampoutEvent[] }>()

  for (const ev of upcoming) {
    const flag = FLAGSHIPS.find((f) => f.match(ev.title))
    if (flag) {
      const arr = flagshipEvents.get(flag.slug) ?? []
      arr.push(ev)
      flagshipEvents.set(flag.slug, arr)
    } else {
      const key = locationKey(ev)
      const bucket = derived.get(key) ?? { label: shortLabel(ev), events: [] }
      bucket.events.push(ev)
      derived.set(key, bucket)
    }
  }

  const groups: CampoutGroup[] = []

  for (const f of FLAGSHIPS) {
    const evs = flagshipEvents.get(f.slug)
    if (!evs || evs.length === 0) continue
    groups.push({
      slug: f.slug,
      name: f.name,
      place: f.place,
      blurb: f.blurb,
      highlights: f.highlights,
      events: evs,
      cover: coverOf(evs),
      minPrice: minPriceOf(evs, priceByEvent),
      count: evs.length,
      isFlagship: true,
    })
  }

  const usedSlugs = new Set(groups.map((g) => g.slug))
  const derivedGroups = [...derived.values()].sort((a, b) =>
    a.events[0].date_start < b.events[0].date_start ? -1 : a.events[0].date_start > b.events[0].date_start ? 1 : 0,
  )
  for (const d of derivedGroups) {
    const first = d.events[0]
    let slug = kebab(d.label)
    if (usedSlugs.has(slug)) {
      let n = 2
      while (usedSlugs.has(`${slug}-${n}`)) n++
      slug = `${slug}-${n}`
    }
    usedSlugs.add(slug)
    groups.push({
      slug,
      name: first.title,
      place: first.address ?? '',
      blurb: first.description || GENERIC_BLURB,
      highlights: GENERIC_HIGHLIGHTS,
      events: d.events,
      cover: coverOf(d.events),
      minPrice: minPriceOf(d.events, priceByEvent),
      count: d.events.length,
      isFlagship: false,
    })
  }

  return groups
}

/**
 * Resolve a single group for the detail page from all upcoming events + a slug.
 * Returns null when no group matches (falls through to "Campout not found").
 */
export function resolveCampoutGroup(
  events: CampoutEvent[],
  slug: string | undefined,
  priceByEvent?: Record<string, number>,
): CampoutGroup | null {
  if (!slug) return null
  return groupUpcomingCampouts(events, priceByEvent).find((g) => g.slug === slug) ?? null
}

/**
 * Synchronous flagship copy for a slug, for instant hero render on the detail
 * page before events load. Returns null for non-flagship slugs.
 */
export function flagshipConfig(
  slug: string | undefined,
): Pick<CampoutGroup, 'slug' | 'name' | 'place' | 'blurb' | 'highlights'> | null {
  const f = FLAGSHIPS.find((x) => x.slug === slug)
  return f ? { slug: f.slug, name: f.name, place: f.place, blurb: f.blurb, highlights: f.highlights } : null
}

/**
 * The two flagship locations as empty (count 0) placeholder tiles, for the
 * /campouts index empty state when nothing is published yet.
 */
export function flagshipPlaceholders(): CampoutGroup[] {
  return FLAGSHIPS.map((f) => ({
    slug: f.slug,
    name: f.name,
    place: f.place,
    blurb: f.blurb,
    highlights: f.highlights,
    events: [],
    cover: null,
    minPrice: null,
    count: 0,
    isFlagship: true,
  }))
}
