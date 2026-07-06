import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { UtensilsCrossed } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { DIETARY_GATE_QUERY_KEY, NO_DIETARY_SENTINEL } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Dietary gate                                                       */
/*                                                                     */
/*  Anyone holding a ticket or registration to an UPCOMING TICKETED    */
/*  event must have dietary requirements on file - catering for        */
/*  camp-outs and ticketed events is ordered off this field. Users     */
/*  with an empty profiles.dietary_requirements who hold such a        */
/*  ticket get a blocking prompt on app open (which backdates the      */
/*  requirement to existing ticket holders) and immediately after a    */
/*  ticket purchase (the checkout flow invalidates                     */
/*  DIETARY_GATE_QUERY_KEY, re-running the eligibility check).         */
/*                                                                     */
/*  Unlike PhoneGate there is a legitimate "none" answer, so the       */
/*  gate offers a "No dietary requirements" button that stores the     */
/*  sentinel "None". An empty/null field means "never answered" and    */
/*  keeps the gate armed; "None" means "answered: none" and never      */
/*  re-nags.                                                           */
/*                                                                     */
/*  Precedence: PhoneGate wins. This gate only renders once a phone    */
/*  is on file, so the two blocking portals can never stack.           */
/* ------------------------------------------------------------------ */

export function DietaryGate() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [dietary, setDietary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null)

  const dietaryEmpty = !(profile?.dietary_requirements ?? '').trim()

  // Candidate = onboarded user, phone already on file (PhoneGate precedence:
  // that gate handles phone-less users and the two must never stack), and no
  // dietary answer recorded yet. Only candidates run the eligibility query.
  const candidate =
    !isLoading &&
    !!user &&
    !!profile &&
    profile.onboarding_completed === true &&
    !!(profile.phone ?? '').trim() &&
    dietaryEmpty

  // Does this user hold a live ticket OR registration to an upcoming
  // ticketed event? Both tables are checked because a ticketed event can
  // carry either artefact depending on how the user got in (paid checkout,
  // free claim, admin registration).
  const { data: hasUpcomingTicketed } = useQuery({
    queryKey: [...DIETARY_GATE_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return false
      const nowIso = new Date().toISOString()

      const [tickets, regs] = await Promise.all([
        supabase
          .from('event_tickets')
          .select('id, events!inner(id)')
          .eq('user_id', user.id)
          .in('status', ['pending', 'confirmed', 'checked_in'])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso)
          .limit(1),
        supabase
          .from('event_registrations')
          .select('id, events!inner(id)')
          .eq('user_id', user.id)
          .in('status', ['registered', 'attended'])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso)
          .limit(1),
      ])

      if (tickets.error) throw tickets.error
      if (regs.error) throw regs.error
      return (tickets.data?.length ?? 0) > 0 || (regs.data?.length ?? 0) > 0
    },
    enabled: candidate,
    staleTime: 5 * 60 * 1000,
  })

  const show = candidate && hasUpcomingTicketed === true

  // Lock body scroll while the gate is up.
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  // Keyboard-aware sizing via the visual viewport, same mechanism as
  // PhoneGate: anchor the sheet to the visible area above the on-screen
  // keyboard so the field and buttons are never occluded.
  useEffect(() => {
    if (!show) return
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop })
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [show])

  const persist = useCallback(async (value: string) => {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ dietary_requirements: value })
        .eq('id', user.id)
      if (updErr) throw updErr
      await refreshProfile()
      toast.success('Dietary requirements saved')
      // refreshProfile flips `show` to false, unmounting the gate.
    } catch {
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [user, refreshProfile, toast])

  const handleSave = useCallback(async () => {
    const trimmed = dietary.trim()
    if (!trimmed) {
      setError('Tell us your dietary requirements, or tap "No dietary requirements"')
      return
    }
    await persist(trimmed)
  }, [dietary, persist])

  const handleNone = useCallback(async () => {
    await persist(NO_DIETARY_SENTINEL)
  }, [persist])

  if (!show) return null

  return createPortal(
    <div
      className="fixed left-0 right-0 z-[200] flex items-end sm:items-center justify-center"
      style={
        viewport
          ? { top: viewport.offsetTop, height: viewport.height }
          : { top: 0, height: '100dvh' }
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="dietary-gate-title"
    >
      {/* Non-dismissable backdrop - no onClick, no Escape handler. */}
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
      >
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <UtensilsCrossed size={22} className="text-primary-800" />
            </div>
            <h2 id="dietary-gate-title" className="font-heading text-xl font-bold text-neutral-900">
              Any dietary requirements?
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              You have a ticket to an upcoming event. We cater for camp-outs and
              ticketed events, so we need to know about allergies or dietary needs
              before we shop.
            </p>
          </div>

          <Input
            type="textarea"
            label="Dietary requirements"
            value={dietary}
            onChange={(e) => { setDietary(e.target.value); if (error) setError(null) }}
            placeholder="e.g. Vegetarian, gluten free, nut allergy..."
            rows={2}
            maxLength={500}
            error={error ?? undefined}
          />

          <div className="space-y-2.5">
            <Button
              variant="primary"
              fullWidth
              loading={saving}
              onClick={handleSave}
            >
              Save and continue
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={handleNone}
            >
              No dietary requirements
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
