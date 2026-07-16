import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useBlockUser } from '@/hooks/use-user-blocks'
import { useToast } from '@/components/toast'

interface BlockUserSheetProps {
  open: boolean
  onClose: () => void
  userId: string
  userName: string
}

export function BlockUserSheet({
  open,
  onClose,
  userId,
  userName,
}: BlockUserSheetProps) {
  const [reason, setReason] = useState('')
  const blockUser = useBlockUser()
  const { toast } = useToast()

  const handleBlock = () => {
    blockUser.mutate(
      { blockedId: userId, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${userName} has been blocked. Their content will no longer appear in your feed.`)
          setReason('')
          onClose()
        },
        onError: () => {
          toast.error('Failed to block user. Please try again.')
        },
      },
    )
  }

  return (
    <BottomSheet data-eos-id="src/components/block-user-sheet.tsx#0" open={open} onClose={onClose}>
      <div data-eos-id="src/components/block-user-sheet.tsx#1" className="px-1 pb-2">
        <div data-eos-id="src/components/block-user-sheet.tsx#2" className="flex items-center gap-2.5 mb-4">
          <div data-eos-id="src/components/block-user-sheet.tsx#3" className="flex items-center justify-center w-9 h-9 rounded-full bg-error-100 text-error-600">
            <ShieldOff data-eos-id="src/components/block-user-sheet.tsx#4" size={16} />
          </div>
          <div data-eos-id="src/components/block-user-sheet.tsx#5">
            <h3 data-eos-id="src/components/block-user-sheet.tsx#6" className="font-heading text-base font-semibold text-neutral-900">
              Block {userName}?
            </h3>
            <p data-eos-id="src/components/block-user-sheet.tsx#7" className="text-xs text-neutral-500">
              They won&apos;t be notified
            </p>
          </div>
        </div>

        <p data-eos-id="src/components/block-user-sheet.tsx#8" className="text-sm text-primary-500 leading-relaxed mb-4">
          Blocking this user will:
        </p>
        <ul data-eos-id="src/components/block-user-sheet.tsx#9" className="text-sm text-primary-500 space-y-1.5 mb-4 pl-4 list-disc">
          <li data-eos-id="src/components/block-user-sheet.tsx#10">Hide their messages and content from your feed</li>
          <li data-eos-id="src/components/block-user-sheet.tsx#11">Prevent them from seeing your profile</li>
          <li data-eos-id="src/components/block-user-sheet.tsx#12">Notify our moderation team for review</li>
        </ul>

        <div data-eos-id="src/components/block-user-sheet.tsx#13" className="mb-5">
          <Input data-eos-id="src/components/block-user-sheet.tsx#14"
            label="Reason (optional)"
            type="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Help our team understand what happened"
          />
        </div>

        <div data-eos-id="src/components/block-user-sheet.tsx#15" className="space-y-2">
          <Button data-eos-id="src/components/block-user-sheet.tsx#16"
            variant="primary"
            size="lg"
            fullWidth
            loading={blockUser.isPending}
            onClick={handleBlock}
            className="!bg-error-600 hover:!bg-error-700"
          >
            Block {userName}
          </Button>
          <Button data-eos-id="src/components/block-user-sheet.tsx#17"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
