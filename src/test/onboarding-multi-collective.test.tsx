import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  toggleCollectiveSelection,
  collectivesToJoin,
} from '@/lib/onboarding-collectives'

/*
 * Regression guard for "I picked three collectives and was only joined to one"
 * (Tate 2026-09-14, reported by a user AT a Co-Exist event, who then could not
 * sign in or register for that day's Brisbane event because the home feed only
 * carries events from collectives you are a member of).
 *
 * Root cause was NOT the persistence loop - that already looped. Onboarding
 * held a single `collectiveId: string | null` and the step took
 * `selectedId` / `onSelect(isSelected ? null : id)`, so a second tap REPLACED
 * the first pick. Nothing on screen said so; the check badge just moved.
 *
 * Invariants below:
 *  1. three taps select three collectives (none replaces another)
 *  2. tapping a selected one removes ONLY it
 *  3. everything selected is joined, plus the national collective, deduped
 *  4. the button says how many are being joined, so a silent drop is visible
 */

const collectives = [
  { id: 'qld-sunshine', name: 'Sunshine Coast', region: 'Sunshine Coast', member_count: 300 },
  { id: 'qld-brisbane', name: 'Brisbane', region: 'Brisbane', member_count: 400 },
  { id: 'qld-goldcoast', name: 'Gold Coast', region: 'Gold Coast', member_count: 200 },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: collectives, isLoading: false, error: null }),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/use-nearby', () => ({ useUserLocation: () => ({ data: null }) }))
vi.mock('@/hooks/use-delayed-loading', () => ({ useDelayedLoading: () => false }))
vi.mock('@/lib/geo', () => ({
  resolveCollectiveCoords: () => null,
  haversineKm: () => 0,
}))

import { StepCollective } from '@/pages/onboarding/steps/step-collective'

/** Mirrors how onboarding.tsx owns the selection, so the test exercises the real wiring. */
function Harness({ onChange }: { onChange: (ids: string[]) => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  return (
    <StepCollective
      selectedIds={selectedIds}
      locationPoint={null}
      onToggle={(id) =>
        setSelectedIds((prev) => {
          const next = toggleCollectiveSelection(prev, id)
          onChange(next)
          return next
        })
      }
      onNext={() => {}}
      onSkip={() => {}}
    />
  )
}

describe('onboarding collective step - multi-select', () => {
  it('keeps all three picks when three collectives are tapped', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Sunshine Coast'))
    fireEvent.click(screen.getByLabelText('Brisbane'))
    fireEvent.click(screen.getByLabelText('Gold Coast'))

    // The exact defect: the third tap used to leave ONE id selected.
    expect(onChange).toHaveBeenLastCalledWith(['qld-sunshine', 'qld-brisbane', 'qld-goldcoast'])
    expect(screen.getByLabelText('Sunshine Coast').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Brisbane').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Gold Coast').getAttribute('aria-pressed')).toBe('true')
  })

  it('names the count on the button so a dropped pick is visible before submit', () => {
    render(<Harness onChange={() => {}} />)
    // Negative control: with nothing picked the button cannot advance.
    const before = screen.getByRole('button', { name: 'Join & Continue' }) as HTMLButtonElement
    expect(before.disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Sunshine Coast'))
    fireEvent.click(screen.getByLabelText('Brisbane'))
    expect(screen.getByRole('button', { name: 'Join 2 & Continue' })).toBeTruthy()
  })

  it('untaps only the collective that was tapped again', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Sunshine Coast'))
    fireEvent.click(screen.getByLabelText('Brisbane'))
    fireEvent.click(screen.getByLabelText('Sunshine Coast'))

    expect(onChange).toHaveBeenLastCalledWith(['qld-brisbane'])
    expect(screen.getByLabelText('Sunshine Coast').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Brisbane').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('collectivesToJoin', () => {
  it('joins every pick plus the national collective', () => {
    expect(collectivesToJoin(['qld-sunshine', 'qld-brisbane', 'qld-goldcoast'], 'au')).toEqual([
      'qld-sunshine',
      'qld-brisbane',
      'qld-goldcoast',
      'au',
    ])
  })

  it('does not write the national collective twice when it was also picked', () => {
    expect(collectivesToJoin(['au', 'qld-brisbane'], 'au')).toEqual(['au', 'qld-brisbane'])
  })

  it('still joins the national collective when the step was skipped', () => {
    expect(collectivesToJoin([], 'au')).toEqual(['au'])
  })

  it('writes nothing when the step was skipped and there is no national collective', () => {
    expect(collectivesToJoin([], null)).toEqual([])
  })
})
