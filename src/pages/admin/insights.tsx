/**
 * Admin > Insights - the merged surface for Impact + Attendance + Reports.
 *
 * Tate 2026-06-10: the three previous pages (/admin/impact, /admin/metrics,
 * /admin/reports) overlapped without any of them holding the full story.
 * Insights hosts each as a tab so the data flow has one canonical URL and
 * the existing logic of each page stays intact. Polish + dedupe of
 * cross-tab cards is a follow-up pass.
 *
 * The deep-link tab is read from the URL hash (#impact, #attendance,
 * #reports) so the old /admin/metrics and /admin/reports redirects land
 * users on the right tab.
 */
import { useMemo, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Leaf, BarChart3, FileText } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { cn } from '@/lib/cn'

const AdminImpactPage = lazy(() => import('@/pages/admin/impact'))
const AdminMetricsPage = lazy(() => import('@/pages/admin/metrics'))
const AdminReportsPage = lazy(() => import('@/pages/admin/reports'))

type TabKey = 'impact' | 'attendance' | 'reports'

const TABS: { key: TabKey; label: string; icon: typeof Leaf; hash: string }[] = [
  { key: 'impact', label: 'Impact', icon: Leaf, hash: '#impact' },
  { key: 'attendance', label: 'Attendance', icon: BarChart3, hash: '#attendance' },
  { key: 'reports', label: 'Reports', icon: FileText, hash: '#reports' },
]

function hashToTab(hash: string): TabKey {
  const clean = hash.replace(/^#/, '').toLowerCase()
  if (clean === 'attendance' || clean === 'metrics') return 'attendance'
  if (clean === 'reports' || clean === 'exports') return 'reports'
  return 'impact'
}

export default function AdminInsightsPage() {
  useAdminHeader('Insights')

  const location = useLocation()
  const navigate = useNavigate()
  // Derive tab from URL hash so back/forward navigation and the
  // /admin/metrics and /admin/reports redirects land on the right tab
  // without an extra effect-sync round-trip.
  const tab = hashToTab(location.hash)

  function handleSelect(next: TabKey) {
    const hash = TABS.find((t) => t.key === next)?.hash ?? '#impact'
    navigate(`${location.pathname}${location.search}${hash}`, { replace: true })
  }

  const TabPanel = useMemo(() => {
    switch (tab) {
      case 'attendance':
        return <AdminMetricsPage embedded />
      case 'reports':
        return <AdminReportsPage embedded />
      case 'impact':
      default:
        return <AdminImpactPage embedded />
    }
  }, [tab])

  return (
    <div className="pb-12">
      <div className="flex gap-1 border-b border-neutral-200 mb-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleSelect(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer',
                active
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700',
              )}
              aria-pressed={active}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>
      <Suspense
        fallback={
          <div className="py-12 space-y-3">
            <div className="h-8 rounded-xl bg-neutral-50 animate-pulse" />
            <div className="h-32 rounded-2xl bg-neutral-50 animate-pulse" />
            <div className="h-64 rounded-2xl bg-neutral-50 animate-pulse" />
          </div>
        }
      >
        {TabPanel}
      </Suspense>
    </div>
  )
}
