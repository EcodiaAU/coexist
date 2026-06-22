import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'
import { getUpcomingEvents, getCollectives, getLegalSlugs } from '@/lib/queries'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, '')
  const now = new Date()

  const staticPaths = [
    '',
    '/about',
    '/get-involved',
    '/get-involved/team',
    '/get-involved/support',
    '/events',
    '/collectives',
    '/news',
    '/contact',
    '/donate',
  ].map((p) => ({ url: `${base}${p}`, lastModified: now }))

  const [events, collectives, legalSlugs] = await Promise.all([
    getUpcomingEvents().catch(() => []),
    getCollectives().catch(() => []),
    getLegalSlugs().catch(() => []),
  ])

  return [
    ...staticPaths,
    ...events.map((e) => ({ url: `${base}/events/${e.id}`, lastModified: now })),
    ...collectives.map((c) => ({ url: `${base}/collectives/${c.slug}`, lastModified: now })),
    ...legalSlugs.map((s) => ({ url: `${base}/legal/${s}`, lastModified: now })),
  ]
}
