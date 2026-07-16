import { useState } from 'react'
import { Flag } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { useReportContent } from '@/hooks/use-report-content'
import { useToast } from '@/components/toast'

const REPORT_REASONS = [
  'Offensive or abusive content',
  'Hate speech or discrimination',
  'Sexually explicit content',
  'Spam or scam',
  'Harassment or bullying',
  'Violence or threats',
  'Other',
] as const

interface ReportContentSheetProps {
  open: boolean
  onClose: () => void
  contentId: string
  contentType: 'chat_message' | 'photo' | 'post' | 'profile'
}

export function ReportContentSheet({
  open,
  onClose,
  contentId,
  contentType,
}: ReportContentSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const reportContent = useReportContent()
  const { toast } = useToast()

  const handleSubmit = () => {
    if (!selectedReason) return

    reportContent.mutate(
      { contentId, contentType, reason: selectedReason },
      {
        onSuccess: () => {
          toast.success('Report submitted. Our team will review it within 24 hours.')
          setSelectedReason(null)
          onClose()
        },
        onError: () => {
          toast.error('Failed to submit report. Please try again.')
        },
      },
    )
  }

  return (
    <BottomSheet data-eos-id="src/components/report-content-sheet.tsx#0" open={open} onClose={onClose}>
      <div data-eos-id="src/components/report-content-sheet.tsx#1" className="px-1 pb-2">
        <div data-eos-id="src/components/report-content-sheet.tsx#2" className="flex items-center gap-2.5 mb-4">
          <div data-eos-id="src/components/report-content-sheet.tsx#3" className="flex items-center justify-center w-9 h-9 rounded-full bg-warning-100 text-warning-600">
            <Flag data-eos-id="src/components/report-content-sheet.tsx#4" size={16} />
          </div>
          <div data-eos-id="src/components/report-content-sheet.tsx#5">
            <h3 data-eos-id="src/components/report-content-sheet.tsx#6" className="font-heading text-base font-semibold text-neutral-900">
              Report content
            </h3>
            <p data-eos-id="src/components/report-content-sheet.tsx#7" className="text-xs text-neutral-500">
              Select a reason for reporting
            </p>
          </div>
        </div>

        <div data-eos-id="src/components/report-content-sheet.tsx#8" className="space-y-1.5 mb-5">
          {REPORT_REASONS.map((reason) => (
            <button data-eos-id="src/components/report-content-sheet.tsx#9"
              key={reason}
              type="button"
              onClick={() => setSelectedReason(reason)}
              className={`flex w-full items-center rounded-sm px-4 py-3 min-h-11 text-sm transition-colors duration-150 cursor-pointer select-none ${
                selectedReason === reason
                  ? 'bg-primary-100 text-neutral-900 font-medium'
                  : 'text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>

        <Button data-eos-id="src/components/report-content-sheet.tsx#10"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selectedReason}
          loading={reportContent.isPending}
          onClick={handleSubmit}
        >
          Submit Report
        </Button>
      </div>
    </BottomSheet>
  )
}
