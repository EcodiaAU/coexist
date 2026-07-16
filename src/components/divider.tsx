import { cn } from '@/lib/cn'

interface DividerProps {
  label?: string
  className?: string
}

export function Divider({ label, className }: DividerProps) {
  if (label) {
    return (
      <div data-eos-id="src/components/divider.tsx#0"
        role="separator"
        className={cn('flex items-center gap-3 py-2', className)}
      >
        <span data-eos-id="src/components/divider.tsx#1" className="flex-1 h-px bg-white" aria-hidden="true" />
        <span data-eos-id="src/components/divider.tsx#2" className="text-xs font-semibold uppercase tracking-wider text-neutral-400 select-none">
          {label}
        </span>
        <span data-eos-id="src/components/divider.tsx#3" className="flex-1 h-px bg-white" aria-hidden="true" />
      </div>
    )
  }

  return (
    <hr data-eos-id="src/components/divider.tsx#4"
      role="separator"
      className={cn('border-0 h-px bg-white', className)}
    />
  )
}
