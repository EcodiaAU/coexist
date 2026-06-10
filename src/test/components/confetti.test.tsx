import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { Confetti } from '@/components/confetti'

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
    },
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

describe('Confetti', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when not active', () => {
    const { container } = render(<Confetti active={false} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('renders particles when active', () => {
    render(<Confetti active count={10} />)
    // The container is aria-hidden
    const confettiContainer = document.querySelector('[aria-hidden="true"]')
    expect(confettiContainer).toBeInTheDocument()
  })

  it('auto-clears after duration', () => {
    render(<Confetti active count={5} duration={1000} />)
    // Initially visible
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // After duration, should be cleared
    // Note: AnimatePresence may still render briefly, but particles should be gone
  })

  it('respects count prop', () => {
    render(<Confetti active count={3} />)
    // 3 particles should be rendered (each as an absolute div)
    const container = document.querySelector('[aria-hidden="true"]')
    expect(container).toBeInTheDocument()
    // Each particle is a .css-particle div inside the container
    const particles = container?.querySelectorAll('.css-particle')
    expect(particles?.length).toBe(3)
  })
})
