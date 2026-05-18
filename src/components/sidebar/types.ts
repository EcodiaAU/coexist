import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  path: string
  icon: ReactNode
  capability?: string
  superAdminOnly?: boolean
  /** Only show when user email is in VITE_DEV_EMAILS and NODE_ENV is dev */
  devOnly?: boolean
  /** Only show on mobile sidebar (not desktop) */
  mobileOnly?: boolean
  /** Only show on desktop sidebar (not mobile) */
  desktopOnly?: boolean
  /** Optional notification count rendered as a green circle badge on the row */
  badge?: number
}

export interface NavCategory {
  label: string
  items: NavItem[]
  superAdminOnly?: boolean
  /** Only show on mobile sidebar (not desktop) */
  mobileOnly?: boolean
  /** Accent color class for the section label (e.g. 'text-plum-400') */
  labelColor?: string
  /** Accent dot color class shown before the label */
  dotColor?: string
  /** Prominent group header rendered above this category (e.g. 'Admin', 'Leader') */
  sectionHeader?: string
  /** Border color class for the section header left accent bar */
  sectionBorderColor?: string
}

export type Suite = 'main' | 'admin' | 'leader'
