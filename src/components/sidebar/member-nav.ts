import {
  Compass,
  ShoppingBag,
  Heart,
  Megaphone,
  Users,
  Mail,
  MessageCircle,
  Home,
} from 'lucide-react'
import { createElement } from 'react'
import type { NavCategory, NavItem } from './types'

const icon = (Icon: typeof Home, size = 17) => createElement(Icon, { size, strokeWidth: 1.5 })

export const memberHomeItem: NavItem = { label: 'Home', path: '/', icon: icon(Home) }

export const memberNavCategories: NavCategory[] = [
  {
    label: 'Browse',
    sectionHeader: 'Member',
    sectionBorderColor: 'border-neutral-200',
    labelColor: 'text-primary-400',
    dotColor: 'bg-primary-400',
    items: [
      { label: 'Updates', path: '/updates', icon: icon(Megaphone) },
      { label: 'Explore', path: '/explore', icon: icon(Compass) },
      { label: 'Chat', path: '/chat', icon: icon(MessageCircle), desktopOnly: true },
    ],
  },
  {
    label: 'Support',
    labelColor: 'text-primary-400',
    dotColor: 'bg-primary-400',
    items: [
      { label: 'Shop', path: '/shop', icon: icon(ShoppingBag) },
      { label: 'Donate', path: '/donate', icon: icon(Heart) },
      { label: 'Leadership Opportunities', path: '/leadership', icon: icon(Users) },
      // Our Partners: hidden from the sidebar for now; route still exists.
      // Re-add when the partners page content is ready.
      { label: 'Contact Us', path: '/contact', icon: icon(Mail) },
    ],
  },
]
