/**
 * Pretty-print a user-profile interest for display.
 *
 * Legacy profiles (from early development) stored slugs from the
 * activity_type DB enum like "nature_walk", "tree_planting". The current
 * INTEREST_OPTIONS list (src/pages/profile/edit-profile.tsx) uses pretty
 * strings like "Nature Walks", "Tree Planting" directly. This helper
 * bridges the two so chips show "Nature Walks" even when the underlying
 * value is "nature_walk". Tate verbatim 2026-05-28: "my account still
 * somehow has nature_walk as an interest from back in the first days of
 * development, instead of the pretty versions".
 *
 * Unknown values are converted via snake_case -> Title Case fallback so
 * we never render a raw slug to a user.
 */
const LEGACY_INTEREST_LABELS: Record<string, string> = {
  shore_cleanup: 'Beach Cleanup',
  clean_up: 'Beach Cleanup',
  tree_planting: 'Tree Planting',
  land_regeneration: 'Habitat Restoration',
  ecosystem_restoration: 'Habitat Restoration',
  marine_restoration: 'Habitat Restoration',
  nature_walk: 'Nature Walks',
  nature_hike: 'Nature Walks',
  camp_out: 'Nature Walks',
  retreat: 'Nature Walks',
  spotlighting: 'Wildlife Surveys',
  workshop: 'Education',
  film_screening: 'Education',
  other: 'Other',
}

export function prettyInterestLabel(value: string): string {
  if (LEGACY_INTEREST_LABELS[value]) return LEGACY_INTEREST_LABELS[value]
  // Already a pretty label (Title Case with spaces) - return as-is
  if (/[A-Z]/.test(value) && !/_/.test(value)) return value
  // Unknown snake_case slug - title-case it as a fallback
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
