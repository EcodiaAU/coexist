import { useState, useEffect, startTransition } from 'react'
import { Car, MapPin } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'

interface SaveSeatSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: { pickup_address_text: string }) => void
  loading?: boolean
  /** Optional: name of the carpool driver to give context */
  driverName?: string | null
  /** Optional: short label of the linked event for context */
  eventTitle?: string | null
}

export function SaveSeatSheet({
  open,
  onClose,
  onSubmit,
  loading,
  driverName,
  eventTitle,
}: SaveSeatSheetProps) {
  const [pickupAddress, setPickupAddress] = useState('')

  // Reset on open
  useEffect(() => {
    if (open) {
      startTransition(() => setPickupAddress(''))
    }
  }, [open])

  // Reset on close (after exit animation)
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setPickupAddress(''), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  const canSubmit = pickupAddress.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({ pickup_address_text: pickupAddress.trim() })
    // pickup_lat / pickup_lng are nullable on the schema; v1 ships text-only.
    // Map-pin / geocoder selection lands in v2 - see SHARED-SPEC.md "Out of scope".
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-4 max-h-[80vh] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-success-50 text-success-600">
            <Car size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-neutral-900 truncate">Save me a seat</h3>
            <p className="text-xs text-neutral-500 truncate">
              {driverName
                ? `Riding with ${driverName}`
                : eventTitle
                  ? `For ${eventTitle}`
                  : 'Tell the driver where to pick you up'}
            </p>
          </div>
        </div>

        {/* Privacy reminder */}
        <div className="mb-3 rounded-sm bg-neutral-50 px-3.5 py-2.5 ring-1 ring-neutral-100">
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Your pickup address is only visible to you and the driver. Other collective members can&apos;t see it.
            </p>
          </div>
        </div>

        {/* Pickup address */}
        <div className="mb-4">
          <Input
            label="Pickup address"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="e.g. 12 Wattle St, Buderim"
            maxLength={200}
            autoComplete="street-address"
          />
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          loading={loading}
        >
          Save my seat
        </Button>
      </div>
    </BottomSheet>
  )
}
