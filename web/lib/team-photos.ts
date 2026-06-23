/**
 * Team headshots grabbed from the live coexistaus.org/about page, keyed by
 * normalised full name. Primary photo source for board, core and leaders
 * Charlie Bennett is listed under Pioneers with his live-site headshot.
 * Anyone absent here falls back to the olive monogram in PersonCard.
 */
const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const MAP: Record<string, string> = {
  'eliot sanger': '/images/team/eliot-sanger.jpg',
  'nerida bradley': '/images/team/nerida-bradley.jpg',
  'james hattam': '/images/team/james-hattam.jpg',
  'kurt jones': '/images/team/kurt-jones.jpg',
  'jessica ditchfield': '/images/team/jessica-ditchfield.png',
  'lauren railey': '/images/team/lauren-railey.jpg',
  'riley doyle': '/images/team/riley-doyle.jpg',
  'brandon marlow': '/images/team/brandon-marlow.jpg',
  'hannah lyttle': '/images/team/hannah-lyttle.jpg',
  'keely de klerk': '/images/team/keely-de-klerk.jpg',
  'sophie nelson': '/images/team/sophie-nelson.jpg',
  'alanah forbes': '/images/team/alanah-forbes.jpg',
  'maya norris': '/images/team/maya-norris.jpg',
  'fei castillo': '/images/team/fei-castillo.jpg',
  'caitlyn di pasquale': '/images/team/caitlyn-di-pasquale.jpg',
  'jorgie rainbird': '/images/team/jorgie-rainbird.png',
  'pia finn': '/images/team/pia-finn.jpg',
  'ben bloom': '/images/team/ben-bloom.jpg',
  'winnie liang': '/images/team/winnie-liang.jpg',
  'lydia sheehan': '/images/team/lydia-sheehan.jpg',
  'nicola tsiolis': '/images/team/nicola-tsiolis.png',
  'charlotte kenning': '/images/team/charlotte-kenning.jpg',
  'benjamin monga': '/images/team/benjamin-monga.jpg',
  'charlie bennett': '/images/team/charlie-bennett.jpg',
  'emily oulton': '/images/team/emily-oulton.jpg',
  'juliane mateo': '/images/team/juliane-mateo.jpg',
  'billy radalj': '/images/team/billy-radalj.png',
  'shizuku yamagishi': '/images/team/shizuku-yamagishi.jpg',
  'ben hobbs-gordon': '/images/team/ben-hobbs-gordon.jpg',
  'gabriel corbidge': '/images/team/gabriel-corbidge.png',
  'yee zhao': '/images/team/yee-zhao.png',
  'andrea da cunha': '/images/team/andrea-da-cunha.jpg',
  'devona sabu': '/images/team/devona-sabu.jpg',
  'emilie corkeron': '/images/team/emilie-corkeron.png',
  'star bright': '/images/team/star-bright.jpg',
  'madisen coelho': '/images/team/madisen-coelho.jpg',
  'ryan eadie': '/images/team/ryan-eadie.jpg',
  'genevieve deaconos': '/images/team/genevieve-deaconos.png',
  'david mackenzie': '/images/team/david-mackenzie.jpg',
  'linda barnes': '/images/team/linda-barnes.jpg',
  'matt pascoe': '/images/team/matt-pascoe.jpg',
}

export function teamPhoto(name: string | null | undefined): string | null {
  return MAP[norm(name)] ?? null
}
