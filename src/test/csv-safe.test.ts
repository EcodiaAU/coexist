import { describe, it, expect } from 'vitest'
import { neutralizeCsvFormula, escapeCsvCell } from '@/lib/csv-safe'

describe('neutralizeCsvFormula', () => {
  it('apostrophe-prefixes leading formula triggers', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      const payload = `${lead}HYPERLINK("http://evil")`
      expect(neutralizeCsvFormula(payload)).toBe(`'${payload}`)
    }
  })

  it('leaves benign values untouched', () => {
    expect(neutralizeCsvFormula('Rebecca')).toBe('Rebecca')
    expect(neutralizeCsvFormula('12 Smith St')).toBe('12 Smith St')
    expect(neutralizeCsvFormula('a=b')).toBe('a=b') // trigger only at position 0
    expect(neutralizeCsvFormula('')).toBe('')
  })
})

describe('escapeCsvCell', () => {
  it('quotes cells containing quote/comma/newline', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralises then quotes a formula payload', () => {
    // leading - triggers neutralisation; the resulting "'-..." has no quote/comma
    expect(escapeCsvCell('-2+3')).toBe("'-2+3")
    // formula payload with a comma gets both guards
    expect(escapeCsvCell('=SUM(A1,A2)')).toBe(`"'=SUM(A1,A2)"`)
  })

  it('handles null/undefined/number', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
    expect(escapeCsvCell(42)).toBe('42')
  })
})
