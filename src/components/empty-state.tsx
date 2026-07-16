import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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

const presetIllustrations: Record<string, ReactNode> = {
  search: (
    <svg data-eos-id="src/components/empty-state.tsx#0" data-eos-v="2"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      <circle data-eos-id="src/components/empty-state.tsx#1" cx="52" cy="52" r="32" stroke="currentColor" strokeWidth="4" className="text-primary-200" />
      <line data-eos-id="src/components/empty-state.tsx#2" x1="76" y1="76" x2="100" y2="100" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary-300" />
      <circle data-eos-id="src/components/empty-state.tsx#3" cx="52" cy="52" r="12" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-primary-200" />
    </svg>
  ),
  empty: (
    <svg data-eos-id="src/components/empty-state.tsx#4"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      <rect data-eos-id="src/components/empty-state.tsx#5" x="24" y="32" width="72" height="56" rx="8" stroke="currentColor" strokeWidth="4" className="text-primary-200" />
      <path data-eos-id="src/components/empty-state.tsx#6" d="M24 52 h72" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" className="text-primary-200" />
      <circle data-eos-id="src/components/empty-state.tsx#7" cx="60" cy="72" r="6" fill="currentColor" className="text-primary-200" />
    </svg>
  ),
  error: (
    <svg data-eos-id="src/components/empty-state.tsx#8"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      <circle data-eos-id="src/components/empty-state.tsx#9" cx="60" cy="60" r="36" stroke="currentColor" strokeWidth="4" className="text-primary-200" />
      <path data-eos-id="src/components/empty-state.tsx#10" d="M60 44v20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary-300" />
      <circle data-eos-id="src/components/empty-state.tsx#11" cx="60" cy="76" r="3" fill="currentColor" className="text-primary-300" />
    </svg>
  ),
  wildlife: (
    <svg data-eos-id="src/components/empty-state.tsx#12"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      <path data-eos-id="src/components/empty-state.tsx#13" d="M60 28 C40 28 28 44 28 60 C28 80 44 96 60 96 C76 96 92 80 92 60 C92 44 80 28 60 28Z" stroke="currentColor" strokeWidth="3" className="text-primary-200" />
      <circle data-eos-id="src/components/empty-state.tsx#14" cx="48" cy="54" r="4" fill="currentColor" className="text-primary-300" />
      <circle data-eos-id="src/components/empty-state.tsx#15" cx="72" cy="54" r="4" fill="currentColor" className="text-primary-300" />
      <path data-eos-id="src/components/empty-state.tsx#16" d="M50 68 Q60 76 70 68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="text-primary-300" />
      <path data-eos-id="src/components/empty-state.tsx#17" d="M36 36 Q28 20 40 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="text-primary-200" />
      <path data-eos-id="src/components/empty-state.tsx#18" d="M84 36 Q92 20 80 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="text-primary-200" />
    </svg>
  ),
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
