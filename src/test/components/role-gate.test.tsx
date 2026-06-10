import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoleGate } from '@/components/role-gate'

// Mock useAuth
const mockAuth = {
  role: 'participant' as string,
  isLoading: false,
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockAuth,
}))

// Mock useCollectiveRole
const mockCollectiveRole = {
  hasMinRole: vi.fn(() => false),
  isLoading: false,
}
vi.mock('@/hooks/use-collective-role', () => ({
  useCollectiveRole: () => mockCollectiveRole,
}))

describe('RoleGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.role = 'participant'
    mockAuth.isLoading = false
    mockCollectiveRole.hasMinRole = vi.fn(() => false)
    mockCollectiveRole.isLoading = false
  })

  describe('global role checks', () => {
    it('renders children when user meets minimum global role', () => {
      mockAuth.role = 'manager'
      render(
        <RoleGate minRole="leader">
          <p>Admin content</p>
        </RoleGate>,
      )
      expect(screen.getByText('Admin content')).toBeInTheDocument()
    })

    it('hides children when user does not meet minimum global role', () => {
      mockAuth.role = 'participant'
      render(
        <RoleGate minRole="manager">
          <p>Hidden content</p>
        </RoleGate>,
      )
      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
    })

    it('renders fallback when user does not meet role', () => {
      mockAuth.role = 'participant'
      render(
        <RoleGate minRole="manager" fallback={<p>No access</p>}>
          <p>Admin only</p>
        </RoleGate>,
      )
      expect(screen.queryByText('Admin only')).not.toBeInTheDocument()
      expect(screen.getByText('No access')).toBeInTheDocument()
    })

    it('admin meets all global roles', () => {
      mockAuth.role = 'admin'
      render(
        <RoleGate minRole="manager">
          <p>Visible</p>
        </RoleGate>,
      )
      expect(screen.getByText('Visible')).toBeInTheDocument()
    })

    it('exact role match works', () => {
      mockAuth.role = 'national_leader'
      render(
        <RoleGate minRole="leader">
          <p>Staff content</p>
        </RoleGate>,
      )
      expect(screen.getByText('Staff content')).toBeInTheDocument()
    })
  })

  describe('collective role checks', () => {
    it('renders children when collective role met', () => {
      mockCollectiveRole.hasMinRole = vi.fn(() => true)
      render(
        <RoleGate minRole="leader" collectiveId="col-1">
          <p>Leader tools</p>
        </RoleGate>,
      )
      expect(screen.getByText('Leader tools')).toBeInTheDocument()
    })

    it('hides children when collective role not met', () => {
      mockCollectiveRole.hasMinRole = vi.fn(() => false)
      render(
        <RoleGate minRole="leader" collectiveId="col-1">
          <p>Leader tools</p>
        </RoleGate>,
      )
      expect(screen.queryByText('Leader tools')).not.toBeInTheDocument()
    })

    it('renders fallback for insufficient collective role', () => {
      mockCollectiveRole.hasMinRole = vi.fn(() => false)
      render(
        <RoleGate minRole="co_leader" collectiveId="col-1" fallback={<p>Members only</p>}>
          <p>Co-leader content</p>
        </RoleGate>,
      )
      expect(screen.getByText('Members only')).toBeInTheDocument()
    })
  })

  describe('loading states', () => {
    it('renders nothing while auth is loading', () => {
      mockAuth.isLoading = true
      render(
        <RoleGate minRole="participant">
          <p>Content</p>
        </RoleGate>,
      )
      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })

    it('renders nothing while collective role is loading', () => {
      mockCollectiveRole.isLoading = true
      render(
        <RoleGate minRole="leader" collectiveId="col-1">
          <p>Content</p>
        </RoleGate>,
      )
      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })
  })
})
