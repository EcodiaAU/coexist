/**
 * 1.8.5 polish item 7 - role-tier capability gating regression tests.
 * Fork: fork_moy0xmrx_158384.
 *
 * Tate verbatim 16:44 AEST 9 May 2026:
 *   "right now some collective assistant leaders maybe and definitely
 *    leaders can see some admin pages so I think the permissions and
 *    sidebar need to be redone so that leaders can't see or access
 *    admin pages."
 *
 * Locks in the doctrine: only manager + admin global roles get admin-page
 * capabilities by default. Lower tiers (participant / assist_leader /
 * co_leader / leader / national_leader) get NONE.
 */
import { describe, it, expect } from 'vitest'
import { resolveCapabilities, ROLE_DEFAULT_CAPS, CAPABILITY_KEYS } from '@/lib/capabilities'

describe('1.8.5 item 7 - admin-page capability tier discipline', () => {
  describe('lower-tier roles get zero admin-page caps', () => {
    it.each(['participant', 'assist_leader', 'co_leader', 'leader', 'national_leader'])(
      '%s has zero default capabilities',
      (role) => {
        const caps = resolveCapabilities(role)
        expect(caps.size).toBe(0)
      },
    )

    it('member legacy alias normalises to participant (zero caps)', () => {
      const caps = resolveCapabilities('member')
      expect(caps.size).toBe(0)
    })

    it('national_staff legacy alias normalises to leader (zero caps)', () => {
      const caps = resolveCapabilities('national_staff')
      expect(caps.size).toBe(0)
    })
  })

  describe('manager + admin tier retains admin-page caps', () => {
    it('manager has the canonical admin-page cap set', () => {
      const caps = resolveCapabilities('manager')
      expect(caps.has('manage_users')).toBe(true)
      expect(caps.has('manage_collectives')).toBe(true)
      expect(caps.has('manage_events')).toBe(true)
      expect(caps.has('view_reports')).toBe(true)
      expect(caps.has('view_audit_log')).toBe(true)
    })

    it('manager does NOT have manage_finances or manage_charity by default', () => {
      // These are admin-only per ROLE_DEFAULT_CAPS - manager set excludes them.
      const caps = resolveCapabilities('manager')
      expect(caps.has('manage_finances')).toBe(false)
      expect(caps.has('manage_charity')).toBe(true) // charity IS in manager set
    })

    it('admin has every capability', () => {
      const caps = resolveCapabilities('admin')
      for (const key of CAPABILITY_KEYS) {
        expect(caps.has(key), `admin missing ${key}`).toBe(true)
      }
    })

    it('super_admin legacy alias normalises to admin (full caps)', () => {
      const caps = resolveCapabilities('super_admin')
      expect(caps.size).toBe(CAPABILITY_KEYS.length)
    })

    it('national_admin legacy alias normalises to manager', () => {
      const caps = resolveCapabilities('national_admin')
      // Same as manager
      const managerCaps = resolveCapabilities('manager')
      expect([...caps].sort()).toEqual([...managerCaps].sort())
    })
  })

  describe('per-user permission overrides', () => {
    it('leader with explicit grant CAN receive a capability', () => {
      // Tate or admin can still elevate individual users via staff_roles.permissions.
      const caps = resolveCapabilities('leader', { manage_events: true })
      expect(caps.has('manage_events')).toBe(true)
      expect(caps.size).toBe(1)
    })

    it('manager with explicit revoke loses that capability', () => {
      const caps = resolveCapabilities('manager', { manage_users: false })
      expect(caps.has('manage_users')).toBe(false)
      expect(caps.has('manage_events')).toBe(true)
    })

    it('admin with revoke can be narrowed', () => {
      const caps = resolveCapabilities('admin', { manage_finances: false })
      expect(caps.has('manage_finances')).toBe(false)
      expect(caps.size).toBe(CAPABILITY_KEYS.length - 1)
    })
  })

  describe('ROLE_DEFAULT_CAPS shape sanity', () => {
    it('participant + assist_leader + co_leader + leader + national_leader all empty', () => {
      expect(ROLE_DEFAULT_CAPS.participant).toEqual([])
      expect(ROLE_DEFAULT_CAPS.assist_leader).toEqual([])
      expect(ROLE_DEFAULT_CAPS.co_leader).toEqual([])
      expect(ROLE_DEFAULT_CAPS.leader).toEqual([])
      expect(ROLE_DEFAULT_CAPS.national_leader).toEqual([])
    })

    it('manager set is a strict subset of admin set', () => {
      const managerSet = new Set(ROLE_DEFAULT_CAPS.manager)
      const adminSet = new Set(ROLE_DEFAULT_CAPS.admin)
      for (const cap of managerSet) {
        expect(adminSet.has(cap), `manager cap ${cap} must be in admin set`).toBe(true)
      }
    })

    it('admin role has the full canonical capability set', () => {
      expect(ROLE_DEFAULT_CAPS.admin).toEqual(CAPABILITY_KEYS)
    })
  })
})
