import { icons } from 'lucide-react'
import { cn } from '@/lib/cn'

const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

type IconSize = keyof typeof sizeMap

interface IconProps {
  name: string
  size?: IconSize
  color?: string
  className?: string
  'aria-label'?: string
}

export function Icon({
  name,
  size = 'md',
  color = 'currentColor',
  className,
  'aria-label': ariaLabel,
}: IconProps) {
  const LucideIcon = icons[name as keyof typeof icons]

  if (!LucideIcon) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] Unknown Lucide icon: "${name}"`)
    }
    return null
  }

  return (
    <LucideIcon data-eos-id="src/components/icon.tsx#0" data-eos-v="2"
      size={sizeMap[size]}
      color={color}
      className={cn('shrink-0', className)}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
    />
  )
}
