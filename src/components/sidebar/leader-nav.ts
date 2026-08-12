import {
  CalendarDays,
  ClipboardCheck,
  Home,
  MessageSquareText,
} from 'lucide-react'
import { createElement } from 'react'
import type { NavCategory, NavItem } from './types'

const icon = (Icon: typeof Home, size = 17) => createElement(Icon, { size, strokeWidth: 1.5 })

export const leaderHomeItem: NavItem = { label: 'Leader Home', path: '/leader', icon: icon(Home) }

export const leaderNavCategories: NavCategory[] = [
  {
    label: 'Collective',
    sectionHeader: 'Leader',
    sectionBorderColor: 'border-moss-500',
    labelColor: 'text-moss-500',
    dotColor: 'bg-moss-500',
    items: [
      { label: 'Events', path: '/leader/events', icon: icon(CalendarDays) },
      { label: 'Feedback', path: '/leader/feedback', icon: icon(MessageSquareText) },
      { label: 'Tasks', path: '/leader/tasks', icon: icon(ClipboardCheck) },
    ],
  },
]
