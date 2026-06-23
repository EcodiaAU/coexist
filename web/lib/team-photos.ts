/**
 * Named team headshots provided by the client (board + core + leaders), used to
 * force a photo where the app profile has no avatar. Keyed by normalised full
 * name. (coexist-20 + any unmatched name fall back to the brand initial.)
 */
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const MAP: Record<string, string> = {
  'eliot sanger': '/images/team/eliot-sanger.webp',
  'james hattam': '/images/team/james-hattam.webp',
  'nerida bradley': '/images/team/nerida-bradley.webp',
  'kurt jones': '/images/team/kurt-jones.webp',
  'lauren railey': '/images/team/lauren-railey.webp',
  'riley doyle': '/images/team/riley-doyle.webp',
  'maya norris': '/images/team/maya-norris.webp',
  'sophie nelson': '/images/team/sophie-nelson.webp',
  'keely de klerk': '/images/team/keely-de-klerk.webp',
  'hannah lyttle': '/images/team/hannah-lyttle.webp',
  'brandon marlow': '/images/team/brandon-marlow.webp',
}

export function teamPhoto(name: string | null | undefined): string | null {
  return MAP[norm(name)] ?? null
}
