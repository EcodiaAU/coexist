import { cn } from '@/lib/cn'
import { type EmailTag, statusConfig } from './shared'

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.draft
  return (
    <span data-eos-id="src/pages/admin/email/shared-ui.tsx#0" data-eos-var="config.label" data-eos-var-label="Label" data-eos-var-scope="prop"
      className={cn(
        'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full',
        config.bg,
        config.text,
      )}
    >
      {config.label}
    </span>
  )
}

export function TagPill({ tag, size = 'sm' }: { tag: EmailTag; size?: 'sm' | 'xs' }) {
  return (
    <span data-eos-id="src/pages/admin/email/shared-ui.tsx#1" data-eos-var="tag.name" data-eos-var-label="Name" data-eos-var-scope="prop"
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-[11px] px-2 py-0.5',
      )}
      style={{
        backgroundColor: `${tag.colour}20`,
        color: tag.colour,
      }}
    >
      {tag.name}
    </span>
  )
}
