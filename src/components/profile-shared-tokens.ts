import { type Variants } from 'framer-motion'

/* ------------------------------------------------------------------ */
/*  Shared profile tokens (non-component)                             */
/*                                                                    */
/*  Motion variants and the detail-row tint map live here rather than */
/*  in profile-shared.tsx so that file exports only components and     */
/*  keeps React Fast Refresh working (react-refresh/only-export-       */
/*  components). Both profile surfaces consume these so the visual     */
/*  language never drifts.                                            */
/* ------------------------------------------------------------------ */

export const profileStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

export const profileFadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

// Soft pastel icon badges only - no solid fills, no coloured left stripes.
// The value is the hero; the tint is a whisper for scannability (design
// system: activity colours live only on small icon badges).
export const detailTints = {
  primary: 'bg-primary-50 text-primary-600',
  sky: 'bg-sky-50 text-sky-600',
  moss: 'bg-moss-50 text-moss-600',
  sprout: 'bg-sprout-50 text-sprout-600',
  plum: 'bg-plum-50 text-plum-600',
}
