import { type ReactNode, useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Bell, LogOut, Settings, Shield, User, ChevronDown, ShoppingBag, Heart, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { Avatar } from '@/components/avatar'
import { APP_NAME } from '@/lib/constants'

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Events', path: '/events' },
  { label: 'Collectives', path: '/collectives' },
]

interface TopNavProps {
  /** Unread notification count */
  notificationCount?: number
  className?: string
}

export function TopNav({ notificationCount = 0, className }: TopNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { profile, isStaff, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [dropdownOpen])

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false)
  }, [location.pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-50',
        'bg-surface-0',
        'shadow-sm',
        className,
      )}
      aria-label="Top navigation"
    >
      <div className="mx-auto max-w-[1280px] flex items-center h-16 px-6">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 shrink-0 mr-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded-md"
          aria-label={`${APP_NAME} home`}
        >
          <img
            src="/logos/black-wordmark.png"
            alt={APP_NAME}
            className="h-8 w-auto"
          />
        </Link>

        {/* Centre nav links */}
        <nav className="flex-1 flex items-center justify-center gap-1" role="navigation">
          {navLinks.map((link) => {
            const active = isActive(link.path)
            return (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'relative px-4 py-2 rounded-lg text-sm font-medium',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  active
                    ? 'text-primary-800'
                    : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
                {active && (
                  <motion.span
                    layoutId={shouldReduceMotion ? undefined : 'top-nav-indicator'}
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-800 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Notification bell */}
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className={cn(
              'relative flex items-center justify-center',
              'min-w-11 min-h-11 w-11 h-11 rounded-full',
              'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50',
              'active:scale-[0.97] transition-transform duration-150',
              'cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            )}
            aria-label={
              notificationCount > 0
                ? `${notificationCount} unread notifications`
                : 'Notifications'
            }
          >
            <Bell size={20} />
            {notificationCount > 0 && (
              <span
                className={cn(
                  'absolute top-1.5 right-1.5',
                  'w-2.5 h-2.5 rounded-full',
                  'bg-error ring-2 ring-white',
                )}
              />
            )}
          </button>

          {/* Avatar dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((p) => !p)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-full',
                'min-h-11 min-w-11',
                'cursor-pointer select-none',
                'active:scale-[0.97] transition-transform duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                dropdownOpen && 'ring-2 ring-primary-200',
              )}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              aria-label="User menu"
            >
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name || ''}
                size="sm"
              />
              <ChevronDown
                size={14}
                className={cn(
                  'text-neutral-400 transition-transform duration-150',
                  dropdownOpen && 'rotate-180',
                )}
              />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'absolute right-0 top-full mt-2',
                    'w-56 py-1.5 rounded-xl',
                    'bg-white',
                    'shadow-lg',
                  )}
                  role="menu"
                >
                  {/* User info */}
                  <div className="px-4 py-3 bg-neutral-50">
                    <p className="font-heading text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                      {profile?.display_name}
                    </p>
                    <p className="text-caption text-neutral-500 truncate">
                      @{(profile as Record<string, unknown>)?.handle as string}
                    </p>
                  </div>

                  <DropdownItem
                    icon={<User size={16} />}
                    label="Profile"
                    onClick={() => navigate('/profile')}
                  />
                  <DropdownItem
                    icon={<TrendingUp size={16} />}
                    label="My Impact"
                    onClick={() => navigate('/profile')}
                  />
                  <DropdownItem
                    icon={<ShoppingBag size={16} />}
                    label="Shop"
                    onClick={() => navigate('/shop')}
                  />
                  <DropdownItem
                    icon={<Heart size={16} />}
                    label="Donate"
                    onClick={() => navigate('/donate')}
                  />
                  <div className="my-1.5 h-px bg-neutral-100" />
                  <DropdownItem
                    icon={<Settings size={16} />}
                    label="Settings"
                    onClick={() => navigate('/settings')}
                  />
                  {isStaff && (
                    <DropdownItem
                      icon={<Shield size={16} />}
                      label="Admin"
                      onClick={() => navigate('/admin')}
                    />
                  )}
                  <div className="my-1.5 h-px bg-neutral-100" />
                  <DropdownItem
                    icon={<LogOut size={16} />}
                    label="Log out"
                    onClick={signOut}
                    danger
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  )
}

function DropdownItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-2.5',
        'min-h-11',
        'text-sm text-left',
        'cursor-pointer select-none',
        'active:scale-[0.97] transition-transform duration-150',
        'focus-visible:outline-none focus-visible:bg-white',
        danger
          ? 'text-error hover:bg-error-50'
          : 'text-neutral-900 hover:bg-neutral-50',
      )}
    >
      <span className="flex items-center justify-center shrink-0">{icon}</span>
      {label}
    </button>
  )
}

