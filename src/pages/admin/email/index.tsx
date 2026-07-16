import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Send,
  Users,
  Tag,
  FileText,
  Mail,
  BarChart3,
  XCircle,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Skeleton } from '@/components/skeleton'
import { TabBar } from '@/components/tab-bar'
import { useEmailMarketingStats } from './shared'
import { QuickSendTab } from './quick-send-tab'
import { CampaignsTab } from './campaigns-tab'
import { TemplatesTab } from './templates-tab'
import { SystemTemplatesTab } from './system-templates-tab'
import { SubscribersTab } from './subscribers-tab'
import { TagsTab } from './tags-tab'
import { DeliveryTab } from './delivery-tab'

const tabs = [
  { id: 'quick-send', label: 'Quick Send', icon: <Sparkles data-eos-id="src/pages/admin/email/index.tsx#0" data-eos-v="2" size={14} /> },
  { id: 'campaigns', label: 'History', icon: <Send data-eos-id="src/pages/admin/email/index.tsx#1" size={14} /> },
  { id: 'templates', label: 'Templates', icon: <FileText data-eos-id="src/pages/admin/email/index.tsx#2" size={14} /> },
  { id: 'system', label: 'System', icon: <Mail data-eos-id="src/pages/admin/email/index.tsx#3" size={14} /> },
  { id: 'subscribers', label: 'Subscribers', icon: <Users data-eos-id="src/pages/admin/email/index.tsx#4" size={14} /> },
  { id: 'tags', label: 'Tags', icon: <Tag data-eos-id="src/pages/admin/email/index.tsx#5" size={14} /> },
  { id: 'delivery', label: 'Delivery', icon: <BarChart3 data-eos-id="src/pages/admin/email/index.tsx#6" size={14} /> },
]

export default function AdminEmailPage() {
  const [activeTab, setActiveTab] = useState('quick-send')
  const { data: stats, isLoading: statsLoading } = useEmailMarketingStats()
  const showStatsLoading = useDelayedLoading(statsLoading)
  const shouldReduceMotion = useReducedMotion()

  const heroStats = useMemo(
    () =>
      showStatsLoading || statsLoading ? (
        <div data-eos-id="src/pages/admin/email/index.tsx#7" className="flex items-center gap-2 sm:gap-3">
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#8" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#9" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#10" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#11" variant="stat-card" />
        </div>
      ) : stats ? (
        <AdminHeroStatRow data-eos-id="src/pages/admin/email/index.tsx#12">
          <AdminHeroStat data-eos-id="src/pages/admin/email/index.tsx#13" value={stats.subscribers} label="Subscribers" icon={<Users data-eos-id="src/pages/admin/email/index.tsx#14" size={18} />} color="primary" delay={0} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat data-eos-id="src/pages/admin/email/index.tsx#15" value={stats.campaignsSent} label="Campaigns Sent" icon={<Send data-eos-id="src/pages/admin/email/index.tsx#16" size={18} />} color="moss" delay={1} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat data-eos-id="src/pages/admin/email/index.tsx#17" value={stats.bounces} label="Bounces" icon={<XCircle data-eos-id="src/pages/admin/email/index.tsx#18" size={18} />} color="warning" delay={2} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat data-eos-id="src/pages/admin/email/index.tsx#19" value={stats.suppressed} label="Suppressed" icon={<AlertTriangle data-eos-id="src/pages/admin/email/index.tsx#20" size={18} />} color="error" delay={3} reducedMotion={!!shouldReduceMotion} />
        </AdminHeroStatRow>
      ) : (
        <div data-eos-id="src/pages/admin/email/index.tsx#21" className="flex items-center gap-2 sm:gap-3">
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#22" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#23" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#24" variant="stat-card" />
          <Skeleton data-eos-id="src/pages/admin/email/index.tsx#25" variant="stat-card" />
        </div>
      ),
    [stats, statsLoading, showStatsLoading, shouldReduceMotion],
  )

  useAdminHeader('Email Marketing', { heroContent: heroStats })

  return (
    <div data-eos-id="src/pages/admin/email/index.tsx#26">
      <motion.div data-eos-id="src/pages/admin/email/index.tsx#27"
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
      >
        <TabBar data-eos-id="src/pages/admin/email/index.tsx#28" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/email/index.tsx#29"
        key={activeTab}
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.25 }}
      >
        {activeTab === 'quick-send' && <QuickSendTab data-eos-id="src/pages/admin/email/index.tsx#30" />}
        {activeTab === 'campaigns' && <CampaignsTab data-eos-id="src/pages/admin/email/index.tsx#31" />}
        {activeTab === 'templates' && <TemplatesTab data-eos-id="src/pages/admin/email/index.tsx#32" />}
        {activeTab === 'system' && <SystemTemplatesTab data-eos-id="src/pages/admin/email/index.tsx#33" />}
        {activeTab === 'subscribers' && <SubscribersTab data-eos-id="src/pages/admin/email/index.tsx#34" />}
        {activeTab === 'tags' && <TagsTab data-eos-id="src/pages/admin/email/index.tsx#35" />}
        {activeTab === 'delivery' && <DeliveryTab data-eos-id="src/pages/admin/email/index.tsx#36" />}
      </motion.div>
    </div>
  )
}
