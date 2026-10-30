import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'

// The slight-3D treatment (Tate, 2026-10-31) is HOMEPAGE ONLY for now. Vite
// loads home-3d.css globally once the home chunk has been imported, so the
// only thing keeping it off every other page is that each selector is rooted
// at .home-3d, which only HomePage sets, and that no other file uses the
// h3d-* classes. These guards fail if either assumption breaks.

const root = resolve(__dirname, '../..')
const src = resolve(root, 'src')
const css = readFileSync(resolve(src, 'pages/home-3d.css'), 'utf8')

function selectors(text: string): string[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  const re = /([^{}]+)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(noComments))) {
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

describe('homepage 3D treatment stays on the homepage', () => {
  it('roots every selector in home-3d.css at .home-3d', () => {
    const sels = selectors(css)
    expect(sels.length).toBeGreaterThan(5)
    const unscoped = sels.filter((s) => !/^\.home-3d(\s|$)/.test(s))
    expect(unscoped).toEqual([])
  })

  it('is set on the HomePage root and the stylesheet is imported there', () => {
    const home = readFileSync(resolve(src, 'pages/home.tsx'), 'utf8')
    expect(home).toMatch(/<Page[^>]*className="[^"]*\bhome-3d\b/)
    expect(home).toContain("import './home-3d.css'")
  })

  it('uses the h3d-* classes and the .home-3d root nowhere else in src', () => {
    const allowed = new Set(['pages/home.tsx', 'pages/home-3d.css', 'test/home-3d-scope.test.ts'])
    const offenders = walk(src)
      .filter((p) => /\.(tsx?|css)$/.test(p))
      .map((p) => relative(src, p))
      .filter((rel) => !allowed.has(rel))
      .filter((rel) => /\bh3d-|\bhome-3d\b/.test(readFileSync(resolve(src, rel), 'utf8')))
    expect(offenders).toEqual([])
  })
})
