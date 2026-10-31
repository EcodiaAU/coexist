import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LinkifiedText } from '@/components/linkified-text'

/*
 * Tappable links in an event's "Good to know" card (Tate, iMessage
 * 2026-10-31: "Make links in the 'good to know' section of the coexist app
 * event serial page clickable").
 *
 * Leaders paste Google Maps pins into the meeting point and festival info
 * pages into what to bring, and the card rendered them as dead text. The
 * fixtures below are real event_extras values read from production that day
 * (Edward's Point Bush Regen, Merri Mornings, Beyond The Valley).
 */

const native = vi.hoisted(() => ({ value: false }))
vi.mock('@/lib/native-share', async (orig) => ({
  ...(await orig<typeof import('@/lib/native-share')>()),
  isNativePlatform: () => native.value,
}))

const renderText = (text: string) =>
  render(
    <MemoryRouter initialEntries={['/events/abc']}>
      <LinkifiedText text={text} className="text-sm font-medium text-neutral-700" />
    </MemoryRouter>,
  )

describe('Good to know text renders its links', () => {
  let openSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    native.value = false
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })
  afterEach(() => openSpy.mockRestore())

  it('a maps pin after the place name becomes a link, the words stay text', () => {
    renderText('End of Dune Street https://maps.app.goo.gl/AJybLfZJFkkLTq5a8?g_st=ic')
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('https://maps.app.goo.gl/AJybLfZJFkkLTq5a8?g_st=ic')
    expect(a.closest('p')?.textContent).toBe('End of Dune Street https://maps.app.goo.gl/AJybLfZJFkkLTq5a8?g_st=ic')
    // keeps the card's text style on the paragraph and the app's link style on the anchor
    expect(a.closest('p')?.className).toBe('text-sm font-medium text-neutral-700')
    expect(a.className).toContain('underline')
    expect(a.className).toContain('text-primary-800')
  })

  it('a bare domain with a path links, and the full stop after it stays text', () => {
    renderText('Check the list before you go:\nbeyondthevalley.com.au/information.\n\nBasic List:')
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('https://beyondthevalley.com.au/information')
    expect(a.textContent).toBe('beyondthevalley.com.au/information')
  })

  it('plain text with no link renders no anchor', () => {
    renderText('Drink bottle and gardening gloves (if you have them)')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('on the web a tap opens a new tab', () => {
    renderText('https://maps.app.goo.gl/botj9p84RC8hHkLM8')
    fireEvent.click(screen.getByRole('link'))
    expect(openSpy).toHaveBeenCalledWith('https://maps.app.goo.gl/botj9p84RC8hHkLM8', '_blank', 'noopener,noreferrer')
  })

  it('in the native app a tap hands the link to the OS so the webview never navigates away', () => {
    native.value = true
    renderText('https://maps.app.goo.gl/botj9p84RC8hHkLM8')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(screen.getByRole('link'), click)
    expect(click.defaultPrevented).toBe(true)
    expect(openSpy).toHaveBeenCalledWith('https://maps.app.goo.gl/botj9p84RC8hHkLM8', '_system')
  })
})

describe('wiring', () => {
  const src = readFileSync(resolve(__dirname, '..', 'pages/events/event-detail.tsx'), 'utf8')
  const card = src.slice(src.indexOf('>Good to know</h3>'), src.indexOf('Capacity section'))

  it('the event page Good to know card renders each free-text field through LinkifiedText', () => {
    expect(card.length).toBeGreaterThan(0)
    for (const field of ['meeting_point', 'what_to_bring', 'what_to_wear']) {
      expect(card).toContain(`<LinkifiedText text={ext.${field}} className="text-sm font-medium text-neutral-700" />`)
      expect(card).not.toContain(`{ext.${field}}</p>`)
    }
  })
})
