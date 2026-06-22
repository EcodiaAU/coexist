import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'

// Revalidate the homepage (and its live impact figures) on a schedule rather
// than per request - the numbers move slowly and this keeps DB load bounded.
export const revalidate = 1800

// P0 smoke fallback so `next build` and a stats outage never 500 the homepage.
const FALLBACK: PublicImpactStats = {
  volunteers: 5500,
  collectives: 15,
  nativePlants: 46400,
  treesPlanted: 36637,
  rubbishKg: 5900,
  events: 340,
}

async function loadStats(): Promise<{ stats: PublicImpactStats; live: boolean }> {
  try {
    return { stats: await getPublicImpactStats(), live: true }
  } catch {
    return { stats: FALLBACK, live: false }
  }
}

const fmt = (n: number) => new Intl.NumberFormat('en-AU').format(n)

export default async function HomePage() {
  const { stats, live } = await loadStats()

  const tiles = [
    { value: stats.rubbishKg, suffix: ' kgs', label: 'Litter removed' },
    { value: stats.nativePlants || stats.treesPlanted, suffix: '', label: 'Native plants planted' },
    { value: stats.collectives, suffix: '', label: 'Collectives across Australia' },
    { value: stats.volunteers, suffix: '', label: 'Young volunteers' },
  ]

  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-primary-600">
        Co-Exist Australia
      </p>
      <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-neutral-900">
        Explore. Connect. Protect.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-600">
        Young people gathering to preserve and protect their local environment.
      </p>

      <section className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm"
          >
            <div className="text-3xl font-extrabold tabular-nums text-neutral-900">
              {fmt(t.value)}
              {t.suffix}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-neutral-500">
              {t.label}
            </div>
          </div>
        ))}
      </section>

      <p className="mt-8 text-xs text-neutral-400">
        {live
          ? 'Live figures from the Co-Exist impact substrate.'
          : 'Showing baseline figures (live substrate not reachable in this environment).'}
      </p>
    </main>
  )
}
