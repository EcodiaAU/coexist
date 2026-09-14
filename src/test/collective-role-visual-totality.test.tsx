import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { collectiveRoleVisual, collectiveRoleOptionsFor } from '@/lib/collective-role-visuals'

/**
 * Regression guard for the 2026-09-14 admin-users crash.
 *
 * Pia (Perth) held the one `collective_members.role = 'member'` row in the live
 * Co-Exist table. `member` is a valid `collective_role` enum value and a
 * documented alias for participant, but the admin users page looked its icon up
 * in a PARTIAL map of four roles, got `undefined`, and rendered `<undefined />`.
 * React throws "element type is invalid" on that and unmounts the tree, so
 * opening her row took the whole app down instead of degrading one pill.
 *
 * The rule these tests hold is TOTALITY: every value the enum can carry must
 * resolve to a renderable icon, and so must a value the enum gains later.
 */

/** Every label in the live `collective_role` enum, probed from the Co-Exist DB
 *  on 2026-09-14 (project tjutlbzekfouwsiaplbr):
 *  {member,assist_leader,co_leader,leader,participant,manager,admin} */
const COLLECTIVE_ROLE_ENUM_LABELS = [
  'member',
  'assist_leader',
  'co_leader',
  'leader',
  'participant',
  'manager',
  'admin',
] as const

describe('collectiveRoleVisual is total over the collective_role enum', () => {
  it.each(COLLECTIVE_ROLE_ENUM_LABELS)('resolves a renderable icon for %s', (role) => {
    const visual = collectiveRoleVisual(role)
    // The crash was specifically `Icon === undefined` reaching JSX.
    expect(visual.Icon).toBeDefined()
    expect(typeof visual.Icon).not.toBe('undefined')
    expect(visual.color).toBeTruthy()
    expect(visual.surface).toBeTruthy()
  })

  it('falls back rather than returning undefined for a role the enum gains later', () => {
    const visual = collectiveRoleVisual('regional_coordinator')
    expect(visual.Icon).toBeDefined()
    expect(visual.color).toBeTruthy()
    expect(visual.surface).toBeTruthy()
  })

  it('falls back for null and undefined instead of throwing', () => {
    expect(collectiveRoleVisual(null).Icon).toBeDefined()
    expect(collectiveRoleVisual(undefined).Icon).toBeDefined()
  })

  it('gives member the same treatment as participant, its documented alias', () => {
    expect(collectiveRoleVisual('member')).toEqual(collectiveRoleVisual('participant'))
  })
})

describe('collectiveRoleOptionsFor always contains the row current role', () => {
  it.each(COLLECTIVE_ROLE_ENUM_LABELS)('includes %s so the dropdown is never blank', (role) => {
    const options = collectiveRoleOptionsFor(role)
    expect(options.some((o) => o.value === role)).toBe(true)
  })

  it('leaves the assignable set untouched for a canonical role', () => {
    expect(collectiveRoleOptionsFor('leader')).toHaveLength(4)
  })

  it('prepends exactly one read-back entry for a legacy role', () => {
    const options = collectiveRoleOptionsFor('member')
    expect(options).toHaveLength(5)
    expect(options[0].value).toBe('member')
  })

  it('does not fabricate an option for a missing role', () => {
    expect(collectiveRoleOptionsFor(null)).toHaveLength(4)
  })
})

/* ------------------------------------------------------------------ */
/*  Render-level proof                                                 */
/*                                                                     */
/*  The resolver returning a value is necessary but not sufficient.     */
/*  What actually crashed the app was the resolved icon reaching JSX    */
/*  as `<Icon size={15} />` while undefined, which React rejects with   */
/*  "element type is invalid" and which unmounts the tree. These cases  */
/*  put the resolved icon through a real render so the assertion is     */
/*  about the thing that threw, not about a proxy for it.               */
/* ------------------------------------------------------------------ */

describe('the resolved icon survives a real React render', () => {
  it.each(COLLECTIVE_ROLE_ENUM_LABELS)('renders the membership pill for %s', (role) => {
    const { Icon } = collectiveRoleVisual(role)
    // Throws "Element type is invalid" on the pre-fix partial map.
    const { container } = render(<Icon size={15} />)
    expect(container.querySelector('svg')).not.toBeNull()
    cleanup()
  })

  it('renders for an unknown role rather than throwing', () => {
    const { Icon } = collectiveRoleVisual('regional_coordinator')
    const { container } = render(<Icon size={15} />)
    expect(container.querySelector('svg')).not.toBeNull()
    cleanup()
  })
})
