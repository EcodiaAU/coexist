import { isNativePlatform } from '@/lib/native-share'

/**
 * Links and copying in chat (Fei Castillo, Hobart leader, relayed by Tate
 * 2026-09-27: "we can't copy the messages and the links don't really work").
 *
 * Messages rendered as one plain text node, so a pasted Google Maps pin or
 * Instagram link was dead text, and the body-wide `user-select: none` (native
 * app feel) meant it could not be selected to copy either. Measured on
 * production that day: 31 live text messages carried a URL (mostly
 * maps.app.goo.gl pins, plus Instagram, YouTube, SharePoint), and others
 * carried bare email addresses.
 *
 * This module is the pure half: split a message into text and link segments,
 * and decide where a tapped link should go. The React half is
 * src/components/linkified-text.tsx.
 */

export type ChatTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string; type: 'url' | 'email' }

/*
 * Candidate matcher, one alternation so the leftmost match wins:
 *   1. email address (listed first so `name@tasland.org.au` never splits
 *      into a name plus a bare-domain link)
 *   2. http(s) URL
 *   3. www. host
 *   4. bare domain on a conservative TLD list, optionally with a path
 *      ("tasland.org.au", "humanitix.com/event/x"). The list is short on
 *      purpose: "e.g.", "3.5", "v2.3.40" and "Node.js" must stay text.
 * No lookbehind anywhere: it is a SyntaxError on older iOS WebKit, and this
 * module loads with every chat. The "not glued to a word" check for bare
 * domains is done in code instead.
 */
const LINK_RE =
  /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})|(https?:\/\/[^\s<>"'‘’“”]+)|(www\.[^\s<>"'‘’“”]+)|((?:[A-Za-z0-9-]+\.)+(?:com|org|net|au|io|app|gov|edu|info|nz|uk|earth|dev)(?![A-Za-z0-9-])(?:\/[^\s<>"'‘’“”]*)?)/g

const TRAILING_PUNCT = /[.,!?:;'"*]$/
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' }

/** Drop sentence punctuation and unbalanced closing brackets off a URL's tail,
 *  so "see https://x.com/a)." links x.com/a but a Wikipedia "Foo_(bar)" keeps
 *  its paren. */
export function trimUrlTail(raw: string): string {
  let s = raw
  for (;;) {
    if (TRAILING_PUNCT.test(s)) {
      s = s.slice(0, -1)
      continue
    }
    const last = s.slice(-1)
    const open = PAIRS[last]
    if (open) {
      const opens = s.split(open).length - 1
      const closes = s.split(last).length - 1
      if (closes > opens) {
        s = s.slice(0, -1)
        continue
      }
    }
    return s
  }
}

/** Split message text into plain-text and link segments. Text round-trips:
 *  joining every segment's `text` reproduces the input exactly. */
export function linkifyText(input: string): ChatTextSegment[] {
  const out: ChatTextSegment[] = []
  if (!input) return out
  let cursor = 0
  const pushText = (text: string) => {
    if (!text) return
    const prev = out[out.length - 1]
    if (prev && prev.kind === 'text') prev.text += text
    else out.push({ kind: 'text', text })
  }

  LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LINK_RE.exec(input)) !== null) {
    const [whole, email, scheme, www, bare] = m
    const start = m.index

    if (bare) {
      // A bare domain glued to a word or path ("foo/bar.com", "x.y.com" tail
      // of something longer) is not a link.
      const before = start > 0 ? input[start - 1] : ''
      if (before && /[\w@./-]/.test(before)) continue
    }

    const text = email ? whole : trimUrlTail(whole)
    if (!text || (!email && !/[A-Za-z0-9]/.test(text.replace(/^https?:\/\//i, '')))) continue

    pushText(input.slice(cursor, start))
    if (email) {
      out.push({ kind: 'link', text, href: `mailto:${text}`, type: 'email' })
    } else if (scheme) {
      out.push({ kind: 'link', text, href: text, type: 'url' })
    } else if (www || bare) {
      out.push({ kind: 'link', text, href: `https://${text}`, type: 'url' })
    }
    cursor = start + text.length
    // Resume right after the trimmed link so trimmed punctuation stays text.
    LINK_RE.lastIndex = cursor
  }
  pushText(input.slice(cursor))
  return out
}

/** Does this message contain anything we would render as a link? */
export function hasLinks(input: string | null | undefined): boolean {
  return !!input && linkifyText(input).some((s) => s.kind === 'link')
}

/**
 * The value a "Copy link" action should put on the clipboard: the first link
 * in the message, with an email copied as the bare address (never "mailto:").
 */
export function firstCopyableLink(
  input: string | null | undefined,
): { value: string; type: 'url' | 'email' } | null {
  if (!input) return null
  for (const seg of linkifyText(input)) {
    if (seg.kind === 'link') {
      return { value: seg.type === 'email' ? seg.text : seg.href, type: seg.type }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Where a tapped link goes                                           */
/* ------------------------------------------------------------------ */

/** Hosts that serve this app. A link to one of them is opened IN the app via
 *  the router, never by navigating the webview, which would unload the SPA. */
export const APP_HOSTS = ['app.coexistaus.org', 'coexist-alpha.vercel.app'] as const

/**
 * Hosts matched by capacitor.config.ts `server.allowNavigation`. On Android a
 * webview navigation to one of these is allowed to load INSIDE the app shell
 * (Bridge.launchIntent only hands foreign hosts to the OS), so a member would
 * land on a web page with no way back. These open in the in-app browser.
 */
const WEBVIEW_CAPTURED_SUFFIXES = ['coexistaus.org', 'supabase.co', 'stripe.com']

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

export type ChatLinkTarget =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; url: string; inAppBrowser: boolean }
  | { kind: 'mail'; url: string }

/**
 * Classify a link href. `extraAppHosts` lets the web build treat its own
 * origin (a preview deploy) as internal too.
 */
export function resolveChatLink(href: string, extraAppHosts: string[] = []): ChatLinkTarget {
  if (/^mailto:/i.test(href)) return { kind: 'mail', url: href }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { kind: 'external', url: href, inAppBrowser: false }
  }
  const host = url.hostname.toLowerCase()

  if ((APP_HOSTS as readonly string[]).includes(host) || extraAppHosts.includes(host)) {
    let path = url.pathname || '/'
    // /event/:id is the public page for people without the app. A member
    // tapping it inside the app wants the full event page.
    const publicEvent = /^\/event\/([^/]+)\/?$/.exec(path)
    if (publicEvent) path = `/events/${publicEvent[1]}`
    return { kind: 'internal', path: `${path}${url.search}${url.hash}` }
  }

  const inAppBrowser = WEBVIEW_CAPTURED_SUFFIXES.some((s) => hostMatchesSuffix(host, s))
  return { kind: 'external', url: url.toString(), inAppBrowser }
}

/**
 * Open a non-internal link.
 *
 * Native: `window.open` is intercepted by Capacitor and handed to the OS
 * (iOS WebViewDelegationHandler createWebViewWith -> UIApplication.open, so a
 * Maps / Instagram / YouTube link opens that app; Android Bridge.launchIntent
 * -> ACTION_VIEW). Hosts the webview would capture use the in-app browser
 * instead. Web: a new tab.
 */
export async function openExternalChatLink(target: Exclude<ChatLinkTarget, { kind: 'internal' }>): Promise<void> {
  const native = isNativePlatform()
  if (target.kind === 'mail') {
    if (native) window.open(target.url, '_system')
    else window.location.href = target.url
    return
  }
  if (native && target.inAppBrowser) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: target.url })
      return
    } catch {
      /* plugin unavailable: fall through to the OS hand-off */
    }
  }
  if (native) {
    window.open(target.url, '_system')
    return
  }
  window.open(target.url, '_blank', 'noopener,noreferrer')
}

/* ------------------------------------------------------------------ */
/*  Copy eligibility                                                   */
/* ------------------------------------------------------------------ */

/** Message types whose `content` is the words a member typed. Generated
 *  types (poll, announcement, carpool, html, system) store markup or a title
 *  there, which is not what "Copy text" promises. */
const COPYABLE_TYPES = new Set(['text', 'image'])

export function canCopyMessage(msg: {
  content?: string | null
  is_deleted?: boolean | null
  message_type?: string | null
} | null | undefined): boolean {
  if (!msg || msg.is_deleted) return false
  if (!msg.content || !msg.content.trim()) return false
  return msg.message_type == null || COPYABLE_TYPES.has(msg.message_type)
}
