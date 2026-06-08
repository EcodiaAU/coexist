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
  GraduationCap,
  Home,
  Shield,
  Phone,
  Leaf,
  Image as ImageIcon,
  BarChart3,
} from 'lucide-react'
import { createElement } from 'react'
import type { NavCategory, NavItem } from './types'

const icon = (Icon: typeof Home, size = 17) => createElement(Icon, { size, strokeWidth: 1.5 })

export const adminHomeItem: NavItem = { label: 'Admin Home', path: '/admin', icon: icon(Home) }

export const adminNavCategories: NavCategory[] = [
  {
    label: 'Programme',
    sectionHeader: 'Admin',
    sectionBorderColor: 'border-amber-500',
    labelColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
    items: [
      { label: 'Collectives', path: '/admin/collectives', icon: icon(MapPin), capability: 'manage_collectives' },
      { label: 'Events', path: '/admin/events', icon: icon(CalendarDays), capability: 'manage_events' },
      { label: 'Development', path: '/admin/development', icon: icon(GraduationCap), capability: 'manage_content' },
      { label: 'Shop', path: '/admin/shop', icon: icon(ShoppingBag), capability: 'manage_merch' },
      { label: 'Users', path: '/admin/users', icon: icon(Users), capability: 'manage_users' },
    ],
  },
  {
    label: 'Engage',
    labelColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
    items: [
      { label: 'Tasks', path: '/admin/tasks', icon: icon(ClipboardCheck), capability: 'manage_workflows' },
      { label: 'Surveys', path: '/admin/surveys', icon: icon(ClipboardList), capability: 'manage_surveys' },
      { label: 'Email', path: '/admin/email', icon: icon(Mail), capability: 'manage_email' },
      { label: 'Updates', path: '/admin/updates', icon: icon(Megaphone), capability: 'send_announcements' },
    ],
  },
  {
    label: 'Insights',
    labelColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
    items: [
      { label: 'Impact', path: '/admin/impact', icon: icon(Leaf), capability: 'view_reports' },
      { label: 'Metrics', path: '/admin/metrics', icon: icon(BarChart3), capability: 'view_reports' },
      { label: 'Photos', path: '/admin/photos', icon: icon(ImageIcon), capability: 'view_reports' },
      { label: 'Reports', path: '/admin/reports', icon: icon(FileText), capability: 'view_reports' },
      { label: 'Audit Log', path: '/admin/audit-log', icon: icon(FileText), capability: 'view_audit_log' },
    ],
  },
  {
    label: 'Settings',
    labelColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
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
