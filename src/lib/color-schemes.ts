/**
 * Centralised colour maps for admin UI badges and category chips.
 * Import from here instead of redefining per-page.
 */

/* ------------------------------------------------------------------ */
/*  Event activity type → badge colours                                */
/* ------------------------------------------------------------------ */

export const ACTIVITY_COLORS: Record<string, string> = {
  clean_up: 'bg-bark-100 text-bark-700',
  tree_planting: 'bg-sprout-100 text-sprout-700',
  ecosystem_restoration: 'bg-moss-100 text-moss-700',
  nature_hike: 'bg-bark-100 text-bark-700',
  camp_out: 'bg-moss-100 text-moss-700',
  spotlighting: 'bg-primary-100 text-primary-700',
  other: 'bg-neutral-100 text-neutral-700',
}

/* ------------------------------------------------------------------ */
/*  Event status → badge label + className                             */
/* ------------------------------------------------------------------ */

export const STATUS_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-600' },
  published: { label: 'Live', className: 'bg-success-100 text-success-700' },
  cancelled: { label: 'Cancelled', className: 'bg-error-100 text-error-700' },
  completed: { label: 'Completed', className: 'bg-moss-100 text-moss-700' },
}

/* ------------------------------------------------------------------ */
/*  Emergency contact category → icon colours                         */
/* ------------------------------------------------------------------ */

export const CONTACT_CATEGORY_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  emergency: { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200' },
  wildlife: { bg: 'bg-moss-50', text: 'text-moss-600', ring: 'ring-moss-200' },
  marine: { bg: 'bg-primary-50', text: 'text-primary-700', ring: 'ring-primary-200' },
  poison: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-200' },
  ses: { bg: 'bg-primary-50', text: 'text-primary-600', ring: 'ring-primary-200' },
  internal: { bg: 'bg-plum-50', text: 'text-plum-600', ring: 'ring-plum-200' },
}
