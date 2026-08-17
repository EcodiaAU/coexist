import {
  CalendarDays,
  Users,
  ShoppingBag,
  Megaphone,
  MapPin,
  ClipboardList,
  ClipboardCheck,
  FileText,
  Mail,
  Bug,
  Home,
  Shield,
  Phone,
  Leaf,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react'
import { createElement } from 'react'
import { FEATURE_MEMBERSHIPS } from '@/lib/flags'
import type { NavCategory, NavItem } from './types'

const icon = (Icon: typeof Home, size = 17) => createElement(Icon, { size, strokeWidth: 1.5 })

export const adminHomeItem: NavItem = { label: 'Admin Home', path: '/admin', icon: icon(Home) }

export const adminNavCategories: NavCategory[] = [
  {
    label: 'Programme',
    sectionHeader: 'Admin',
    sectionBorderColor: 'border-secondary-600',
    labelColor: 'text-secondary-700',
    dotColor: 'bg-secondary-600',
    items: [
      { label: 'Collectives', path: '/admin/collectives', icon: icon(MapPin), capability: 'manage_collectives' },
      { label: 'Events', path: '/admin/events', icon: icon(CalendarDays), capability: 'manage_events' },
      // Development (LMS) suite hidden from the admin nav 2026-08-10 (Tate directive):
      // the learner side is unbuilt/dead-ended, so admins should not author into it.
      // Authoring code + /admin/development routes + all DB tables are kept intact
      // for the future build; only the nav entry and the learner routes are removed.
      { label: 'Shop', path: '/admin/shop', icon: icon(ShoppingBag), capability: 'manage_merch' },
      ...(FEATURE_MEMBERSHIPS
        ? [{ label: 'Membership', path: '/admin/memberships', icon: icon(Sparkles), capability: 'manage_membership' }]
        : []),
      { label: 'Users', path: '/admin/users', icon: icon(Users), capability: 'manage_users' },
    ],
  },
  {
    label: 'Engage',
    labelColor: 'text-secondary-700',
    dotColor: 'bg-secondary-600',
    items: [
      { label: 'Tasks', path: '/admin/tasks', icon: icon(ClipboardCheck), capability: 'manage_workflows' },
      { label: 'Surveys', path: '/admin/surveys', icon: icon(ClipboardList), capability: 'manage_surveys' },
      { label: 'Email', path: '/admin/email', icon: icon(Mail), capability: 'manage_email' },
      { label: 'Updates', path: '/admin/updates', icon: icon(Megaphone), capability: 'send_announcements' },
      { label: 'Announcement', path: '/admin/announcement', icon: icon(Sparkles), capability: 'send_announcements' },
    ],
  },
  {
    label: 'Insights',
    labelColor: 'text-secondary-700',
    dotColor: 'bg-secondary-600',
    items: [
      // Impact + Attendance (Metrics) + Reports merged into one Insights
      // surface (2026-06-10). The legacy URLs still redirect.
      { label: 'Insights', path: '/admin/insights', icon: icon(Leaf), capability: 'view_reports' },
      { label: 'Photos', path: '/admin/photos', icon: icon(ImageIcon), capability: 'view_reports' },
      { label: 'Audit Log', path: '/admin/audit-log', icon: icon(FileText), capability: 'view_audit_log' },
    ],
  },
  {
    label: 'Settings',
    labelColor: 'text-secondary-700',
    dotColor: 'bg-secondary-600',
    items: [
      { label: 'Organisational Policies', path: '/admin/legal-pages', icon: icon(FileText), capability: 'manage_system' },
      { label: 'Applications', path: '/admin/applications', icon: icon(ClipboardList), capability: 'manage_users' },
      // Partners admin config hidden until the public partners page is back.
      { label: 'Contacts', path: '/admin/contacts', icon: icon(Phone), capability: 'manage_users' },
      { label: 'Dev Tools', path: '/admin/dev-tools', icon: icon(Bug), devOnly: true },
    ],
  },
]

// Re-export icon helpers used by the orchestrator for suite identity
export { Shield }
