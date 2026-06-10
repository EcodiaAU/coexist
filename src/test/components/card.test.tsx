import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Card } from '@/components/card'

// Mock framer-motion to render plain elements
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
      ),
    },
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

describe('Card', () => {
  it('renders as an article by default', () => {
    render(
      <Card>
        <Card.Content>Hello</Card.Content>
      </Card>,
    )
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('renders as a button when onClick is provided', () => {
    const onClick = vi.fn()
    render(
      <Card onClick={onClick}>
        <Card.Content>Clickable</Card.Content>
      </Card>,
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Card onClick={onClick}>
        <Card.Content>Clickable</Card.Content>
      </Card>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fires onClick on Enter key', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Card onClick={onClick}>
        <Card.Content>Clickable</Card.Content>
      </Card>,
    )
    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('supports aria-label', () => {
    render(
      <Card aria-label="Event card">
        <Card.Content>Test</Card.Content>
      </Card>,
    )
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Event card')
  })
})

describe('Card.Image', () => {
  it('renders an image with alt text', () => {
    render(
      <Card>
        <Card.Image src="/test.jpg" alt="Beach cleanup" />
      </Card>,
    )
    expect(screen.getByAltText('Beach cleanup')).toBeInTheDocument()
  })

  it('applies lazy loading', () => {
    render(
      <Card>
        <Card.Image src="/test.jpg" alt="Test" />
      </Card>,
    )
    expect(screen.getByAltText('Test')).toHaveAttribute('loading', 'lazy')
  })

  it('forwards focal point position to the rendered img object-position', () => {
    render(
      <Card>
        <Card.Image
          src="/test.jpg"
          alt="Focal"
          positionX={20}
          positionY={80}
        />
      </Card>,
    )
    const img = screen.getByAltText('Focal') as HTMLImageElement
    expect(img.style.objectPosition).toBe('20% 80%')
  })

  it('falls back to 50% 50% when focal point is null/undefined', () => {
    render(
      <Card>
        <Card.Image src="/test.jpg" alt="Default" />
      </Card>,
    )
    const img = screen.getByAltText('Default') as HTMLImageElement
    expect(img.style.objectPosition).toBe('50% 50%')
  })
})

describe('Card.Title', () => {
  it('renders h3 by default', () => {
    render(
      <Card>
        <Card.Content>
          <Card.Title>Beach Cleanup</Card.Title>
        </Card.Content>
      </Card>,
    )
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Beach Cleanup')
  })

  it('renders custom heading level', () => {
    render(
      <Card>
        <Card.Content>
          <Card.Title as="h2">Title</Card.Title>
        </Card.Content>
      </Card>,
    )
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })
})

describe('Card.Skeleton', () => {
  it('renders with loading status', () => {
    render(<Card.Skeleton />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading card')
  })

  it('renders without image when hasImage is false', () => {
    const { container } = render(<Card.Skeleton hasImage={false} />)
    const imageDiv = container.querySelector('[style*="aspectRatio"]')
    expect(imageDiv).toBeNull()
  })
})
