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
