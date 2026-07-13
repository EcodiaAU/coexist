// "Open in Glovebox" - the link Co-Exist hands to Glovebox, Ecodia's offline
// roadtripping / navigation app.
//
// CANONICAL CONTRACT: the UNIVERSAL LINK form.
//
//   https://glovebox.ecodia.au/live?toLat=<double>&toLng=<double>&toName=<encoded>
//   (plus &fromLat=&fromLng= when the sender already knows where the user is)
//
// The universal link is deliberate. On a phone with Glovebox installed the OS
// hands the URL straight to the app; on a phone without it the same URL opens
// the Glovebox web app, so the link always lands somewhere useful and there is
// nothing to probe or fall back to. The custom scheme au.ecodia.roam://navigate
// still works, but it dead-ends on an error when the app is absent, so a sender
// never emits it.
//
// A "light trip" is a SINGLE DESTINATION: lat, lng, name. Not an itinerary, not
// a route, not a backend id. Do not add params.
//
// TODO(shared): swap this for the shared @ecodia/* Glovebox link builder once it
// is published. It is inline here only because the package did not exist yet.

const GLOVEBOX_LIVE_URL = 'https://glovebox.ecodia.au/live'

export interface GloveboxDestination {
  toLat: number
  toLng: number
  toName: string
  fromLat?: number
  fromLng?: number
}

/**
 * Build the canonical Glovebox universal link for a single destination.
 * Returns null when the coordinates are not real numbers, so a caller can hide
 * the affordance rather than emit a malformed URL.
 */
export function gloveboxLink(dest: GloveboxDestination): string | null {
  const { toLat, toLng, toName, fromLat, fromLng } = dest
  if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) return null

  let url =
    `${GLOVEBOX_LIVE_URL}?toLat=${toLat}&toLng=${toLng}` +
    `&toName=${encodeURIComponent(toName)}`

  if (Number.isFinite(fromLat as number) && Number.isFinite(fromLng as number)) {
    url += `&fromLat=${fromLat}&fromLng=${fromLng}`
  }

  return url
}
