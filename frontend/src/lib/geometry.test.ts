import { describe, expect, it } from 'vitest'
import { findingEdge } from '../test/fixtures'
import {
  boxToPercent,
  captionPlacement,
  captionSpan,
  contentRect,
  isVisibleAt,
  markerTrackWidth,
  spreadMarkers,
} from './geometry'

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

describe('captionSpan', () => {
  const box = { top: 40, left: 10, width: 6, height: 10 }

  it('is as wide as the label, not as wide as the box it names', () => {
    const span = captionSpan(box, 'Lack of Eye Protection for Workers', 800)
    expect(span.left).toBe(10)
    expect(span.right - span.left).toBeGreaterThan(box.width * 3)
  })

  it('never claims more room than the label is allowed', () => {
    const span = captionSpan(box, 'A title far longer than any frame could ever hold, on and on', 800)
    expect(span.right).toBeLessThanOrEqual(100)
  })

  it('gives a short title a usable width', () => {
    expect(captionSpan(box, 'Ice', 800).right - 10).toBeGreaterThanOrEqual(14)
  })

  it('runs back from the right edge for a label hung off one', () => {
    const span = captionSpan({ top: 10, left: 70, width: 25, height: 20 }, 'Electrical Cables', 800)
    expect(span.right).toBe(95)
    expect(span.left).toBeLessThan(95)
  })
})

describe('spreadMarkers', () => {
  const MARKER = 44
  const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i])

  it('places a lone marker in proportion to its time', () => {
    // 5s of 20s, across a 444px track with a 44px marker: a quarter of 400px.
    expect(spreadMarkers([5], 20, 444, MARKER)).toEqual([100])
  })

  it('keeps well-separated markers where they belong', () => {
    expect(spreadMarkers([0, 10, 20], 20, 444, MARKER)).toEqual([0, 200, 400])
  })

  it('pushes coincident markers apart by a whole hit target', () => {
    // The whole point: five hazards Gemini stamped at the same second.
    const xs = spreadMarkers([1, 1, 1, 1, 1], 20, 400, MARKER)
    expect(new Set(xs).size).toBe(5)
    expect(gaps(xs).every((g) => g >= MARKER)).toBe(true)
  })

  it('opens a cluster around its own moment', () => {
    // Three hazards at 10s of 20s: the run straddles the halfway point rather
    // than starting there, so the track still reads as time.
    expect(spreadMarkers([10, 10, 10], 20, 444, MARKER)).toEqual([156, 200, 244])
  })

  it('leaves a distant hazard where it belongs', () => {
    // A crowd at the start must not drag an unrelated hazard at 0:18 with it.
    const xs = spreadMarkers([1, 1, 1, 18], 20, 444, MARKER)
    expect(xs[3]).toBe(360)
    expect(gaps(xs).every((g) => g >= MARKER)).toBe(true)
  })

  it('keeps time order after spreading', () => {
    const xs = spreadMarkers([1, 1, 1, 9, 9], 20, 400, MARKER)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('pulls a cluster at the end back onto the track', () => {
    const xs = spreadMarkers([20, 20, 20], 20, 400, MARKER)
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(400 - MARKER)
    expect(gaps(xs).every((g) => g >= MARKER)).toBe(true)
  })

  it('fits eight coincident hazards on a 375px phone track', () => {
    // A 375px viewport leaves roughly 343px of track. Eight 44px targets need
    // 352, so the track scrolls — but every marker is still whole and separate.
    const track = 343
    const xs = spreadMarkers(new Array(8).fill(1), 20, track, MARKER)
    expect(xs).toHaveLength(8)
    expect(gaps(xs).every((g) => g >= MARKER)).toBe(true)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(markerTrackWidth(8, track, MARKER) - MARKER)
    expect(markerTrackWidth(8, track, MARKER)).toBe(8 * MARKER)
  })

  it('never asks for less room than the track already has', () => {
    expect(markerTrackWidth(2, 343, MARKER)).toBe(343)
  })

  it('returns nothing for no hazards', () => {
    expect(spreadMarkers([], 20, 400, MARKER)).toEqual([])
  })

  it('stacks markers from the start when the duration is unknown', () => {
    const xs = spreadMarkers([1, 2], 0, 400, MARKER)
    expect(xs).toEqual([0, MARKER])
  })
})
