import { useState, useCallback, useEffect, startTransition } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useShippingConfig } from '@/hooks/use-merch'
import { useUpdateShippingConfig } from '@/hooks/use-admin-merch'

export default function ShippingTab() {
  const { data: config, isLoading } = useShippingConfig()
  const showLoading = useDelayedLoading(isLoading)
  const updateConfig = useUpdateShippingConfig()
  const { toast } = useToast()

  const shouldReduceMotion = useReducedMotion()
  const [flatRate, setFlatRate] = useState('')
  const [freeThreshold, setFreeThreshold] = useState('')

  useEffect(() => {
    if (config) {
      startTransition(() => {
        setFlatRate(String(config.flat_rate_cents / 100))
        setFreeThreshold(
          config.free_shipping_threshold_cents
            ? String(config.free_shipping_threshold_cents / 100)
            : '',
        )
      })
    }
  }, [config])

  const flat = Number(flatRate)
  const threshold = freeThreshold ? Number(freeThreshold) : null
  const flatValid = flatRate.trim() !== '' && Number.isFinite(flat) && flat >= 0
  const thresholdValid = threshold === null || (Number.isFinite(threshold) && threshold >= 0)
  const canSave = flatValid && thresholdValid

  const handleSave = useCallback(async () => {
    // Validate before persisting: a non-numeric or negative entry used to be
    // stored as 'NaN' and silently reverted to the $9.95 default on next read.
    // Save is also disabled via canSave and inputs show inline errors.
    if (!canSave) {
      toast.error('Enter a valid non-negative amount')
      return
    }
    try {
      await updateConfig.mutateAsync({
        flat_rate_cents: Math.round(flat * 100),
        free_shipping_threshold_cents: threshold != null ? Math.round(threshold * 100) : null,
      })
      toast.success('Shipping config updated')
    } catch {
      toast.error('Failed to update shipping config')
    }
  }, [canSave, flat, threshold, updateConfig, toast])

  if (showLoading) {
    return <Skeleton variant="text" count={3} />
  }
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div
      className="space-y-4"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp}>
        <h2 className="font-heading font-semibold text-neutral-900">Shipping configuration</h2>
      </motion.div>
      <motion.div variants={fadeUp}>
      <Input
        label="Flat rate ($)"
        type="number"
        inputMode="decimal"
        min="0"
        value={flatRate}
        onChange={(e) => setFlatRate(e.target.value)}
        error={!flatValid && flatRate.trim() !== '' ? 'Enter a non-negative number' : undefined}
        helperText="Standard shipping cost"
      />
      <Input
        label="Free shipping threshold ($)"
        type="number"
        inputMode="decimal"
        min="0"
        value={freeThreshold}
        onChange={(e) => setFreeThreshold(e.target.value)}
        error={!thresholdValid ? 'Enter a non-negative number' : undefined}
        helperText="Orders above this amount get free shipping. Leave empty for no threshold."
      />
      </motion.div>
      <motion.div variants={fadeUp}>
      <Button
        variant="primary"
        fullWidth
        loading={updateConfig.isPending}
        disabled={!canSave}
        onClick={handleSave}
      >
        Save
      </Button>
      </motion.div>
    </motion.div>
  )
}
