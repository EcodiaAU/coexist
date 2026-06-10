/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from '@/components/bottom-sheet'

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({
        children,
        variants,
        initial,
        animate,
        exit,
        drag,
        dragConstraints,
        dragElastic,
        onDragEnd,
        layout,
        style,
        ...props
      }: any) => (
        <div style={typeof style === 'object' ? style : undefined} {...props}>
          {children}
        </div>
      ),
    },
    useReducedMotion: () => true,
    useMotionValue: (initial: number) => ({
      get: () => initial,
      set: vi.fn(),
    }),
    useTransform: () => 1,
    useAnimation: () => ({
      start: vi.fn().mockResolvedValue(undefined),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

describe('BottomSheet', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom defaults to innerWidth 1024 (desktop). Force mobile so MobileSheet renders.
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
  })

  it('renders nothing when closed', () => {
    render(
      <BottomSheet open={false} onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog when open', () => {
    render(
      <BottomSheet open onClose={onClose}>
        <p>Sheet content</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('renders children', () => {
    render(
      <BottomSheet open onClose={onClose}>
        <p>Hello from sheet</p>
      </BottomSheet>,
    )
    expect(screen.getByText('Hello from sheet')).toBeInTheDocument()
  })

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup()
    render(
      <BottomSheet open onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders drag handle', () => {
    render(
      <BottomSheet open onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    )
    // Drag handle is inside the mobile sheet portal
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('.cursor-grab')).toBeInTheDocument()
  })
})
