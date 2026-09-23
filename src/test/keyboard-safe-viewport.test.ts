import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/*
 * THE KEYBOARD DEAD ZONE GUARD.
 *
 * Reported 2026-09-23 by Matthew Steele through Co-Exist: he could not finish
 * signing up, because on the onboarding safety step the app "will not let me
 * scroll down" past the dietary and allergy fields.
 *
 * ROOT CAUSE, and it is a whole class rather than one screen. capacitor.config.ts
 * sets `Keyboard: { resize: 'none' }` deliberately, so iOS does NOT shrink the
 * WebView when the soft keyboard opens. `100dvh` keeps reporting the FULL screen
 * height while the visible area is the screen minus the keypad. Any root that
 * pins itself to 100dvh and owns an inner scroll container therefore ends up with
 * a scrollport taller than what the user can see, and the bottom --kb-height
 * pixels of it are unreachable: the content is scrolled to the very end, there is
 * no scroll remaining, and those pixels are still behind the keyboard.
 *
 * MEASURED on the deployed app at 393x852 with a 336px keypad, before the fix:
 * scrollport 778px, maxScroll 386, and at MAXIMUM scroll the safety step's
 * "Continue" sat at y=704 while the keyboard covered everything from y=516 down.
 * Both "Continue" and "I'll do this later" were untappable for as long as the
 * keyboard was open, so the step was a dead end and not a cosmetic annoyance.
 * After the fix, on the same page in the same session: scrollport 442px,
 * maxScroll 722, "Continue" at y=368.
 *
 * WHY A SOURCE-LEVEL GUARD AND NOT ONLY A RENDER TEST. Three of the four screen
 * roots in this app already subtracted --kb-height (app-shell, sign-up,
 * admin-layout). Onboarding was the single outlier, and it stayed wrong from the
 * day the safety step shipped (2026-08-30) until a real user was blocked by it.
 * Nothing mechanical was watching, so the next full-height screen someone writes
 * would reintroduce it the same silent way. jsdom cannot catch this (it has no
 * layout engine and computes no viewport), so the check has to read the source.
 *
 * THE RULE: a full-viewport height token (h-dvh / h-screen / h-[100dvh] / a raw
 * 100dvh height) on an element that ALSO clips (overflow-hidden) must subtract
 * --kb-height. Satisfy it with the `h-screen-kb` utility from globals.css, or
 * with an explicit `calc(100dvh - var(--kb-height, 0px))`.
 *
 * NOT covered on purpose: `min-h-dvh` (grows with content, no trapped scrollport),
 * decorative `sticky` backdrops that are pointer-events-none and hold no fields,
 * and breakpoint-prefixed desktop-only grid heights.
 */

const SRC = join(__dirname, '..')

/** A full-viewport height that pins a box to the screen. */
const FULL_HEIGHT = /(?<![\w-])(h-dvh|h-screen|h-\[100dvh\])(?![\w-])|height:\s*['"`]?100dvh/
/** Any form of keyboard compensation. */
const KB_AWARE = /h-screen-kb|--kb-height/
/** Clips, and therefore traps its inner scroll container. */
const CLIPS = /overflow-hidden/
/** Grows with content instead of pinning: not the shape this guard is about. */
const MIN_HEIGHT_ONLY = /min-h-(dvh|screen)/
/**
 * Decorative backdrop layers hold no focusable fields, so a trapped scrollport
 * under one cannot strand a control.
 *
 * Deliberately `pointer-events-none` ONLY, and deliberately matched against the
 * hit line rather than the surrounding window. `aria-hidden` was in this set for
 * one draft and it was a laundering hole big enough to drive the original bug
 * back through: a single decorative child anywhere nearby (`<ShieldCheck
 * aria-hidden />`, a progress dot) would have exempted a genuinely broken root,
 * and the safety step has exactly such an icon. All three real backdrops in this
 * app (page.tsx, home.tsx, shop/index.tsx) carry pointer-events-none on the same
 * line as their height, so nothing legitimate needs the looser test.
 */
const DECORATIVE = /pointer-events-none/
/** Desktop-only breakpoints never meet a soft keyboard. */
const DESKTOP_ONLY = /\b(sm|md|lg|xl|2xl):(h-dvh|h-screen)/

export interface Offender {
  file: string
  line: number
  text: string
}

/**
 * A JSX element's attributes routinely span several lines, so judging a single
 * line would miss `className="h-dvh ..."` on one line and `overflow-hidden` on
 * the next. Read a window around the hit instead: wide enough to hold one
 * element's attribute list, narrow enough not to borrow a sibling's classes.
 */
function windowAround(lines: string[], i: number, radius = 6): string {
  return lines.slice(Math.max(0, i - radius), Math.min(lines.length, i + radius + 1)).join('\n')
}

/**
 * Blank out every comment while preserving line count and column positions, so
 * the detector below judges only what actually renders.
 *
 * This is load-bearing and its own control caught it. Prose about --kb-height is
 * everywhere in this codebase, including in the comment that sits directly above
 * the very element this guard exists to protect. Matching the compensation token
 * inside a comment would let any file that DOCUMENTS the rule exempt itself from
 * obeying it, so a revert of the real fix would still read as green.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * THE single detector. Both the repo scan and the mutation controls below go
 * through this one function on purpose: a control that exercised its own private
 * copy would keep passing while the real scan rotted, which is the shape of a
 * test that agrees rather than checks.
 */
export function detect(source: string, file: string): Offender[] {
  const raw = source.split('\n')
  const code = stripComments(source).split('\n')
  const offenders: Offender[] = []
  code.forEach((line, i) => {
    if (!FULL_HEIGHT.test(line)) return
    if (MIN_HEIGHT_ONLY.test(line) && !/(?<![\w-])(h-dvh|h-screen)(?![\w-])/.test(line)) return
    if (DESKTOP_ONLY.test(line)) return
    const ctx = windowAround(code, i)
    if (!CLIPS.test(ctx)) return // no clip, no trapped scrollport
    if (DECORATIVE.test(line)) return // backdrop layer, holds no inputs (hit line only)
    if (KB_AWARE.test(ctx)) return // compensated, which is the point
    offenders.push({ file, line: i + 1, text: raw[i].trim().slice(0, 120) })
  })
  return offenders
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'test') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('keyboard-safe viewport: no clipping full-height root without --kb-height', () => {
  const files = walk(SRC)

  it('scans a real, non-trivial slice of the app', () => {
    // A guard that silently walked an empty tree would pass forever.
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith(join('pages', 'onboarding', 'onboarding.tsx')))).toBe(true)
  })

  it('finds no screen root that traps its scrollport behind the keyboard', () => {
    const offenders = files.flatMap((f) => detect(readFileSync(f, 'utf8'), relative(SRC, f)))
    const report = offenders.map((o) => `  ${o.file}:${o.line}  ${o.text}`).join('\n')
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `\nThese pin a box to the full viewport AND clip it, without subtracting\n` +
            `--kb-height. Under Keyboard.resize:'none' the bottom of the scrollport\n` +
            `sits behind the keypad and CANNOT be scrolled to, so any button there is\n` +
            `untappable while typing. Use the \`h-screen-kb\` utility (globals.css) or\n` +
            `height: calc(100dvh - var(--kb-height, 0px)).\n\n${report}\n`,
    ).toEqual([])
  })

  /*
   * MUTATION CONTROLS. A guard that never fires is indistinguishable from a guard
   * that agrees with everything. These feed the detector the exact shape the real
   * bug had, plus the shapes it must stay quiet on, so loosening the rules above
   * turns this file red instead of letting the suite pass on nothing.
   */
  it('CONTROL: catches the exact shape onboarding shipped with', () => {
    const broken = [
      'export default function Broken() {',
      '  return (',
      '    <div className="h-dvh flex flex-col bg-white overflow-hidden">',
      '      <div className="flex-1 relative overflow-hidden">',
      '        <div className="absolute inset-0 overflow-y-auto">{children}</div>',
      '      </div>',
      '    </div>',
      '  )',
      '}',
    ].join('\n')
    expect(detect(broken, 'broken.tsx')).toHaveLength(1)
  })

  it('CONTROL: accepts both sanctioned spellings of the fix', () => {
    const utility = '<div className="h-screen-kb flex flex-col overflow-hidden">'
    const explicit =
      '<div className="flex flex-col overflow-hidden" style={{ height:' +
      " 'calc(100dvh - var(--kb-height, 0px))' }}>"
    expect(detect(utility, 'a.tsx')).toHaveLength(0)
    expect(detect(explicit, 'b.tsx')).toHaveLength(0)
  })

  it('CONTROL: stays quiet on the shapes it deliberately excludes', () => {
    // min-h grows with content, so nothing is trapped.
    expect(detect('<div className="min-h-dvh flex flex-col overflow-hidden">', 'c.tsx')).toHaveLength(0)
    // decorative backdrop, no focusable field inside. This is the real shape
    // page.tsx, home.tsx and shop/index.tsx use: pointer-events-none sits on the
    // same line as the height.
    expect(
      detect(
        '<div className="pointer-events-none sticky top-0 h-[100dvh] -mb-[100dvh] overflow-hidden" />',
        'd.tsx',
      ),
    ).toHaveLength(0)
    // desktop-only grid height never meets a soft keyboard.
    expect(detect('<div className="grid lg:h-dvh overflow-hidden">', 'e.tsx')).toHaveLength(0)
    // pinned but NOT clipping: the document itself scrolls, nothing is trapped.
    expect(detect('<div className="h-dvh flex flex-col">', 'f.tsx')).toHaveLength(0)
  })

  it('CONTROL: a decorative CHILD does not launder a broken root', () => {
    // The hole this closes: judging `aria-hidden` / `pointer-events-none` over
    // the whole window meant one decorative icon near a broken root exempted it.
    // The safety step opens with exactly such an icon, so the guard would have
    // stayed silent on the very screen it was written for.
    const broken = [
      '<div className="h-dvh flex flex-col bg-white overflow-hidden">',
      '  <div className="flex-1 relative overflow-hidden">',
      '    <ShieldCheck aria-hidden className="w-7 h-7 text-neutral-400" />',
      '    <span className="pointer-events-none absolute inset-0" />',
      '    <input aria-label="Their name" />',
      '  </div>',
      '</div>',
    ].join('\n')
    expect(detect(broken, 'h.tsx')).toHaveLength(1)
  })

  it('CONTROL: a comment mentioning --kb-height does not launder a broken root', () => {
    // The compensation has to be in the markup. A nearby comment that merely
    // talks about --kb-height must not satisfy the guard, or any file that
    // documents this rule would exempt itself from it.
    const laundered = [
      '// height: calc(100dvh - var(--kb-height, 0px)) is what this SHOULD use',
      '<div className="h-dvh flex flex-col overflow-hidden">',
    ].join('\n')
    expect(detect(laundered, 'g.tsx')).toHaveLength(1)
  })
})
