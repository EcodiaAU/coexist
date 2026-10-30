import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'

// The 3D depth system (Tate, 2026-10-31: the homepage treatment, then "THE
// WHOLE APP"). One stylesheet holds every recipe, shared components attach the
// classes at their source, and the app's own shadow tokens carry the ambient
// tier. These guards fail if the system forks, leaks onto untagged elements,
// or loses the pieces that make focus rings and tinted shadows still work.

const root = resolve(__dirname, '../..')
const src = resolve(root, 'src')
const read = (rel: string) => readFileSync(resolve(src, rel), 'utf8')
const depthCss = read('styles/depth.css')
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')

function selectors(text: string): string[] {
  const out: string[] = []
  const re = /([^{}]+)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripComments(text)))) {
    for (const s of m[1].split(',')) {
      const sel = s.trim()
      if (sel && !sel.startsWith('@')) out.push(sel)
    }
  }
  return out
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = resolve(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('3D depth system', () => {
  it('only restyles elements that opted in with a d3-* class', () => {
    const sels = selectors(depthCss)
    expect(sels.length).toBeGreaterThan(10)
    const stray = sels.filter((s) => s !== ':root' && !/^\.d3-[a-z]+/.test(s))
    expect(stray).toEqual([])
  })

  it('keeps every recipe in depth.css: no other stylesheet defines a d3- rule', () => {
    const forks = walk(src)
      .filter((p) => p.endsWith('.css'))
      .map((p) => relative(src, p))
      .filter((rel) => rel !== 'styles/depth.css')
      .filter((rel) => /\.d3-[a-z]/.test(stripComments(read(rel))))
    expect(forks).toEqual([])
  })

  it('reads ring shadows per element, never through an inherited custom property', () => {
    // A custom property resolves its var() where it is declared, so a ring var
    // set on an ancestor would freeze an empty ring onto every child.
    const decls = stripComments(depthCss).match(/--[a-z0-9-]+\s*:[^;]*;/g) ?? []
    expect(decls.filter((d) => d.includes('--tw-ring'))).toEqual([])
    // and every raised recipe still starts with the ring shadows
    const blocks = stripComments(depthCss).match(/\.d3-[^{]+\{[^}]*box-shadow:[^;]*;/g) ?? []
    const shadowBlocks = blocks.filter((b) => !b.includes('::after'))
    expect(shadowBlocks.length).toBeGreaterThan(8)
    for (const b of shadowBlocks) expect(b).toMatch(/box-shadow:\s*var\(--tw-ring-offset-shadow/)
  })

  it('loads depth.css after globals.css so it outranks the layered utilities', () => {
    const main = read('main.tsx')
    const g = main.indexOf("import './styles/globals.css'")
    const d = main.indexOf("import './styles/depth.css'")
    expect(g).toBeGreaterThan(-1)
    expect(d).toBeGreaterThan(g)
  })

  it('tints the ambient shadow tokens olive and keeps white out of them', () => {
    const globals = read('styles/globals.css')
    for (const t of ['sm', 'md', 'lg']) {
      const m = globals.match(new RegExp(`--shadow-${t}:([^;]+);`))
      expect(m, `--shadow-${t}`).not.toBeNull()
      expect(m![1]).toContain('rgb(24 32 16')
      // Tailwind routes every colour here through --tw-shadow-color, so a
      // white highlight would be recoloured by a shadow-<colour> utility.
      expect(m![1]).not.toMatch(/255\s+255\s+255|#fff|white/i)
    }
  })

  it('attaches the raised tier at the source of the shared components', () => {
    const expectations: Array<[string, RegExp]> = [
      ['components/card.tsx', /depthClass\[depth \?\? cardGround\(children\)\]/],
      ['components/button.tsx', /primary: 'd3-button'/],
      ['components/stat-card.tsx', /d3-surface d3-light/],
      ['components/bento-stats.tsx', /d3-surface d3-light/],
      ['components/input.tsx', /d3-well d3-light/],
      ['components/search-bar.tsx', /d3-well d3-light/],
      ['components/segmented-control.tsx', /d3-chip/],
      ['components/toggle.tsx', /d3-well d3-light/],
      ['components/modal.tsx', /d3-sheet/],
      ['components/bottom-sheet.tsx', /d3-sheet/],
      ['components/bottom-tab-bar.tsx', /d3-float/],
    ]
    const missing = expectations.filter(([f, re]) => !re.test(read(f))).map(([f]) => f)
    expect(missing).toEqual([])
  })

  it('keeps ghost buttons flat', () => {
    const button = read('components/button.tsx')
    const map = button.match(/const variantShadow[^}]+\}/)![0]
    expect(map).not.toMatch(/ghost/)
  })
})
