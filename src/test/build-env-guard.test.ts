/**
 * OTA 2.3.35 (2026-09-18) was built in a git worktree with no .env.production,
 * so vite inlined VITE_SUPABASE_URL as undefined, left the index.html
 * placeholders literal, exited 0, and every device that took the bundle crashed
 * on open with "supabaseUrl is required". vite.config.ts now calls these at
 * build time. Each refusal below asserts WHICH problem was found, so a guard
 * that refuses for the wrong reason cannot pass by luck.
 */

import { describe, it, expect } from 'vitest'
import { buildEnvProblems, findUnreplacedPlaceholders } from '@/lib/build-env-guard'

const GOOD = {
  VITE_SUPABASE_URL: 'https://tjutlbzekfouwsiaplbr.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-key',
  MODE: 'production',
}

describe('buildEnvProblems', () => {
  it('a production env with both values passes (the control: the guard is not a blanket refusal)', () => {
    expect(buildEnvProblems(GOOD)).toEqual([])
  })

  it('the 2.3.35 shape: neither variable present', () => {
    expect(buildEnvProblems({ MODE: 'production' })).toEqual([
      'VITE_SUPABASE_URL is not set',
      'VITE_SUPABASE_ANON_KEY is not set',
    ])
  })

  it('a URL with no key is still refused, and only for the key', () => {
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_ANON_KEY: '' })).toEqual([
      'VITE_SUPABASE_ANON_KEY is not set',
    ])
  })

  it('a whitespace-only value counts as unset', () => {
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_URL: '   ' })).toEqual([
      'VITE_SUPABASE_URL is not set',
    ])
  })

  it('a literal placeholder passed through as the value is refused as a placeholder', () => {
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_URL: '%VITE_SUPABASE_URL%' })).toEqual([
      'VITE_SUPABASE_URL is a placeholder, not a value',
    ])
  })

  it('a URL that is not https is refused for that reason', () => {
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_URL: 'tjutlbzekfouwsiaplbr.supabase.co' })).toEqual([
      'VITE_SUPABASE_URL is not an https URL',
    ])
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_URL: 'http://tjutlbzekfouwsiaplbr.supabase.co' })).toEqual([
      'VITE_SUPABASE_URL is not an https URL',
    ])
  })

  it('the string "undefined" (a stringified missing value) is refused', () => {
    expect(buildEnvProblems({ ...GOOD, VITE_SUPABASE_URL: 'undefined' })).toEqual([
      'VITE_SUPABASE_URL is not an https URL',
    ])
  })
})

describe('findUnreplacedPlaceholders', () => {
  it('finds the exact tokens the 2.3.35 index.html shipped', () => {
    const html = "url: '%VITE_SUPABASE_URL%', keyPrefix: '%VITE_SUPABASE_ANON_KEY%'.slice(0, 24)"
    expect(findUnreplacedPlaceholders(html)).toEqual(['%VITE_SUPABASE_URL%', '%VITE_SUPABASE_ANON_KEY%'])
  })

  it('reports each token once', () => {
    expect(findUnreplacedPlaceholders('%VITE_A% %VITE_A%')).toEqual(['%VITE_A%'])
  })

  it('a correctly built file has none, and non-VITE percent text is not a hit', () => {
    const built = "url: 'https://tjutlbzekfouwsiaplbr.supabase.co', mode: 'production', width: '100%'"
    expect(findUnreplacedPlaceholders(built)).toEqual([])
    expect(findUnreplacedPlaceholders('%MODE% 50% %vite_lower%')).toEqual([])
  })
})
