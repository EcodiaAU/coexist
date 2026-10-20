import { describe, it, expect, afterEach } from 'vitest'
import {
  NATIVE_TABS,
  activeNativeTabKey,
  formatNativeBadge,
  iosMajorVersion,
  isBlockingOverlayOpen,
  nativeBuildNumber,
  NATIVE_TAB_BAR_MIN_NATIVE_BUILD,
  isNativeTabActive,
  shouldUseNativeTabBar,
  type NativeTabBarEnv,
} from '@/lib/native-tab-bar'

const iphone26: NativeTabBarEnv = {
  enabled: true,
  platform: 'ios',
  hasNavigationPlugin: true,
  hasDevicePlugin: true,
  osVersion: '26.5',
  model: 'iPhone17,1',
  nativeBuild: '97',
  reduceTransparency: false,
}

describe('shouldUseNativeTabBar', () => {
  it('uses the native glass bar on an iPhone on iOS 26 with both plugins', () => {
    expect(shouldUseNativeTabBar(iphone26)).toBe(true)
  })

  it('keeps the web bar when the kill switch is off', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, enabled: false })).toBe(false)
  })

  it('keeps the web bar on Android and the web', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, platform: 'android' })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, platform: 'web' })).toBe(false)
  })

  it('keeps the web bar on a store build without the plugin (the 2.2.9 binary running a newer OTA)', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, hasNavigationPlugin: false })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, hasDevicePlugin: false })).toBe(false)
  })

  it('keeps the web bar below iOS 26, where there is no Liquid Glass', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, osVersion: '18.6' })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, osVersion: '25.9' })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, osVersion: '27.0' })).toBe(true)
  })

  it('keeps the web bar on iPad, where iPadOS moves a system tab bar to the top', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, model: 'iPad16,3' })).toBe(false)
  })

  it('keeps the web bar on store build 96 (2.3.56), which drew the black strip, whatever OTA it runs', () => {
    expect(NATIVE_TAB_BAR_MIN_NATIVE_BUILD).toBe(97)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: '96' })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: 96 })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: '97' })).toBe(true)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: '120' })).toBe(true)
  })

  it('keeps the web bar under Reduce Transparency, where iOS draws the bar opaque over a black host', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, reduceTransparency: true })).toBe(false)
  })

  it('fails closed when Reduce Transparency or the build cannot be read', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, reduceTransparency: null })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: null })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, nativeBuild: '' })).toBe(false)
  })

  it('fails closed on an unreadable version or model', () => {
    expect(shouldUseNativeTabBar({ ...iphone26, osVersion: '' })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, osVersion: null })).toBe(false)
    expect(shouldUseNativeTabBar({ ...iphone26, model: undefined })).toBe(false)
  })
})

describe('nativeBuildNumber', () => {
  it('reads CFBundleVersion as an integer', () => {
    expect(nativeBuildNumber('97')).toBe(97)
    expect(nativeBuildNumber(97)).toBe(97)
    expect(nativeBuildNumber('garbage')).toBe(0)
    expect(nativeBuildNumber(undefined)).toBe(0)
  })
})

describe('iosMajorVersion', () => {
  it('reads the leading integer', () => {
    expect(iosMajorVersion('26.0.1')).toBe(26)
    expect(iosMajorVersion('18')).toBe(18)
    expect(iosMajorVersion('garbage')).toBe(0)
  })
})

describe('tab selection mirrors the web BottomTabBar', () => {
  it('matches Home exactly and the rest by prefix', () => {
    expect(activeNativeTabKey('/')).toBe('home')
    expect(activeNativeTabKey('/chat')).toBe('chat')
    expect(activeNativeTabKey('/chat/abc')).toBe('chat')
    expect(activeNativeTabKey('/profile/donations')).toBe('profile')
  })

  it('selects no tab for a route outside every tab, and never More', () => {
    expect(activeNativeTabKey('/events/123')).toBeNull()
    expect(activeNativeTabKey('/more')).toBeNull()
    const more = NATIVE_TABS.find((t) => t.key === 'more')!
    expect(isNativeTabActive(more, '/more')).toBe(false)
  })

  it('carries the same four tabs, in order, as the web bar', () => {
    expect(NATIVE_TABS.map((t) => t.key)).toEqual(['home', 'chat', 'profile', 'more'])
    expect(NATIVE_TABS.every((t) => t.sfSymbol && t.sfSymbolSelected)).toBe(true)
  })
})

describe('formatNativeBadge', () => {
  it('hides a zero badge and caps at 99+', () => {
    expect(formatNativeBadge(0)).toBeUndefined()
    expect(formatNativeBadge(-1)).toBeUndefined()
    expect(formatNativeBadge(7)).toBe('7')
    expect(formatNativeBadge(150)).toBe('99+')
  })
})

describe('isBlockingOverlayOpen', () => {
  afterEach(() => { document.body.innerHTML = '' })

  // jsdom lays nothing out, so getClientRects() is empty; stub it for elements that are "shown".
  function shown<T extends HTMLElement>(el: T): T {
    el.getClientRects = () => ({ length: 1, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
    return el
  }

  it('is false on a plain page', () => {
    document.body.innerHTML = '<main><p>hi</p></main>'
    expect(isBlockingOverlayOpen(document)).toBe(false)
  })

  it('is true while a modal sheet or the More sidebar is open', () => {
    const sheet = shown(document.createElement('div'))
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    document.body.appendChild(sheet)
    expect(isBlockingOverlayOpen(document)).toBe(true)
  })

  it('ignores a dialog that is mounted but not displayed', () => {
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    document.body.appendChild(sheet)
    expect(isBlockingOverlayOpen(document)).toBe(false)
  })

  it('ignores a non-modal popover (aria-modal="false", the user card)', () => {
    const card = shown(document.createElement('div'))
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'false')
    document.body.appendChild(card)
    expect(isBlockingOverlayOpen(document)).toBe(false)
  })

  it('counts a full-screen fixed layer that takes input, not a decorative one', () => {
    const layer = document.createElement('div')
    layer.className = 'fixed inset-0'
    layer.style.zIndex = '60'
    document.body.appendChild(layer)
    expect(isBlockingOverlayOpen(document)).toBe(true)

    layer.className = 'fixed inset-0 pointer-events-none'
    expect(isBlockingOverlayOpen(document)).toBe(false)

    layer.className = 'fixed inset-0'
    layer.style.zIndex = '10'
    expect(isBlockingOverlayOpen(document)).toBe(false)
  })
})

describe('setNativeTabBarSpace', () => {
  it('zeroes the web bar clearance while the glass bar shows and restores it after', async () => {
    const { setNativeTabBarSpace, TAB_BAR_SPACE_VAR } = await import('@/lib/native-tab-bar')
    const root = document.createElement('div')
    setNativeTabBarSpace(true, root)
    expect(root.style.getPropertyValue(TAB_BAR_SPACE_VAR)).toBe('0px')
    setNativeTabBarSpace(false, root)
    expect(root.style.getPropertyValue(TAB_BAR_SPACE_VAR)).toBe('')
  })
})
