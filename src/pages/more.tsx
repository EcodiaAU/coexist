import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  Settings,
  ShoppingBag,
  Heart,
  Megaphone,
  Users,
  BarChart3,
  Plus,
  Shield,
  Handshake,
  Mail,
  ChevronRight,
  Leaf,
  Compass,
  FileText,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Avatar } from '@/components/avatar'
import { EcodiaAttribution } from '@/components/ecodia-attribution'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useHasPartners } from '@/hooks/use-has-partners'
import { useUnreadCount } from '@/hooks/use-notifications'
interface MenuLink {
  label: string
  to: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  description?: string
  badge?: number
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] } },
}

function MenuSection({
  title,
  items,
  navigate,
  shouldReduceMotion,
}: {
  title: string
  items: MenuLink[]
  navigate: (to: string) => void
  shouldReduceMotion: boolean | null
}) {
  return (
    <motion.section
      variants={shouldReduceMotion ? undefined : fadeUp}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5 px-1">
        {title}
      </h3>
      <div className="rounded-2xl bg-surface-0 shadow-sm overflow-hidden">
        { }
        {items.map(({ label, to, icon, iconBg, iconColor, description: _description, badge }, idx) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className={cn(
              'w-full flex items-center gap-3.5 px-4 py-3 min-h-12',
              'text-left transition-colors duration-150',
              'active:bg-surface-3 active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
              'cursor-pointer select-none',
              idx > 0 && 'border-t border-neutral-100',
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                iconBg,
                iconColor,
              )}
            >
              {icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-neutral-900 leading-tight">{label}</p>
            </div>
            {badge !== undefined && badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-[10px] font-bold mr-1">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
            <ChevronRight size={16} className="text-neutral-300 shrink-0" />
          </button>
        ))}
      </div>
    </motion.section>
  )
}

export default function MorePage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { profile, collectiveRoles, isStaff } = useAuth()
  const { hasPartners } = useHasPartners()
  const isAnyLeader = collectiveRoles.some(
    (m) => ['leader', 'co_leader', 'assist_leader'].includes(m.role),
  )
  const { data: unreadCount = 0 } = useUnreadCount()

  // Updates page now folds in the notifications inbox - a single "Updates"
  // entry shows the unread count for both notifications + announcements.
  const updatesLinks: MenuLink[] = [
    { label: 'Updates', to: '/updates', icon: <Megaphone size={17} />, iconBg: 'bg-plum-50', iconColor: 'text-plum-600', badge: unreadCount },
    { label: 'Explore', to: '/explore', icon: <Compass size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-600' },
  ]

  const supportLinks: MenuLink[] = [
    { label: 'Leadership Opportunities', to: '/leadership', icon: <Users size={17} />, iconBg: 'bg-moss-50', iconColor: 'text-moss-600' },
    { label: 'Contact Us', to: '/contact', icon: <Mail size={17} />, iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
    ...(hasPartners ? [{ label: 'Our Partners', to: '/partners', icon: <Handshake size={17} />, iconBg: 'bg-warning-50', iconColor: 'text-warning-600' }] : []),
  ]

  const shopLinks: MenuLink[] = [
    { label: 'Donate', to: '/donate', icon: <Heart size={17} />, iconBg: 'bg-coral-50', iconColor: 'text-coral-500' },
    { label: 'Shop', to: '/shop', icon: <ShoppingBag size={17} />, iconBg: 'bg-neutral-100', iconColor: 'text-neutral-600' },
  ]

  const accountLinks: MenuLink[] = [
    { label: 'Settings', to: '/settings', icon: <Settings size={17} />, iconBg: 'bg-neutral-100', iconColor: 'text-neutral-600' },
  ]

  const leaderLinks: MenuLink[] = [
    { label: 'Leader Dashboard', to: '/leader', icon: <BarChart3 size={17} />, iconBg: 'bg-neutral-100', iconColor: 'text-neutral-600' },
    { label: 'Create Event', to: '/events/create', icon: <Plus size={17} />, iconBg: 'bg-neutral-100', iconColor: 'text-neutral-600' },
  ]

  const adminLinks: MenuLink[] = [
    { label: 'Admin Dashboard', to: '/admin', icon: <Shield size={17} />, iconBg: 'bg-error-100/60', iconColor: 'text-error-700' },
  ]

  const legalLinks: MenuLink[] = [
    { label: 'About', to: '/about', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Terms of Service', to: '/terms', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Privacy Policy', to: '/privacy', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Data Policy', to: '/data-policy', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Disclaimer', to: '/disclaimer', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Accessibility', to: '/accessibility', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
    { label: 'Cookie Policy', to: '/cookies', icon: <FileText size={17} />, iconBg: 'bg-neutral-50', iconColor: 'text-neutral-400' },
  ]

  return (
    <Page
      header={
        <header
          className="sticky z-40 px-5 pt-2 pb-3"
          style={{ top: 'var(--safe-top)' }}
          aria-label="More page header"
        >
          <h1 className="font-heading text-2xl font-bold text-neutral-900">
            More
          </h1>
        </header>
      }
      className="bg-surface-1"
    >
      <motion.div
        className="space-y-6 pb-10"
        initial="hidden"
        animate="visible"
        variants={shouldReduceMotion ? undefined : stagger}
      >
        {/* Profile card */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
        >
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className={cn(
              'w-full flex items-center gap-4 p-4',
              'rounded-2xl',
              'bg-white border border-neutral-100 shadow-sm',
              'active:scale-[0.98] transition-transform duration-150',
              'cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
            )}
          >
            <div className="relative">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name ?? ''}
                size="lg"
              />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-heading text-lg font-bold text-neutral-900 truncate">
                {profile?.display_name}
              </p>
            </div>
            <ChevronRight size={20} className="text-neutral-400 shrink-0" />
          </button>
        </motion.div>

        <MenuSection title="Updates & Events" items={updatesLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />
        <MenuSection title="Support" items={supportLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />
        <MenuSection title="Donate & Shop" items={shopLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />
        <MenuSection title="Account" items={accountLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />

        {isAnyLeader && (
          <MenuSection title="Leader Tools" items={leaderLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />
        )}

        {isStaff && (
          <MenuSection title="Admin" items={adminLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />
        )}

        <MenuSection title="Legal" items={legalLinks} navigate={navigate} shouldReduceMotion={shouldReduceMotion} />

        {/* Footer tagline */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="flex flex-col items-center gap-2 pt-4 pb-2"
        >
          <Leaf size={18} className="text-neutral-300" />
          <p className="text-[11px] font-medium text-neutral-400 tracking-wide">
            Explore. Connect. Protect.
          </p>
          <EcodiaAttribution className="mt-1" />
        </motion.div>
      </motion.div>
    </Page>
  )
}
