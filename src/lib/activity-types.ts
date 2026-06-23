/**
 * Centralised activity-type metadata.
 *
 * Three maps that were previously copy-pasted across event-hero, events/index,
 * and event-detail are merged here as the single source of truth.
 */

/* ------------------------------------------------------------------ */
/*  Badge slug mapping  (activity_type DB enum → Badge component prop) */
/* ------------------------------------------------------------------ */

export type ActivityBadgeSlug =
  | 'clean-up'
  | 'tree-planting'
  | 'ecosystem-restoration'
  | 'nature-hike'
  | 'camp-out'
  | 'spotlighting'
  | 'other'

export const activityToBadge: Record<string, ActivityBadgeSlug> = {
  clean_up: 'clean-up',
  tree_planting: 'tree-planting',
  ecosystem_restoration: 'ecosystem-restoration',
  nature_hike: 'nature-hike',
  camp_out: 'camp-out',
  spotlighting: 'spotlighting',
  other: 'other',
}

/* ------------------------------------------------------------------ */
/*  Card gradient (used on event list cards)                           */
/* ------------------------------------------------------------------ */

// Single Co-Exist brand colour for every event type (2026-06-08): the per-type
// colour aesthetic was removed in favour of one green across all events.
// Flat single-stop on the LIGHT brand green (primary-400 = --color-brand #869e62,
// the same green the app's Share button uses) so registration buttons + accent
// bars render as a SOLID light Co-Exist green. Not the dark forest primary-800.
const COEXIST_GRADIENT = 'bg-primary-400'

export const ACTIVITY_META: Record<string, { gradient: string }> = {
  clean_up: { gradient: COEXIST_GRADIENT },
  tree_planting: { gradient: COEXIST_GRADIENT },
  ecosystem_restoration: { gradient: COEXIST_GRADIENT },
  nature_hike: { gradient: COEXIST_GRADIENT },
  camp_out: { gradient: COEXIST_GRADIENT },
  spotlighting: { gradient: COEXIST_GRADIENT },
  other: { gradient: COEXIST_GRADIENT },
}

/* ------------------------------------------------------------------ */
/*  Detail-page colour accents (gradient, glow, bg, text, border)     */
/* ------------------------------------------------------------------ */

export interface ActivityAccent {
  gradient: string
  glow: string
  bg: string
  text: string
  border: string
}

// Every event type now resolves to the same Co-Exist green accent. The map is
// kept (keyed by type) only for call-site compatibility; all values are equal.
const COEXIST_ACCENT: ActivityAccent = {
  gradient: COEXIST_GRADIENT,
  glow: '',
  bg: 'bg-primary-50',
  text: 'text-primary-700',
  border: 'border-primary-200/50',
}

export const activityAccent: Record<string, ActivityAccent> = {
  clean_up: COEXIST_ACCENT,
  tree_planting: COEXIST_ACCENT,
  ecosystem_restoration: COEXIST_ACCENT,
  nature_hike: COEXIST_ACCENT,
  camp_out: COEXIST_ACCENT,
  spotlighting: COEXIST_ACCENT,
  other: COEXIST_ACCENT,
}

/* ------------------------------------------------------------------ */
/*  Display label                                                      */
/* ------------------------------------------------------------------ */

/** Converts a DB enum value to a human-readable label: "tree_planting" → "Tree Planting" */
export function formatActivityType(type: string | null | undefined): string {
  if (!type) return 'Event'
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const defaultAccent: ActivityAccent = COEXIST_ACCENT
