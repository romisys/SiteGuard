import { describe, expect, it } from 'vitest'
import { findingEdge } from '../test/fixtures'
import { boxToPercent, captionPlacement, contentRect, isVisibleAt } from './geometry'

describe('boxToPercent', () => {
  it('converts a 0-1000 box to CSS percentages', () => {
    expect(boxToPercent([100, 200, 400, 600])).toEqual({
      top: 10, left: 20, width: 40, height: 30,
    })
  })

  it('clamps a box that runs past the edge', () => {
    expect(boxToPercent([0, 0, 1000, 1000])).toEqual({
      top: 0, left: 0, width: 100, height: 100,
    })
  })
})

describe('contentRect', () => {
  it('is the whole element when the aspect ratios match', () => {
    expect(contentRect(1600, 900, 800, 450)).toEqual({ x: 0, y: 0, width: 800, height: 450 })
  })

  it('letterboxes a wide video in a tall box', () => {
    // 16:9 video inside a 400x400 element -> 400x225 centred vertically
    expect(contentRect(1600, 900, 400, 400)).toEqual({ x: 0, y: 87.5, width: 400, height: 225 })
  })

  it('pillarboxes a tall video in a wide box', () => {
    // 9:16 video inside a 400x400 element -> 225x400 centred horizontally
    expect(contentRect(900, 1600, 400, 400)).toEqual({ x: 87.5, y: 0, width: 225, height: 400 })
  })

  it('returns a zero rect before metadata has loaded', () => {
    expect(contentRect(0, 0, 400, 400)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('isVisibleAt', () => {
  const visible = { ...findingEdge, timestamp_seconds: 7, timestamp_end_seconds: 12 }

  it('is false for a finding with no timestamp', () => {
    expect(isVisibleAt({ ...visible, timestamp_seconds: null }, 7)).toBe(false)
  })

  it('shows the box from just before the timestamp until the end time', () => {
    expect(isVisibleAt(visible, 6.2)).toBe(false)
    expect(isVisibleAt(visible, 6.25)).toBe(true)
    expect(isVisibleAt(visible, 12)).toBe(true)
    expect(isVisibleAt(visible, 12.1)).toBe(false)
  })

  it('holds the box for the default window when no end time was returned', () => {
    const open = { ...visible, timestamp_end_seconds: null }
    expect(isVisibleAt(open, 8.5)).toBe(true)
    expect(isVisibleAt(open, 8.6)).toBe(false)
  })
})

describe('captionPlacement', () => {
  it('starts a label at its box and gives it the room to the right', () => {
    expect(captionPlacement({ top: 10, left: 20, width: 30, height: 30 })).toEqual({
      left: '20%', maxWidth: '80%',
    })
  })

  it('hangs a label off the right edge of a box with little room beside it', () => {
    // left 70 + width 25: a label starting at 70% has only 30% of the frame left.
    expect(captionPlacement({ top: 10, left: 70, width: 25, height: 20 })).toEqual({
      right: '5%', maxWidth: '95%',
    })
  })

  it('never lets a label reach past either edge of the frame', () => {
    for (const left of [0, 25, 55, 60, 61, 80, 99, 100]) {
      const place = captionPlacement({ top: 0, left, width: 5, height: 5 })
      const start = place.left !== undefined ? Number.parseFloat(place.left) : null
      const end = place.right !== undefined ? 100 - Number.parseFloat(place.right) : null
      const max = Number.parseFloat(place.maxWidth)
      expect(max).toBeGreaterThan(0)
      if (start !== null) expect(start + max).toBeLessThanOrEqual(100)
      if (end !== null) expect(end - max).toBeGreaterThanOrEqual(0)
    }
  })
})
