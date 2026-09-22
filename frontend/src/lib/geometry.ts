import type { Finding } from '../api/types'

export interface BoxPercent {
  top: number
  left: number
  width: number
  height: number
}

/** Gemini returns [y_min, x_min, y_max, x_max] normalised to 0-1000. */
export function boxToPercent(box: number[]): BoxPercent {
  const [yMin, xMin, yMax, xMax] = box
  const top = yMin / 10
  const left = xMin / 10
  return {
    top,
    left,
    width: Math.min(100 - left, (xMax - xMin) / 10),
    height: Math.min(100 - top, (yMax - yMin) / 10),
  }
}

export interface CaptionPlacement {
  left?: string
  right?: string
  maxWidth: string
}

/** Below this much room beside a box, a left-aligned label is not worth it. */
const MIN_CAPTION_ROOM_PCT = 40

/**
 * Where a hazard's label sits across the frame, guaranteed to stay inside it.
 *
 * A label aligned with the left edge of its box runs off the picture when the
 * box is over on the right, and the frame clips its overflow — half a title is
 * worse than a short one. So a box with little room beside it hangs its label
 * off its own right edge instead, and either way the label is capped at the
 * room it actually has, leaving `truncate` to shorten what still does not fit.
 */
export function captionPlacement(box: BoxPercent): CaptionPlacement {
  const room = 100 - box.left
  if (room >= MIN_CAPTION_ROOM_PCT) return { left: `${box.left}%`, maxWidth: `${room}%` }
  const rightEdge = Math.min(100, box.left + box.width)
  return { right: `${100 - rightEdge}%`, maxWidth: `${rightEdge}%` }
}

/** Roughly one character of a label, in CSS pixels, at the 11px it is drawn. */
const CAPTION_CHAR_PX = 6.2
/** A label's own horizontal padding and border. */
const CAPTION_PADDING_PX = 16
/** A short title still needs room; never treat a narrow box as a narrow label. */
const MIN_CAPTION_WIDTH_PCT = 14

/**
 * The room a label will actually take across the frame, in percentages.
 *
 * Measuring the box instead is what lets two labels overprint: a hazard boxed
 * around one worker's eyes is a few percent wide, and its title thirty. The
 * width is an estimate from the title's length, because the label is not laid
 * out yet when its neighbours are being placed.
 */
export function captionSpan(
  box: BoxPercent,
  title: string,
  frameWidth: number,
): { left: number; right: number } {
  const place = captionPlacement(box)
  const room = Number.parseFloat(place.maxWidth)
  const estimate =
    frameWidth > 0 ? ((title.length * CAPTION_CHAR_PX + CAPTION_PADDING_PX) / frameWidth) * 100 : room
  const width = Math.min(room, Math.max(estimate, MIN_CAPTION_WIDTH_PCT))
  if (place.left !== undefined) {
    const left = Number.parseFloat(place.left)
    return { left, right: left + width }
  }
  const right = 100 - Number.parseFloat(place.right as string)
  return { left: right - width, right }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where `object-contain` actually paints the media inside its element.
 *
 * Box coordinates are relative to the video frame, but the element is usually a
 * different shape, so the frame is letterboxed inside it. Positioning overlays
 * against the element instead of this rect misplaces every box.
 */
export function contentRect(
  naturalWidth: number,
  naturalHeight: number,
  elementWidth: number,
  elementHeight: number,
): Rect {
  if (!naturalWidth || !naturalHeight || !elementWidth || !elementHeight) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(elementWidth / naturalWidth, elementHeight / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return { x: (elementWidth - width) / 2, y: (elementHeight - height) / 2, width, height }
}

/** Whether a finding's hazard is on screen at `time` (seconds). */
export function isVisibleAt(finding: Finding, time: number, window = 1.5): boolean {
  if (finding.timestamp_seconds === null) return false
  const start = finding.timestamp_seconds
  const end = finding.timestamp_end_seconds ?? start + window
  return time >= start - window / 2 && time <= end
}

/**
 * How wide the marker track has to be to hold `count` whole hit targets.
 *
 * Never narrower than the space it was given, so a clip with a few hazards
 * still uses the full width and only a crowded one scrolls.
 */
export function markerTrackWidth(count: number, trackWidth: number, markerWidth: number): number {
  return Math.max(trackWidth, count * markerWidth)
}

/**
 * The left edge of each hazard marker, in pixels along the track.
 *
 * Positioning a marker at `timestamp / duration` alone is what collapses them:
 * Gemini stamps whole seconds, so several hazards routinely share one, and the
 * markers land on the exact same pixel — the count says six and both the eye
 * and the mouse find two. So markers are laid out rather than merely
 * positioned. Each starts where its time says; any that would overlap are
 * gathered into a run and the run is spread, a whole hit target apart, centred
 * on where its members belong, so a crowd at 0:01 opens around 0:01 instead of
 * shoving every later hazard down the track. Runs that grow into each other
 * merge and re-centre. A final pair of passes keeps the ends on the track, and
 * `markerTrackWidth` guarantees the room all of this needs.
 *
 * `times` must be ascending; the result is too, which is what keeps the tab
 * order the order of the footage.
 */
export function spreadMarkers(
  times: number[],
  duration: number,
  trackWidth: number,
  markerWidth: number,
): number[] {
  const count = times.length
  if (count === 0) return []
  const last = markerTrackWidth(count, trackWidth, markerWidth) - markerWidth
  const ideal = times.map((at) => {
    const ratio = duration > 0 ? at / duration : 0
    return Math.min(last, Math.max(0, ratio * last))
  })

  // A run of markers, kept as a count and the sum of where its members want to
  // be, which is all that is needed to re-centre it when two runs merge.
  const runs: { size: number; wanted: number }[] = []
  const startOf = (run: { size: number; wanted: number }) =>
    run.wanted / run.size - ((run.size - 1) * markerWidth) / 2
  for (const wanted of ideal) {
    runs.push({ size: 1, wanted })
    while (runs.length > 1) {
      const right = runs[runs.length - 1]
      const left = runs[runs.length - 2]
      if (startOf(left) + left.size * markerWidth <= startOf(right)) break
      runs.splice(runs.length - 2, 2, { size: left.size + right.size, wanted: left.wanted + right.wanted })
    }
  }

  const out: number[] = []
  for (const run of runs) {
    const start = startOf(run)
    for (let i = 0; i < run.size; i += 1) out.push(start + i * markerWidth)
  }
  // Centring can hang a run off either end of the track; pull it back on.
  out[0] = Math.max(0, out[0])
  for (let i = 1; i < count; i += 1) out[i] = Math.max(out[i], out[i - 1] + markerWidth)
  for (let i = count - 1; i >= 0; i -= 1) {
    const ceiling = i === count - 1 ? last : out[i + 1] - markerWidth
    out[i] = Math.max(0, Math.min(out[i], ceiling))
  }
  return out
}
