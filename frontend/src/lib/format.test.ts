import { describe, expect, it } from 'vitest'
import { formatPercent, formatTimestamp } from './format'

describe('formatTimestamp', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTimestamp(4)).toBe('0:04')
    expect(formatTimestamp(65.4)).toBe('1:05')
  })
})

describe('formatPercent', () => {
  it('formats fractions', () => {
    expect(formatPercent(0.75)).toBe('75%')
    expect(formatPercent(null)).toBe('—')
  })
})
