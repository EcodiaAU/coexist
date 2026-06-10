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
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Skeleton } from '@/components/skeleton'
import { TabBar } from '@/components/tab-bar'
import { useEmailMarketingStats } from './shared'
import { CampaignsTab } from './campaigns-tab'
import { TemplatesTab } from './templates-tab'
import { SystemTemplatesTab } from './system-templates-tab'
import { SubscribersTab } from './subscribers-tab'
import { TagsTab } from './tags-tab'
import { DeliveryTab } from './delivery-tab'

const tabs = [
  { id: 'campaigns', label: 'Campaigns', icon: <Send size={14} /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={14} /> },
  { id: 'system', label: 'System', icon: <Mail size={14} /> },
  { id: 'subscribers', label: 'Subscribers', icon: <Users size={14} /> },
  { id: 'tags', label: 'Tags', icon: <Tag size={14} /> },
  { id: 'delivery', label: 'Delivery', icon: <BarChart3 size={14} /> },
]

export default function AdminEmailPage() {
  const [activeTab, setActiveTab] = useState('campaigns')
  const { data: stats, isLoading: statsLoading } = useEmailMarketingStats()
  const showStatsLoading = useDelayedLoading(statsLoading)
  const shouldReduceMotion = useReducedMotion()

  const heroStats = useMemo(
    () =>
      showStatsLoading || statsLoading ? (
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
        </div>
      ) : stats ? (
        <AdminHeroStatRow>
          <AdminHeroStat value={stats.subscribers} label="Subscribers" icon={<Users size={18} />} color="primary" delay={0} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat value={stats.campaignsSent} label="Campaigns Sent" icon={<Send size={18} />} color="moss" delay={1} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat value={stats.bounces} label="Bounces" icon={<XCircle size={18} />} color="warning" delay={2} reducedMotion={!!shouldReduceMotion} />
          <AdminHeroStat value={stats.suppressed} label="Suppressed" icon={<AlertTriangle size={18} />} color="error" delay={3} reducedMotion={!!shouldReduceMotion} />
        </AdminHeroStatRow>
      ) : (
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
          <Skeleton variant="stat-card" />
        </div>
      ),
    [stats, statsLoading, showStatsLoading, shouldReduceMotion],
  )

  useAdminHeader('Email Marketing', { heroContent: heroStats })

  return (
    <div>
      <motion.div
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
      >
        <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />
      </motion.div>

      <motion.div
        key={activeTab}
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.25 }}
      >
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'system' && <SystemTemplatesTab />}
        {activeTab === 'subscribers' && <SubscribersTab />}
        {activeTab === 'tags' && <TagsTab />}
        {activeTab === 'delivery' && <DeliveryTab />}
      </motion.div>
    </div>
  )
}
