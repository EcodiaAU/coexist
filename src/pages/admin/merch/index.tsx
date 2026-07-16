import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { useAdminHeader } from '@/components/admin-layout'
import { TabBar } from '@/components/tab-bar'
import { Package, ShoppingCart, BarChart3, Settings, Warehouse, Store } from 'lucide-react'

import { WaveTransition } from '@/components/wave-transition'
import ProductsTab from './products-tab'
import OrdersTab from './orders-tab'
import InventoryTab from './inventory-tab'
import AnalyticsTab from './analytics-tab'
import PromosTab from './promos-tab'
import ShippingTab from './shipping-tab'

/* Combined tab components */
function SectionHeader({ label }: { label: string }) {
  return (
    <div data-eos-id="src/pages/admin/merch/index.tsx#0" data-eos-v="2" className="flex items-center gap-2 mb-3">
      <div data-eos-id="src/pages/admin/merch/index.tsx#1" className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-200/40 to-transparent" />
      <span data-eos-id="src/pages/admin/merch/index.tsx#2" className="text-[11px] font-bold text-neutral-500 uppercase tracking-[0.12em]">{label}</span>
      <div data-eos-id="src/pages/admin/merch/index.tsx#3" className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-200/40 to-transparent" />
    </div>
  )
}

function OperationsTab() {
  return (
    <div data-eos-id="src/pages/admin/merch/index.tsx#4" className="space-y-8">
      <section data-eos-id="src/pages/admin/merch/index.tsx#5">
        <SectionHeader data-eos-id="src/pages/admin/merch/index.tsx#6" label="Promotions" />
        <PromosTab data-eos-id="src/pages/admin/merch/index.tsx#7" />
      </section>
      <section data-eos-id="src/pages/admin/merch/index.tsx#8">
        <SectionHeader data-eos-id="src/pages/admin/merch/index.tsx#9" label="Shipping" />
        <ShippingTab data-eos-id="src/pages/admin/merch/index.tsx#10" />
      </section>
    </div>
  )
}

const TABS = [
  { id: 'products', label: 'Products', icon: <Package data-eos-id="src/pages/admin/merch/index.tsx#11" size={14} /> },
  { id: 'orders', label: 'Orders', icon: <ShoppingCart data-eos-id="src/pages/admin/merch/index.tsx#12" size={14} /> },
  { id: 'inventory', label: 'Inventory', icon: <Warehouse data-eos-id="src/pages/admin/merch/index.tsx#13" size={14} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 data-eos-id="src/pages/admin/merch/index.tsx#14" size={14} /> },
  { id: 'operations', label: 'Operations', icon: <Settings data-eos-id="src/pages/admin/merch/index.tsx#15" size={14} /> },
]

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  products: ProductsTab,
  orders: OrdersTab,
  inventory: InventoryTab,
  analytics: AnalyticsTab,
  operations: OperationsTab,
}

export default function AdminMerchPage() {
  useAdminHeader('Shop', { fullBleed: true })
  const [activeTab, setActiveTab] = useState('products')
  const shouldReduceMotion = useReducedMotion()
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/merch/index.tsx#16" variants={stagger} initial="hidden" animate="visible" className="min-h-full">
      {/* Hero - brand sage gradient, no decorative circles
          (2026-05-16 Tate: standardise heroes to plain sage gradients). */}
      <div data-eos-id="src/pages/admin/merch/index.tsx#17" className="relative overflow-hidden bg-primary-800">

        <div data-eos-id="src/pages/admin/merch/index.tsx#18"
          className="relative z-10 px-4 sm:px-6 lg:px-8 pt-10 pb-14 text-center"
          style={{ paddingTop: '2.5rem' }}
        >
          <motion.div data-eos-id="src/pages/admin/merch/index.tsx#19"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-white/15 mb-4"
          >
            <Store data-eos-id="src/pages/admin/merch/index.tsx#20" size={28} className="text-white" />
          </motion.div>

          <motion.div data-eos-id="src/pages/admin/merch/index.tsx#21"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span data-eos-id="src/pages/admin/merch/index.tsx#22" className="font-heading text-2xl sm:text-3xl font-bold text-white block">
              Merch &amp; Store
            </span>
          </motion.div>
        </div>

        {/* Wave */}
        <WaveTransition data-eos-id="src/pages/admin/merch/index.tsx#23" fill="fill-neutral-50" />
      </div>

      <motion.div data-eos-id="src/pages/admin/merch/index.tsx#24" variants={fadeUp} className="px-3 sm:px-4 pt-3 sticky top-0 z-20 bg-gradient-to-b from-neutral-50 via-neutral-50 to-neutral-50/0 pb-1">
        <TabBar data-eos-id="src/pages/admin/merch/index.tsx#25"
          tabs={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          aria-label="Merch admin tabs"
        />
      </motion.div>
      <motion.div data-eos-id="src/pages/admin/merch/index.tsx#26"
        key={activeTab}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-3 sm:px-4 pt-2 pb-4 sm:pb-6"
      >
        <ActiveComponent data-eos-id="src/pages/admin/merch/index.tsx#27" />
      </motion.div>
    </motion.div>
  )
}
