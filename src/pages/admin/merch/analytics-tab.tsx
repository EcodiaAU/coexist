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
      <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#0" data-eos-v="2" className="space-y-3">
        <Skeleton data-eos-id="src/pages/admin/merch/analytics-tab.tsx#1" variant="card" />
        <Skeleton data-eos-id="src/pages/admin/merch/analytics-tab.tsx#2" variant="card" />
        <Skeleton data-eos-id="src/pages/admin/merch/analytics-tab.tsx#3" variant="card" />
      </div>
    )
  }
  if (isLoading && !analytics) return null

  if (!analytics) {
    return (
      <EmptyState data-eos-id="src/pages/admin/merch/analytics-tab.tsx#4"
        illustration="empty"
        title="No data yet"
        description="Sales data will appear once orders start coming in"
      />
    )
  }

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#5" className="space-y-5" variants={stagger} initial="hidden" animate="visible">
      {/* Period selector */}
      <motion.div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#6" variants={fadeUp}>
        <TabBar data-eos-id="src/pages/admin/merch/analytics-tab.tsx#7"
          tabs={PERIODS.map((p) => ({ id: p.value, label: p.label }))}
          activeTab={period}
          onChange={(id) => setPeriod(id as 'week' | 'month' | 'year')}
          aria-label="Analytics period"
        />
      </motion.div>

      {/* Stat cards */}
      <motion.div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#8" variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard data-eos-id="src/pages/admin/merch/analytics-tab.tsx#9"
          value={formatPrice(analytics.total_revenue_cents)}
          label="Revenue"
          icon={<DollarSign data-eos-id="src/pages/admin/merch/analytics-tab.tsx#10" size={20} />}
        />
        <StatCard data-eos-id="src/pages/admin/merch/analytics-tab.tsx#11"
          value={analytics.total_orders}
          label="Orders"
          icon={<ShoppingBag data-eos-id="src/pages/admin/merch/analytics-tab.tsx#12" size={20} />}
        />
        <StatCard data-eos-id="src/pages/admin/merch/analytics-tab.tsx#13"
          value={analytics.total_units_sold}
          label="Units sold"
          icon={<TrendingUp data-eos-id="src/pages/admin/merch/analytics-tab.tsx#14" size={20} />}
        />
      </motion.div>

      {/* By product - rich colored cards */}
      <AnimatePresence data-eos-id="src/pages/admin/merch/analytics-tab.tsx#15" initial={false}>
      {analytics.by_product.length > 0 && (
        <motion.div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#16"
          key="by-product"
          variants={fadeUp}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        ><section data-eos-id="src/pages/admin/merch/analytics-tab.tsx#17">
          <h3 data-eos-id="src/pages/admin/merch/analytics-tab.tsx#18" className="font-heading font-semibold text-neutral-900 mb-3">By product</h3>
          <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#19" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {analytics.by_product.map((row, idx) => (
              <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#20"
                key={row.product_id}
                className="rounded-md p-5 bg-white border border-neutral-100 shadow-sm"
              >
                <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#21" className="flex items-center gap-2 mb-2">
                  <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#22" className={`w-7 h-7 rounded-sm flex items-center justify-center ${PRODUCT_ICON_STYLES[idx % PRODUCT_ICON_STYLES.length]}`}>
                    <ShoppingBag data-eos-id="src/pages/admin/merch/analytics-tab.tsx#23" size={14} />
                  </div>
                  <p data-eos-id="src/pages/admin/merch/analytics-tab.tsx#24" data-eos-var="row.product_name" data-eos-var-label="Product name" data-eos-var-scope="item" className="text-sm font-bold text-neutral-900">{row.product_name}</p>
                </div>
                <p data-eos-id="src/pages/admin/merch/analytics-tab.tsx#25" data-eos-var="row.units" data-eos-var-label="Units" data-eos-var-scope="item" className="text-xs text-neutral-500 mt-0.5">{row.units} units sold</p>
                <p data-eos-id="src/pages/admin/merch/analytics-tab.tsx#26" data-eos-var="row.revenue_cents" data-eos-var-label="Revenue cents" data-eos-var-scope="item" className="font-heading font-bold text-lg text-neutral-900 mt-2 tabular-nums">
                  {formatPrice(row.revenue_cents)}
                </p>
              </div>
            ))}
          </div>
        </section></motion.div>
      )}
      </AnimatePresence>

      {/* By period - alternating warm tones */}
      <AnimatePresence data-eos-id="src/pages/admin/merch/analytics-tab.tsx#27" initial={false}>
      {analytics.by_period.length > 0 && (
        <motion.div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#28"
          key="by-period"
          variants={fadeUp}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        ><section data-eos-id="src/pages/admin/merch/analytics-tab.tsx#29">
          <h3 data-eos-id="src/pages/admin/merch/analytics-tab.tsx#30" className="font-heading font-semibold text-neutral-900 mb-3">Timeline</h3>
          <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#31" className="space-y-1.5">
            {analytics.by_period.map((row) => (
              <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#32"
                key={row.date}
                className="flex items-center justify-between px-4 py-3 rounded-sm text-sm bg-white border border-neutral-100 shadow-sm"
              >
                <span data-eos-id="src/pages/admin/merch/analytics-tab.tsx#33" data-eos-var="row.date" data-eos-var-label="Date" data-eos-var-scope="item" className="text-neutral-500 font-medium">{row.date}</span>
                <div data-eos-id="src/pages/admin/merch/analytics-tab.tsx#34" className="flex gap-3">
                  <span data-eos-id="src/pages/admin/merch/analytics-tab.tsx#35" data-eos-var="row.orders" data-eos-var-label="Orders" data-eos-var-scope="item" className="text-neutral-400">{row.orders} orders</span>
                  <span data-eos-id="src/pages/admin/merch/analytics-tab.tsx#36" data-eos-var="row.revenue_cents" data-eos-var-label="Revenue cents" data-eos-var-scope="item" className="font-semibold text-neutral-900 tabular-nums">{formatPrice(row.revenue_cents)}</span>
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
