import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { DollarSign, ShoppingBag, TrendingUp } from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { TabBar } from '@/components/tab-bar'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useSalesAnalytics } from '@/hooks/use-admin-merch'
import { formatPrice } from '@/types/merch'

const PERIODS = [
  { value: 'week' as const, label: 'This week' },
  { value: 'month' as const, label: 'This month' },
  { value: 'year' as const, label: 'This year' },
]

const PRODUCT_ICON_STYLES = [
  'bg-primary-50 text-primary-600',
  'bg-moss-50 text-moss-600',
  'bg-sky-50 text-sky-600',
  'bg-sprout-50 text-sprout-600',
  'bg-plum-50 text-plum-600',
  'bg-bark-50 text-bark-600',
]

export default function AnalyticsTab() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month')
  const { data: analytics, isLoading } = useSalesAnalytics(period)
  const showLoading = useDelayedLoading(isLoading)
  const shouldReduceMotion = useReducedMotion()

  // Only show skeleton on first ever load, not on period tab switches
  if (showLoading && !analytics) {
    return (
      <div className="space-y-3">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    )
  }
  if (isLoading && !analytics) return null

  if (!analytics) {
    return (
      <EmptyState
        illustration="empty"
        title="No data yet"
        description="Sales data will appear once orders start coming in"
      />
    )
  }

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="visible">
      {/* Period selector */}
      <motion.div variants={fadeUp}>
        <TabBar
          tabs={PERIODS.map((p) => ({ id: p.value, label: p.label }))}
          activeTab={period}
          onChange={(id) => setPeriod(id as 'week' | 'month' | 'year')}
          aria-label="Analytics period"
        />
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          value={formatPrice(analytics.total_revenue_cents)}
          label="Revenue"
          icon={<DollarSign size={20} />}
        />
        <StatCard
          value={analytics.total_orders}
          label="Orders"
          icon={<ShoppingBag size={20} />}
        />
        <StatCard
          value={analytics.total_units_sold}
          label="Units sold"
          icon={<TrendingUp size={20} />}
        />
      </motion.div>

      {/* By product - rich colored cards */}
      <AnimatePresence initial={false}>
      {analytics.by_product.length > 0 && (
        <motion.div
          key="by-product"
          variants={fadeUp}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        ><section>
          <h3 className="font-heading font-semibold text-neutral-900 mb-3">By product</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {analytics.by_product.map((row, idx) => (
              <div
                key={row.product_id}
                className="rounded-md p-5 bg-white border border-neutral-100 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-sm flex items-center justify-center ${PRODUCT_ICON_STYLES[idx % PRODUCT_ICON_STYLES.length]}`}>
                    <ShoppingBag size={14} />
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{row.product_name}</p>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{row.units} units sold</p>
                <p className="font-heading font-bold text-lg text-neutral-900 mt-2 tabular-nums">
                  {formatPrice(row.revenue_cents)}
                </p>
              </div>
            ))}
          </div>
        </section></motion.div>
      )}
      </AnimatePresence>

      {/* By period - alternating warm tones */}
      <AnimatePresence initial={false}>
      {analytics.by_period.length > 0 && (
        <motion.div
          key="by-period"
          variants={fadeUp}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        ><section>
          <h3 className="font-heading font-semibold text-neutral-900 mb-3">Timeline</h3>
          <div className="space-y-1.5">
            {analytics.by_period.map((row) => (
              <div
                key={row.date}
                className="flex items-center justify-between px-4 py-3 rounded-sm text-sm bg-white border border-neutral-100 shadow-sm"
              >
                <span className="text-neutral-500 font-medium">{row.date}</span>
                <div className="flex gap-3">
                  <span className="text-neutral-400">{row.orders} orders</span>
                  <span className="font-semibold text-neutral-900 tabular-nums">{formatPrice(row.revenue_cents)}</span>
                </div>
              </div>
            ))}
          </div>
        </section></motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  )
}
