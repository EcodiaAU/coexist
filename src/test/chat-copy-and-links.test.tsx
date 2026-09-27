import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import {
  canCopyMessage,
  firstCopyableLink,
  hasLinks,
  linkifyText,
  resolveChatLink,
  trimUrlTail,
} from '@/lib/chat-links'
import { copyText } from '@/lib/clipboard'
import { LinkifiedText } from '@/components/linkified-text'

/*
 * Copying and links in chat (Fei Castillo, Hobart leader, relayed by Tate
 * 2026-09-27: "we can't copy the messages and the links don't really work").
 *
 * Before: every chat message rendered as one plain text node, so a pasted
 * Google Maps pin was dead text, and the body-wide `user-select: none` meant it
 * could not be selected either. The long-press sheet had no Copy row. The URL
 * fixtures below are real shapes from production chat on 2026-09-27.
 */

const links = (s: string) => linkifyText(s).filter((x) => x.kind === 'link')
const joined = (s: string) => linkifyText(s).map((x) => x.text).join('')

describe('linkifyText', () => {
  it('links the URL shapes members actually paste', () => {
    for (const url of [
      'https://maps.app.goo.gl/aKkfLrCQCSd55grPA?g_st=ic',
      'https://www.instagram.com/reel/DYi10GzMWqf/?stkn=MXFmcmtiaW1xYWNsMg==',
      'https://youtu.be/AU5e90uGo5A',
      'https://ig.me/j/AbZoPjaoyQI8vdbY/',
      'https://feelgoodfoodie.net/recipe/tahini-cookies/#wprm-recipe-container-16152',
      'https://coexistau-my.sharepoint.com/:f:/g/personal/ceo_coexistaus_org/IgAxi76QLPkkRoaPSLnmJPCSAfg3D4J9nPYCzZwBRdb2QFI?e=Vx8RE0',
    ]) {
      const found = links(`meet here ${url} thanks`)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ text: url, href: url, type: 'url' })
    }
  })

  it('links an email address as mailto, whole, never as a bare domain', () => {
    const found = links('reach Georgie on Gcummings@tasland.org.au for anything')
    expect(found).toEqual([
      { kind: 'link', text: 'Gcummings@tasland.org.au', href: 'mailto:Gcummings@tasland.org.au', type: 'email' },
    ])
    expect(links('email me at x.y@gmail.com.')[0]).toMatchObject({ text: 'x.y@gmail.com' })
  })

  it('links www. and bare domains with https', () => {
    expect(links('see www.coexistaus.org today')[0]).toMatchObject({
      text: 'www.coexistaus.org',
      href: 'https://www.coexistaus.org',
    })
    expect(links('tickets at humanitix.com/event/riverfest ok')[0]).toMatchObject({
      text: 'humanitix.com/event/riverfest',
      href: 'https://humanitix.com/event/riverfest',
    })
    expect(links('tasland.org.au')[0]).toMatchObject({ href: 'https://tasland.org.au' })
  })

  it('leaves ordinary text alone', () => {
    for (const s of [
      'e.g. bring gloves',
      'i.e. the usual spot',
      'about 3.5 hours',
      'on v2.3.40 now',
      'Node.js and St.Kilda',
      'ends at 5.30pm.',
      'wow...great',
      '@Fei Castillo see you there',
      // a bare domain glued to a word or path is part of something else
      'saved in folder/notes.com',
      'the my_site.org file',
    ]) {
      expect(hasLinks(s), s).toBe(false)
    }
  })

  it('trims sentence punctuation and unbalanced brackets off the tail', () => {
    expect(links('go to https://share.google/YaRbQkxLbuK33gVUd:')[0].text).toBe(
      'https://share.google/YaRbQkxLbuK33gVUd',
    )
    expect(links('(map: https://maps.app.goo.gl/abc).')[0].text).toBe('https://maps.app.goo.gl/abc')
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar) ok')[0].text).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    )
    expect(trimUrlTail('https://x.com/a!?')).toBe('https://x.com/a')
  })

  it('round-trips the text exactly, including newlines and emoji', () => {
    for (const s of [
      'Hi all 😊\nPin: https://maps.app.goo.gl/x?g_st=ic.\n\nemail a@b.org, cheers!',
      '',
      'no links here',
      'https://a.com https://b.com',
    ]) {
      expect(joined(s)).toBe(s)
    }
  })

  it('finds several links in one message', () => {
    expect(links('https://a.com and b@c.org and www.d.org').map((l) => l.href)).toEqual([
      'https://a.com',
      'mailto:b@c.org',
      'https://www.d.org',
    ])
  })
})

describe('resolveChatLink', () => {
  it('routes our own app links in-app, keeping query and hash', () => {
    expect(resolveChatLink('https://app.coexistaus.org/events/abc?tab=1#x')).toEqual({
      kind: 'internal',
      path: '/events/abc?tab=1#x',
    })
  })

  it('sends a shared public event link to the member event page', () => {
    expect(resolveChatLink('https://app.coexistaus.org/event/abc')).toEqual({
      kind: 'internal',
      path: '/events/abc',
    })
  })

  it('treats the current web host as ours when asked', () => {
    expect(resolveChatLink('https://preview-123.vercel.app/chat', ['preview-123.vercel.app'])).toEqual({
      kind: 'internal',
      path: '/chat',
    })
  })

  it('opens hosts the Android webview would capture in the in-app browser', () => {
    // capacitor.config.ts allowNavigation: *.coexistaus.org, *.supabase.co, *.stripe.com
    for (const href of [
      'https://www.coexistaus.org/about',
      'https://coexistaus.org',
      'https://checkout.stripe.com/pay/x',
      'https://abc.supabase.co/storage/v1/x',
    ]) {
      expect(resolveChatLink(href), href).toMatchObject({ kind: 'external', inAppBrowser: true })
    }
  })

  it('hands everything else to the OS', () => {
    expect(resolveChatLink('https://maps.app.goo.gl/abc')).toMatchObject({
      kind: 'external',
      inAppBrowser: false,
    })
    // a lookalike suffix is not our host
    expect(resolveChatLink('https://notcoexistaus.org/x')).toMatchObject({ inAppBrowser: false })
  })

  it('keeps mailto as mail', () => {
    expect(resolveChatLink('mailto:a@b.org')).toEqual({ kind: 'mail', url: 'mailto:a@b.org' })
  })
})

describe('copy eligibility', () => {
  const base = { content: 'see you at 9', is_deleted: false, message_type: 'text' }

  it('copies typed text and image captions', () => {
    expect(canCopyMessage(base)).toBe(true)
    expect(canCopyMessage({ ...base, message_type: 'image' })).toBe(true)
    expect(canCopyMessage({ ...base, message_type: null })).toBe(true)
  })

  it('refuses deleted, empty and generated messages', () => {
    expect(canCopyMessage(null)).toBe(false)
    expect(canCopyMessage({ ...base, is_deleted: true })).toBe(false)
    expect(canCopyMessage({ ...base, content: '   ' })).toBe(false)
    expect(canCopyMessage({ ...base, content: null })).toBe(false)
    for (const t of ['poll', 'announcement', 'system', 'html', 'carpool', 'event_survey']) {
      expect(canCopyMessage({ ...base, message_type: t }), t).toBe(false)
    }
  })

  it('offers the first link, and an email as the bare address', () => {
    expect(firstCopyableLink('pin https://maps.app.goo.gl/x. or a@b.org')).toEqual({
      value: 'https://maps.app.goo.gl/x',
      type: 'url',
    })
    expect(firstCopyableLink('write to a@b.org')).toEqual({ value: 'a@b.org', type: 'email' })
    expect(firstCopyableLink('no links')).toBeNull()
  })
})

describe('copyText', () => {
  const original = navigator.clipboard
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
    vi.restoreAllMocks()
  })

  it('uses the async clipboard when it exists', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when the async clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await expect(copyText('hello')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('falls back when the async clipboard rejects, and reports a total failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    await expect(copyText('hello')).resolves.toBe(false)
  })
})

describe('LinkifiedText', () => {
  function Where() {
    return <span data-testid="where">{useLocation().pathname}</span>
  }
  const renderAt = (text: string) =>
    render(
      <MemoryRouter initialEntries={['/chat/room']}>
        <Routes>
          <Route path="*" element={<><LinkifiedText text={text} /><Where /></>} />
        </Routes>
      </MemoryRouter>,
    )

  let openSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })
  afterEach(() => openSpy.mockRestore())

  it('renders links as anchors inside the text', () => {
    renderAt('pin: https://maps.app.goo.gl/x ok')
    const a = screen.getByTestId('chat-link')
    expect(a.getAttribute('href')).toBe('https://maps.app.goo.gl/x')
    expect(a.closest('p')?.textContent).toBe('pin: https://maps.app.goo.gl/x ok')
  })

  it('routes an app link in-app instead of letting the webview follow it', () => {
    renderAt('come to https://app.coexistaus.org/event/abc')
    const a = screen.getByTestId('chat-link')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(a, click)
    expect(click.defaultPrevented).toBe(true)
    expect(screen.getByTestId('where').textContent).toBe('/events/abc')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('opens a foreign link in a new tab on the web and swallows the bubble tap', () => {
    const onRowClick = vi.fn()
    render(
      <MemoryRouter>
        <div onClick={onRowClick}>
          <LinkifiedText text="https://maps.app.goo.gl/x" />
        </div>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('chat-link'))
    expect(openSpy).toHaveBeenCalledWith('https://maps.app.goo.gl/x', '_blank', 'noopener,noreferrer')
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('wiring', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

  it('chat bubbles and announcement bodies render through LinkifiedText', () => {
    const src = read('components/chat-bubble.tsx')
    expect(src).toMatch(/<LinkifiedText[^>]*\n\s*text=\{message\}/)
    expect(src).toMatch(/<LinkifiedText[^>]*text=\{body\}/)
  })

  it('the actions sheet offers Copy, gated by canCopyMessage', () => {
    expect(read('components/message-actions-sheet.tsx')).toContain('Copy text')
    const room = read('pages/chat/chat-room.tsx')
    expect(room).toContain('onCopy={canCopyMessage(selectedMessage) ? handleCopy : undefined}')
    expect(room).toContain('onCopyLink={selectedLink ? handleCopyLink : undefined}')
  })

  it('no lookbehind in the link matcher (a SyntaxError on older iOS WebKit)', () => {
    expect(read('lib/chat-links.ts')).not.toMatch(/\(\?<[=!]/)
  })
})
