import { AlertTriangle, Trash2 } from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { Button } from './button'
import { cn } from '@/lib/cn'

type SheetVariant = 'danger' | 'warning'

interface ConfirmationSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  variant?: SheetVariant
  className?: string
  'aria-label'?: string
}

const variantConfig: Record<
  SheetVariant,
  { iconBg: string; iconColor: string; icon: typeof Trash2 }
> = {
  danger: {
    iconBg: 'bg-error-100',
    iconColor: 'text-error-600',
    icon: Trash2,
  },
  warning: {
    iconBg: 'bg-warning-100',
    iconColor: 'text-warning-600',
    icon: AlertTriangle,
  },
}

export function ConfirmationSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  variant = 'danger',
  className,
  'aria-label': ariaLabel,
}: ConfirmationSheetProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <BottomSheet data-eos-id="src/components/confirmation-sheet.tsx#0"
      open={open}
      onClose={onClose}
      className={className}
    >
      <div data-eos-id="src/components/confirmation-sheet.tsx#1"
        aria-label={ariaLabel ?? `Confirm: ${title}`}
        className="flex flex-col items-center px-5 pb-4 pt-2 text-center"
      >
        {/* Icon */}
        <div data-eos-id="src/components/confirmation-sheet.tsx#2"
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            config.iconBg,
          )}
          aria-hidden="true"
        >
          <Icon data-eos-id="src/components/confirmation-sheet.tsx#3" size={24} className={config.iconColor} />
        </div>

        {/* Title */}
        <h3 data-eos-id="src/components/confirmation-sheet.tsx#4" className="font-heading text-lg font-semibold text-neutral-900">
          {title}
        </h3>

        {/* Description */}
        <p data-eos-id="src/components/confirmation-sheet.tsx#5" className="mt-2 text-sm leading-relaxed text-neutral-500">
          {description}
        </p>

        {/* Actions */}
        <div data-eos-id="src/components/confirmation-sheet.tsx#6" className="mt-6 flex w-full flex-col gap-2">
          <Button data-eos-id="src/components/confirmation-sheet.tsx#7"
            variant="danger"
            fullWidth
            onClick={() => {
              onConfirm()
              onClose()
            }}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </Button>
          <Button data-eos-id="src/components/confirmation-sheet.tsx#8"
            variant="ghost"
            fullWidth
            onClick={onClose}
            aria-label="Cancel"
          >
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
