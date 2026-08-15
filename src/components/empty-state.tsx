import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Search, Inbox, CloudOff, Leaf, type LucideIcon } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/cn'

interface EmptyStateAction {
  label: string
  to?: string
  onClick?: () => void
}

interface EmptyStateProps {
  /** A ReactNode illustration, or a preset key */
  illustration?: ReactNode | 'search' | 'empty' | 'error' | 'wildlife'
  title: string
  description: string
  action?: EmptyStateAction
  className?: string
}

// A branded solid watermark tile. Replaces the old thin dashed-stroke SVGs,
// which read as "image failed to load" (the universal broken-placeholder
// language) - the single most broken-looking element in the app per the
// 2026-08-15 design review. A soft-filled Lucide mark in a primary-50 tile
// reads as an intentional, calm empty state instead. Restrained by design:
// one tinted tile, one soft mark, no dashes, no decorative noise.
//
// Exported so any admin page can keep a contextual icon (Users, Calendar,
// ShoppingBag) while still rendering the branded tile, instead of passing a
// bare black Lucide outline as the EmptyState illustration (which reads as an
// unstyled placeholder). Prefer this over the string presets when a
// page-specific mark communicates more than the generic Inbox.
// eslint-disable-next-line react-refresh/only-export-components
export function WatermarkTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      data-eos-id="src/components/empty-state.tsx#0" data-eos-v="3"
      className="mx-auto flex h-28 w-28 items-center justify-center rounded-[1.75rem] bg-primary-50"
      aria-hidden="true"
    >
      <Icon size={52} strokeWidth={1.25} className="text-primary-300" />
    </div>
  )
}

const presetIllustrations: Record<string, ReactNode> = {
  search: <WatermarkTile icon={Search} />,
  empty: <WatermarkTile icon={Inbox} />,
  error: <WatermarkTile icon={CloudOff} />,
  wildlife: <WatermarkTile icon={Leaf} />,
}

function resolveIllustration(
  illustration: EmptyStateProps['illustration'],
): ReactNode | null {
  if (!illustration) return null
  if (typeof illustration === 'string') {
    return presetIllustrations[illustration] ?? null
  }
  return illustration
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const resolvedIllustration = resolveIllustration(illustration)

  const actionButton = action ? (
    <Button data-eos-id="src/components/empty-state.tsx#19" data-eos-var="action.label" data-eos-var-label="Label" data-eos-var-scope="prop"
      variant="primary"
      onClick={action.onClick}
      aria-label={action.label}
    >
      {action.label}
    </Button>
  ) : null

  return (
    <div data-eos-id="src/components/empty-state.tsx#20"
      className={cn(
        'flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
      role="status"
      aria-label={title}
    >
      {resolvedIllustration && (
        <div data-eos-id="src/components/empty-state.tsx#21" className="mb-6">{resolvedIllustration}</div>
      )}

      <h3 data-eos-id="src/components/empty-state.tsx#22" className="font-heading text-lg font-semibold text-neutral-900">
        {title}
      </h3>

      <p data-eos-id="src/components/empty-state.tsx#23" className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
        {description}
      </p>

      {action && (
        <div data-eos-id="src/components/empty-state.tsx#24" className="mt-6">
          {action.to ? (
            <Link data-eos-id="src/components/empty-state.tsx#25" to={action.to} tabIndex={-1}>
              {actionButton}
            </Link>
          ) : (
            actionButton
          )}
        </div>
      )}
    </div>
  )
}
