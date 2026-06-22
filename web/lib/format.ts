/** Shared display helpers for the marketing site. */

const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean up',
  shore_cleanup: 'Beach cleanup',
  tree_planting: 'Tree planting',
  land_regeneration: 'Land regeneration',
  ecosystem_restoration: 'Ecosystem restoration',
  marine_restoration: 'Marine restoration',
  nature_walk: 'Nature walk',
  nature_hike: 'Nature hike',
  camp_out: 'Camp out',
  spotlighting: 'Spotlighting',
  retreat: 'Retreat',
  film_screening: 'Film screening',
  workshop: 'Workshop',
  other: 'Activity',
}

export function activityLabel(key: string | null | undefined): string {
  if (!key) return 'Activity'
  return ACTIVITY_LABELS[key] ?? 'Activity'
}

/** Format an ISO timestamp in the event's own timezone (defaults to Brisbane). */
export function formatEventDate(iso: string, timezone?: string | null): string {
  const tz = timezone || 'Australia/Brisbane'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString('en-AU')
  }
}

export function formatDateShort(iso: string, timezone?: string | null): string {
  const tz = timezone || 'Australia/Brisbane'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: tz,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleDateString('en-AU')
  }
}

/** State display order, north-to-south-ish, for grouping collectives. */
export const STATE_ORDER = ['QLD', 'NSW', 'ACT', 'VIC', 'TAS', 'SA', 'WA', 'NT']
